/**
 * StudentPlanCard.tsx — "Meu Plano" (área do aluno).
 *
 * Pagamentos via Mercado Pago (Checkout Pro). O card NUNCA libera plano:
 * o checkout apenas abre o link gerado no backend, e a confirmação real
 * chega pelo webhook validado. Ao voltar do Mercado Pago mostramos só um
 * aviso informativo.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, ChevronDown, ExternalLink, Loader2, RefreshCw, Repeat } from "lucide-react";
import { formatCents, toCents } from "@/lib/studentPlans";
import { formatDatePtBR } from "@/lib/formatDate";
import { useMyStudentSubscription, useStudentPlanCatalog } from "@/hooks/useStudentPlans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active:   { label: "Em dia",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pending:  { label: "Pendente",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  overdue:  { label: "Em atraso", cls: "bg-red-100 text-red-700 border-red-200" },
  canceled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
  ended:    { label: "Encerrado", cls: "bg-muted text-muted-foreground border-border" },
  suspended:{ label: "Suspenso",  cls: "bg-muted text-muted-foreground border-border" },
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Registrado pelo treinador",
  gateway: "Pago pelo checkout",
};

const RETURN_MESSAGE: Record<string, string> = {
  retorno: "Pagamento recebido pelo Mercado Pago. A liberação acontece assim que a confirmação chegar.",
  pendente: "Pagamento pendente no Mercado Pago. Assim que for aprovado, seu plano é atualizado automaticamente.",
  falha: "O pagamento não foi concluído. Você pode tentar novamente.",
};

interface ChargeRow {
  id: string; description: string; amount: number; status: string;
  due_date: string | null; paid_at: string | null; payment_method: string | null;
  source: string | null; checkout_url: string | null; receipt_url: string | null;
  card_installments: number | null; provider: string | null;
  mercado_pago_payment_id: string | null;
}

export function StudentPlanCard({ userId }: { userId: string | null | undefined }) {
  const { data: sub } = useMyStudentSubscription(userId);
  const { data: catalog = [] } = useStudentPlanCatalog(sub?.coach_id ?? null);
  const [open, setOpen] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  // Retorno do checkout: apenas mensagem informativa (o webhook é quem libera).
  useEffect(() => {
    const state = params.get("checkout");
    if (!state) return;
    const message = RETURN_MESSAGE[state];
    if (message) toast.info(message);
    qc.invalidateQueries({ queryKey: ["my-plan-charges", userId] });
    qc.invalidateQueries({ queryKey: ["my-student-subscription", userId] });
    params.delete("checkout");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: charges = [] } = useQuery({
    queryKey: ["my-plan-charges", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await sb
        .from("coach_finances")
        .select(
          "id, description, amount, status, due_date, paid_at, payment_method, source, checkout_url, receipt_url, card_installments, provider, mercado_pago_payment_id",
        )
        .eq("student_id", userId)
        .order("due_date", { ascending: false })
        .limit(24);
      return (data ?? []) as ChargeRow[];
    },
  });

  const pending = charges.find((c) => c.status === "pending" && Number(c.amount) > 0);

  const openCheckout = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-create-preference", { body });
      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || "Não foi possível abrir o checkout");
      qc.invalidateQueries({ queryKey: ["my-plan-charges", userId] });
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir o checkout");
    } finally {
      setBusy(null);
    }
  };

  const status = sub ? (STATUS_LABEL[sub.status] ?? STATUS_LABEL.pending) : null;
  const availablePlans = catalog.filter((p) => p.is_active);

  return (
    <Card className="p-4 bg-card/60 border border-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-sm font-bold text-foreground">
              {sub ? `Plano ${sub.plan_name}` : "Meu Plano"}
            </h3>
            {status && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>
                {status.label}
              </span>
            )}
            {pending && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                Pagamento pendente
              </span>
            )}
          </div>
          {sub ? (
            <>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCents(sub.price_cents)} · ciclo de {sub.cycle_months}{" "}
                {sub.cycle_months === 1 ? "mês" : "meses"}
              </p>
              {sub.next_due_date && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Próximo vencimento: {formatDatePtBR(sub.next_due_date)}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Você ainda não tem um plano contratado. Escolha um plano abaixo para começar.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Ver histórico de cobranças"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="grid gap-2 mt-3">
        {pending ? (
          <>
            <Button
              size="sm"
              disabled={busy === "pending"}
              onClick={() => openCheckout({ finance_id: pending.id }, "pending")}
            >
              {busy === "pending" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              Pagar {formatCents(toCents(Number(pending.amount)))}
            </Button>
            {pending.checkout_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(pending.checkout_url!, "_blank", "noopener")}
              >
                Continuar checkout aberto <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
          </>
        ) : sub ? (
          <Button
            size="sm"
            disabled={busy === "renew"}
            onClick={() => {
              const plan = availablePlans.find((p) => p.slug === sub.plan_slug);
              if (!plan) {
                toast.error("Plano atual indisponível no catálogo. Fale com seu treinador.");
                return;
              }
              openCheckout({ plan_id: plan.id }, "renew");
            }}
          >
            {busy === "renew" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
            Renovar plano
          </Button>
        ) : null}

        <Button size="sm" variant="outline" onClick={() => setShowPlans((v) => !v)}>
          <Repeat className="w-3.5 h-3.5 mr-1" />
          {sub ? "Trocar plano" : "Escolher plano"}
        </Button>
      </div>

      {showPlans && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          {availablePlans.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum plano disponível no momento.</p>
          ) : (
            availablePlans.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{plan.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCents(plan.price_cents)} · {plan.duration_months}{" "}
                    {plan.duration_months === 1 ? "mês" : "meses"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={plan.slug === sub?.plan_slug ? "outline" : "default"}
                  disabled={busy === plan.id}
                  onClick={() => openCheckout({ plan_id: plan.id }, plan.id)}
                >
                  {busy === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Contratar"}
                </Button>
              </div>
            ))
          )}
          <p className="text-[10px] text-muted-foreground">
            A troca de plano só é aplicada após a confirmação do pagamento pelo Mercado Pago.
          </p>
        </div>
      )}

      {open && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          {charges.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma cobrança registrada ainda.</p>
          ) : (
            charges.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{c.description}</p>
                  <p className="text-muted-foreground">
                    {c.paid_at
                      ? `Pago em ${formatDatePtBR(c.paid_at)}`
                      : c.due_date
                        ? `Vence em ${formatDatePtBR(c.due_date)}`
                        : "Sem vencimento"}
                    {c.source && ` · ${SOURCE_LABEL[c.source] ?? c.source}`}
                    {c.card_installments && c.card_installments > 1 && ` · ${c.card_installments}x`}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-foreground">
                  {formatCents(toCents(Number(c.amount)))}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
