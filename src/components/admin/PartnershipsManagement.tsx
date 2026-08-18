import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCents } from "@/lib/studentPlans";
import { formatRateBp } from "@/lib/partnerPricing";
import { useAllPartners, usePartnerCommissions } from "@/hooks/usePartnerships";

const PIX_TYPES = ["cpf", "cnpj", "email", "telefone", "aleatoria"];

export function PartnershipsManagement() {
  const qc = useQueryClient();
  const { data: partners = [], isLoading } = useAllPartners(true);
  const { data: commissions = [] } = usePartnerCommissions({ all: true });

  const [form, setForm] = useState({
    userId: "",
    coachId: "",
    commissionRateBp: 1000,
    status: "active",
    pixType: "email",
    pixKey: "",
    pixHolderName: "",
  });
  const [busy, setBusy] = useState(false);

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
    if (!form.userId || !form.coachId) {
      toast({ title: "Informe o ID da influenciadora e do coach", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.functions.invoke("manage-partner-profile", { body: form });
    setBusy(false);
    if (error) {
      toast({ title: "Falha ao salvar parceria", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["all-partners"] });
    setForm((f) => ({ ...f, userId: "", pixKey: "", pixHolderName: "" }));
    toast({ title: "Parceria salva" });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Nova parceria / editar</h2>
        <div className="grid md:grid-cols-3 gap-2">
          <Input placeholder="ID da influenciadora (user id)" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value.trim() })} />
          <Input placeholder="ID do coach" value={form.coachId} onChange={(e) => setForm({ ...form, coachId: e.target.value.trim() })} />
          <Input
            type="number" min={0} max={10000} placeholder="Comissão (bp — 1000 = 10%)"
            value={form.commissionRateBp}
            onChange={(e) => setForm({ ...form, commissionRateBp: Number(e.target.value) })}
          />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
            <option value="revoked">Revogada</option>
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.pixType} onChange={(e) => setForm({ ...form, pixType: e.target.value })}>
            {PIX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input placeholder="Chave Pix" value={form.pixKey} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
          <Input placeholder="Nome da titular" value={form.pixHolderName} onChange={(e) => setForm({ ...form, pixHolderName: e.target.value })} />
          <Button onClick={save} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A comissão é sempre calculada no backend sobre o valor final pago. O padrão é 10% (1000 bp).
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
                <p className="text-sm font-semibold truncate">{names[p.user_id] ?? p.pix_holder_name ?? p.user_id.slice(0, 8)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Coach: {names[p.coach_id] ?? p.coach_id.slice(0, 8)} · {formatRateBp(p.commission_rate_bp)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline">{p.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setForm({
                  userId: p.user_id,
                  coachId: p.coach_id,
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
