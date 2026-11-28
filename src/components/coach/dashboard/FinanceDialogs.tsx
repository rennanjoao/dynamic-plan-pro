/**
 * Diálogos do Financeiro do coach: cobrar, receber e liberar acesso.
 * As regras de preço, desconto e vencimento ficam no banco (studentAccess.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2, CalendarClock, BellRing, XCircle } from "lucide-react";
import { sb } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FinanceRecord } from "@/hooks/useCoachFinances";
import { PAYMENT_METHODS, chargeCents, copyPaymentLink } from "@/lib/financeActions";
import type { StudentPlan } from "@/lib/studentPlans";
import { planKindOf } from "@/lib/serviceContract";
import {
  addDaysKey, createPlanCharge, fetchPlanQuote, formatBRL, formatDay, settleCharge,
  type PlanQuote,
} from "@/lib/studentAccess";

const KIND_LABEL: Record<string, string> = { coaching: "Consultoria", access: "Só acesso", one_off: "Avulso" };

function periodText(p: { duration_months: number; kind?: string | null }): string {
  if (planKindOf(p) === "one_off") return "avulso";
  return p.duration_months === 1 ? "por mês" : `${p.duration_months} meses`;
}

// ── Cobrar ─────────────────────────────────────────────────────────────────
export function ChargeDialog({ open, onOpenChange, student, plans, coachId, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: { id: string; name: string } | null;
  plans: StudentPlan[];
  coachId: string;
  onDone: () => void;
}) {
  const [slug, setSlug] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [custom, setCustom] = useState({ description: "", amount: "" });
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlug(""); setDueDate(""); setCustom({ description: "", amount: "" }); setQuote(null);
  }, [open, student?.id]);

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    if (!student || !slug || slug === "custom") return;
    setQuoting(true);
    fetchPlanQuote(student.id, slug)
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
  }, [slug, student]);

  const plan = plans.find((p) => p.slug === slug) ?? null;
  const isCustom = slug === "custom";
  const customCents = Math.round(Number(custom.amount.replace(",", ".")) * 100) || 0;

  const submit = async () => {
    if (!student || saving) return;
    setSaving(true);
    try {
      let financeId: string;
      if (isCustom) {
        if (!custom.description.trim() || customCents <= 0) throw new Error("Informe a descrição e o valor.");
        // Valor livre = cobrança avulsa: não mexe no plano nem no acesso.
        const { data, error } = await sb.from("coach_finances").insert({
          coach_id: coachId,
          student_id: student.id,
          description: custom.description.trim(),
          amount: customCents / 100,
          amount_cents: customCents,
          due_date: dueDate || null,
          status: "pending",
          charge_kind: "one_off",
          source: "manual",
        }).select("id").single();
        if (error) throw error;
        financeId = data.id as string;
      } else {
        if (!plan) throw new Error("Escolha um plano.");
        financeId = await createPlanCharge({ studentId: student.id, planSlug: plan.slug, dueDate: dueDate || null });
      }
      toast.success(`Cobrança criada para ${student.name}.`, {
        action: { label: "Copiar link", onClick: () => { void copyPaymentLink({ id: financeId, checkout_url: null }); } },
      });
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar cobrança");
    } finally {
      setSaving(false);
    }
  };

  const groups = useMemo(() => {
    const order = ["coaching", "access", "one_off"];
    return order
      .map((k) => ({ kind: k, items: plans.filter((p) => planKindOf(p) === k) }))
      .filter((g) => g.items.length > 0);
  }, [plans]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Nova cobrança</DialogTitle>
          <DialogDescription>Para {student?.name ?? "o aluno"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="charge-plan" className="text-xs">O que cobrar</Label>
            <Select value={slug} onValueChange={setSlug}>
              <SelectTrigger id="charge-plan" className="h-10"><SelectValue placeholder="Escolha um plano" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectGroup key={g.kind}>
                    <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">{KIND_LABEL[g.kind]}</SelectLabel>
                    {g.items.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name} · {formatBRL(p.price_cents)} · {periodText(p)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                <SelectSeparator />
                <SelectItem value="custom">Outro valor (avulso)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="charge-desc" className="text-xs">Descrição</Label>
                <Input id="charge-desc" value={custom.description} onChange={(e) => setCustom((c) => ({ ...c, description: e.target.value }))} placeholder="Ex.: Avaliação extra" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="charge-amount" className="text-xs">Valor (R$)</Label>
                <Input id="charge-amount" inputMode="decimal" value={custom.amount} onChange={(e) => setCustom((c) => ({ ...c, amount: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
          )}

          {plan && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs space-y-1" aria-live="polite">
              {quoting ? (
                <p className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Calculando valor…</p>
              ) : quote ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-foreground">{quote.name}</span>
                    <span className="text-sm font-bold text-foreground">{formatBRL(quote.final_cents)}</span>
                  </div>
                  {quote.partner_applied && (
                    <p className="text-primary font-medium">
                      10% de parceria (código {quote.partner_code}) no 1º pagamento · de {formatBRL(quote.list_cents)}
                    </p>
                  )}
                  {planKindOf(quote) === "access" && <p className="text-muted-foreground">Mantém o app e os check-ins, sem alertas de acompanhamento para você.</p>}
                  {planKindOf(quote) === "one_off" && <p className="text-muted-foreground">Avulso: não muda o período do plano. Você recebe um aviso quando for pago.</p>}
                </>
              ) : (
                <p className="text-muted-foreground">{formatBRL(plan.price_cents)} · valor final confirmado ao criar.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="charge-due" className="text-xs">Vencimento <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="charge-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Em branco: vence no fim do período já pago (ou hoje). O acesso só pausa 7 dias depois do vencimento.
            </p>
          </div>

          <Button onClick={submit} disabled={saving || (!plan && !isCustom)} className="w-full">
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />}
            Criar cobrança
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Receber ────────────────────────────────────────────────────────────────
export function ReceiveDialog({ open, onOpenChange, studentName, charges, onChanged }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentName: string;
  charges: FinanceRecord[];
  onChanged: () => void;
}) {
  const [method, setMethod] = useState("pix");
  const [settling, setSettling] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [editingDue, setEditingDue] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => { if (open) { setMethod("pix"); setEditingDue(null); } }, [open]);

  const settle = async (f: FinanceRecord) => {
    setSettling(f.id);
    try {
      const r = await settleCharge(f.id, method);
      toast.success(
        r.period_end ? `Pagamento registrado. Plano em dia até ${formatDay(r.period_end)}.` : "Pagamento registrado.",
      );
      if (r.commission_created) toast.success("Comissão da parceira gerada.");
      onChanged();
      if (charges.length <= 1) onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar pagamento");
    } finally {
      setSettling(null);
    }
  };

  const saveDue = async () => {
    if (!editingDue) return;
    setBusy(editingDue.id);
    const { error } = await sb.from("coach_finances").update({ due_date: editingDue.value || null }).eq("id", editingDue.id).eq("status", "pending");
    setBusy(null);
    if (error) { toast.error("Não foi possível alterar o vencimento."); return; }
    toast.success("Vencimento alterado.");
    setEditingDue(null);
    onChanged();
  };

  const restoreAlert = async (id: string) => {
    setBusy(id);
    const { error } = await sb.rpc("restore_billing_alert", { p_finance_id: id });
    setBusy(null);
    if (error) toast.error("Não foi possível reexibir o aviso.");
    else toast.success("O aviso volta a aparecer no app do aluno.");
  };

  const cancelCharge = async (f: FinanceRecord) => {
    if (!(await confirm({
      title: "Cancelar cobrança?",
      description: `"${f.description}" sai da lista do aluno e deixa de contar para o bloqueio. O histórico fica guardado.`,
      confirmLabel: "Cancelar cobrança",
      destructive: true,
    }))) return;
    setBusy(f.id);
    const { error } = await sb.from("coach_finances").update({ status: "canceled" }).eq("id", f.id).eq("status", "pending");
    if (!error && f.subscription_id) {
      // Contrato que nunca foi pago fica sem efeito (o próximo é criado de novo).
      const { count } = await sb.from("coach_finances").select("id", { count: "exact", head: true })
        .eq("subscription_id", f.subscription_id).eq("status", "paid");
      if (!count) await sb.from("student_subscriptions").update({ status: "canceled" }).eq("id", f.subscription_id).eq("status", "pending");
    }
    setBusy(null);
    if (error) { toast.error("Não foi possível cancelar."); return; }
    toast.success("Cobrança cancelada.");
    onChanged();
    if (charges.length <= 1) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receber</DialogTitle>
          <DialogDescription>{studentName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {charges.map((f) => {
            const cents = chargeCents(f);
            return (
              <section key={f.id} className="rounded-xl border border-border p-3 space-y-3" aria-label={f.description}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{f.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.due_date ? `Vence ${formatDay(f.due_date)}` : "Sem vencimento"}
                      {f.charge_kind === "one_off" ? " · avulso" : ""}
                    </p>
                    {f.discount_note && <p className="text-[11px] text-primary font-medium mt-0.5">{f.discount_note}</p>}
                  </div>
                  <p className="text-base font-bold text-foreground shrink-0">{formatBRL(cents)}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={linking === f.id}
                  onClick={async () => { setLinking(f.id); await copyPaymentLink(f); setLinking(null); onChanged(); }}
                >
                  {linking === f.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                  {f.checkout_url ? "Copiar link de pagamento" : "Gerar e copiar link de pagamento"}
                </Button>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Forma de pagamento recebida"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-9" disabled={settling === f.id} onClick={() => void settle(f)}>
                    {settling === f.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                    Já recebi
                  </Button>
                </div>

                {editingDue?.id === f.id ? (
                  <div className="flex items-center gap-2">
                    <Input type="date" className="h-8 text-xs" value={editingDue.value} aria-label="Novo vencimento"
                      onChange={(e) => setEditingDue({ id: f.id, value: e.target.value })} />
                    <Button size="sm" className="h-8" disabled={busy === f.id} onClick={() => void saveDue()}>Salvar</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingDue(null)}>Voltar</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setEditingDue({ id: f.id, value: f.due_date ?? "" })}>
                      <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> Alterar vencimento
                    </button>
                    <button type="button" disabled={busy === f.id} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void restoreAlert(f.id)}>
                      <BellRing className="w-3.5 h-3.5" aria-hidden="true" /> Reexibir aviso
                    </button>
                    <button type="button" disabled={busy === f.id} className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => void cancelCharge(f)}>
                      <XCircle className="w-3.5 h-3.5" aria-hidden="true" /> Cancelar cobrança
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Pagamento pelo link é confirmado sozinho. "Já recebi" é para PIX ou dinheiro recebidos por fora: ativa o plano do mesmo jeito.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Liberar acesso ─────────────────────────────────────────────────────────
export function GrantAccessDialog({ open, onOpenChange, student, current, coachId, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: { id: string; name: string } | null;
  current: string | null;
  coachId: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDate(current ?? addDaysKey(30)); }, [open, current]);

  const save = async (value: string | null) => {
    if (!student) return;
    setSaving(true);
    const { error } = await sb.from("coach_students")
      .update({ access_granted_until: value })
      .eq("coach_id", coachId).eq("student_id", student.id);
    setSaving(false);
    if (error) { toast.error("Não foi possível salvar."); return; }
    toast.success(value ? `Acesso liberado até ${formatDay(value)}.` : "Liberação removida.");
    onDone();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Liberar acesso</DialogTitle>
          <DialogDescription>
            {student?.name}: usa o app normalmente até a data, mesmo sem pagamento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Atalhos">
            {[7, 15, 30].map((d) => (
              <Button key={d} type="button" variant={date === addDaysKey(d) ? "default" : "outline"} size="sm" className="flex-1"
                onClick={() => setDate(addDaysKey(d))}>
                {d} dias
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grant-date" className="text-xs">Liberado até</Label>
            <Input id="grant-date" type="date" value={date} min={addDaysKey(0)} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button className="w-full" disabled={saving || !date} onClick={() => void save(date)}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />}
            Liberar até {date ? formatDay(date) : "…"}
          </Button>
          {current && (
            <Button variant="ghost" className="w-full text-muted-foreground" disabled={saving} onClick={() => void save(null)}>
              Remover liberação
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
