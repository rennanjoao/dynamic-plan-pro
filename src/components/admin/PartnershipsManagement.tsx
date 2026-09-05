import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatCents } from "@/lib/studentPlans";
import { formatRateBp } from "@/lib/partnerPricing";
import { useAllPartners, usePartnerCommissions } from "@/hooks/usePartnerships";
import { useEligibleUsers } from "@/hooks/useAdminUsers";

const PIX_TYPES = ["cpf", "cnpj", "email", "phone", "random"];

const EMPTY_FORM = {
  userId: "",
  commissionRateBp: 1000,
  status: "active",
  pixType: "email",
  pixKey: "",
  pixHolderName: "",
};

export function PartnershipsManagement() {
  const qc = useQueryClient();
  const { data: partners = [], isLoading } = useAllPartners(true);
  const { data: commissions = [] } = usePartnerCommissions({ all: true });
  const { data: eligible, isLoading: loadingEligible, isError: eligibleError } = useEligibleUsers(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const candidates = eligible?.partnerCandidates ?? [];

  const { data: names = {} } = useQuery({
    queryKey: ["partner-names", partners.map((p) => p.user_id).join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const ids = [...new Set(partners.flatMap((p) => [p.user_id, p.coach_id]))];
      if (ids.length === 0) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.full_name) map[r.user_id] = r.full_name; });
      return map;
    },
    enabled: partners.length > 0,
  });

  const displayName = (id: string) =>
    names[id] ?? candidates.find((c) => c.id === id)?.full_name ?? eligible?.coaches.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);

  const selectedCandidate = candidates.find((c) => c.id === form.userId) ?? null;

  const totals = useMemo(() => {
    let pending = 0, paid = 0;
    commissions.forEach((c) => {
      if (!c.eligible) return;
      if (c.status === "paid") paid += c.commission_amount_cents;
      else if (c.status !== "canceled") pending += c.commission_amount_cents;
    });
    return { pending, paid };
  }, [commissions]);

  const save = async () => {
    if (!form.userId) {
      toast({ title: "Selecione a influenciadora", variant: "destructive" });
      return;
    }
    setBusy(true);
    // O coach NUNCA é enviado pelo navegador: o backend deriva o vínculo real
    // (partner_profiles existente ou coach_students ativo).
    const { data, error } = await supabase.functions.invoke("manage-partner-profile", { body: form });
    setBusy(false);
    const fnError = (data as { error?: string })?.error;
    if (error || fnError) {
      toast({ title: "Falha ao salvar parceria", description: fnError ?? error?.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: queryKeys.allPartners() });
    qc.invalidateQueries({ queryKey: ["admin-eligible-users"] });
    setForm(EMPTY_FORM);
    toast({ title: "Parceria salva" });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Nova parceria / editar</h2>

        {loadingEligible && (
          <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando usuários elegíveis…</p>
        )}
        {eligibleError && <p className="text-xs text-destructive">Não foi possível carregar a lista de usuários elegíveis.</p>}
        {!loadingEligible && !eligibleError && candidates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma candidata disponível. Só é possível ativar como parceira quem já tem vínculo ativo com um coach.
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Influenciadora</Label>
            <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}{c.email ? ` · ${c.email}` : ""}{c.is_partner ? " · já é parceira" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Coach vinculado</Label>
            <Input
              readOnly
              value={selectedCandidate?.coach_id ? displayName(selectedCandidate.coach_id) : "Derivado automaticamente"}
              className="bg-muted/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Comissão (bp — 1000 = 10%)</Label>
            <Input
              type="number" min={0} max={10000}
              value={form.commissionRateBp}
              onChange={(e) => setForm({ ...form, commissionRateBp: Number(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="inactive">Inativa</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de chave Pix</Label>
            <Select value={form.pixType} onValueChange={(v) => setForm({ ...form, pixType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PIX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Chave Pix</Label>
            <Input value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nome da titular</Label>
            <Input value={form.pixHolderName} onChange={(e) => setForm({ ...form, pixHolderName: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={save} disabled={busy || !form.userId} className="gap-1.5 w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          A comissão é sempre calculada no backend sobre o valor final pago. O padrão é 10% (1000 bp).
          O coach é derivado do vínculo ativo — não é escolhido manualmente.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Influenciadoras</h2>
          <div className="text-xs text-muted-foreground">
            A pagar <span className="font-bold text-amber-500">{formatCents(totals.pending)}</span> · Pago{" "}
            <span className="font-bold text-emerald-500">{formatCents(totals.paid)}</span>
          </div>
        </div>
        {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!isLoading && partners.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma parceria cadastrada.</p>}
        <div className="space-y-1.5">
          {partners.map((p) => (
            <div key={p.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{names[p.user_id] ?? p.pix_holder_name ?? displayName(p.user_id)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Coach: {displayName(p.coach_id)} · {formatRateBp(p.commission_rate_bp)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline">{p.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setForm({
                  userId: p.user_id,
                  commissionRateBp: p.commission_rate_bp,
                  status: p.status,
                  pixType: p.pix_type ?? "email",
                  pixKey: p.pix_key ?? "",
                  pixHolderName: p.pix_holder_name ?? "",
                })}>Editar</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PartnershipsManagement;
