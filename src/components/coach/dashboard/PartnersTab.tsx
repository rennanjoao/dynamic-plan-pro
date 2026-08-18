import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Heart, Loader2, Percent, Plus, Ticket, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCents } from "@/lib/studentPlans";
import { formatRateBp } from "@/lib/partnerPricing";
import {
  useCoachPartners,
  useCoachAccessCodes,
  usePartnerCommissions,
} from "@/hooks/usePartnerships";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  approved: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  canceled: "bg-muted text-muted-foreground border-border",
};

export function PartnersTab({ coachId }: { coachId: string | null }) {
  const qc = useQueryClient();
  const { data: partners = [], isLoading } = useCoachPartners(coachId);
  const { data: codes = [] } = useCoachAccessCodes(coachId);
  const { data: commissions = [] } = usePartnerCommissions({ coachId });

  const [kind, setKind] = useState<"student" | "partner">("student");
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [commissionPct, setCommissionPct] = useState<string>("10");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const { data: profileNames = {} } = useQuery({
    queryKey: ["coach-partner-names", partners.map((p) => p.user_id).join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const ids = partners.map((p) => p.user_id);
      if (ids.length === 0) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.full_name) map[r.user_id] = r.full_name; });
      return map;
    },
    enabled: partners.length > 0,
  });

  const partnerName = useMemo(() => {
    const m = new Map<string, string>();
    partners.forEach((p) =>
      m.set(p.user_id, profileNames[p.user_id] || p.pix_holder_name || p.user_id.slice(0, 8)),
    );
    return m;
  }, [partners, profileNames]);

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    commissions.forEach((c) => {
      if (!c.eligible) return;
      if (c.status === "paid") paid += c.commission_amount_cents;
      else if (c.status !== "canceled") pending += c.commission_amount_cents;
    });
    return { pending, paid };
  }, [commissions]);

  const generateCode = async () => {
    let commissionBp: number | null = null;
    if (kind === "partner") {
      const pct = Number(String(commissionPct).replace(",", "."));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast({ title: "Comissão inválida", description: "Informe um valor entre 0 e 100%.", variant: "destructive" });
        return;
      }
      commissionBp = Math.round(pct * 100);
    }

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("generate-access-code", {
      body: {
        kind,
        partnerId: kind === "student" ? selectedPartner || null : null,
        commission_bp: commissionBp,
        note: note || null,
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Não foi possível gerar o código", description: error.message, variant: "destructive" });
      return;
    }
    setNote("");
    qc.invalidateQueries({ queryKey: ["coach-access-codes", coachId] });
    const code = (data as { accessCode?: { code?: string } })?.accessCode?.code;
    if (code) {
      navigator.clipboard?.writeText(code).catch(() => undefined);
      toast({ title: `Código ${code} gerado`, description: "Copiado para a área de transferência." });
    }
  };

  const saveCommission = async (userId: string) => {
    const pct = Number(String(editing[userId] ?? "").replace(",", "."));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast({ title: "Comissão inválida", description: "Informe um valor entre 0 e 100%.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("partner_profiles")
      .update({ commission_rate_bp: Math.round(pct * 100) })
      .eq("user_id", userId);
    setBusy(false);
    if (error) {
      toast({ title: "Falha ao salvar comissão", description: error.message, variant: "destructive" });
      return;
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    qc.invalidateQueries({ queryKey: ["coach-partners", coachId] });
    toast({ title: "Comissão atualizada" });
  };

  const markPaid = async (commissionIds: string[]) => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("mark-commission-paid", { body: { commissionIds } });
    setBusy(false);
    if (error) {
      toast({ title: "Falha ao marcar como paga", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["partner-commissions", coachId] });
    toast({ title: "Comissão marcada como paga" });
  };

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Influenciadoras</p>
          <p className="text-2xl font-bold mt-1">{partners.filter((p) => p.status === "active").length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Comissões a pagar</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">{formatCents(totals.pending)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Já pago</p>
          <p className="text-2xl font-bold mt-1 text-emerald-500">{formatCents(totals.paid)}</p>
        </CardContent></Card>
      </div>

      {/* Influenciadoras e comissões individuais */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Minhas influenciadoras</h3>
        {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!isLoading && partners.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma influenciadora ainda. Gere um “Convite de parceria” abaixo e envie o código para ela.
          </p>
        )}
        <div className="space-y-1.5">
          {partners.map((p) => {
            const draft = editing[p.user_id];
            return (
              <div key={p.user_id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{partnerName.get(p.user_id)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Comissão atual: {formatRateBp(p.commission_rate_bp)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{p.status === "active" ? "Ativa" : p.status}</Badge>
                  {draft === undefined ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setEditing((prev) => ({ ...prev, [p.user_id]: String(p.commission_rate_bp / 100) }))}
                    >
                      <Percent className="w-3.5 h-3.5" /> Editar comissão
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" min={0} max={100} step="0.5"
                        className="h-9 w-20"
                        value={draft}
                        onChange={(e) => setEditing((prev) => ({ ...prev, [p.user_id]: e.target.value }))}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                      <Button size="sm" disabled={busy} onClick={() => saveCommission(p.user_id)} className="gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Salvar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>

      {/* Geração de código */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Ticket className="w-4 h-4 text-primary" /> Gerar código de acesso</h3>
        <div className="grid md:grid-cols-3 gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as "student" | "partner")}
          >
            <option value="student">Código de aluno</option>
            <option value="partner">Convite de parceria (vira influenciadora)</option>
          </select>
          {kind === "student" ? (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedPartner}
              onChange={(e) => setSelectedPartner(e.target.value)}
            >
              <option value="">Sem influenciadora (código direto)</option>
              {partners.filter((p) => p.status === "active").map((p) => (
                <option key={p.user_id} value={p.user_id}>{partnerName.get(p.user_id)}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={100} step="0.5"
                placeholder="Comissão %"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">% comissão</span>
            </div>
          )}
          <Input placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={generateCode} disabled={busy} className="gap-1.5 md:col-start-3">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Gerar código
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {kind === "partner"
            ? "Ao usar este código no cadastro, a pessoa já entra como influenciadora ativa com a comissão definida acima."
            : "Código para um novo aluno. Se escolher uma influenciadora, a indicação é registrada automaticamente."}
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {codes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum código gerado ainda.</p>}
          {codes.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold">{c.code}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {c.kind === "partner"
                    ? `Convite de parceria · ${formatRateBp(c.partner_commission_bp ?? 1000)}`
                    : c.partner_id
                      ? partnerName.get(c.partner_id) ?? "Influenciadora"
                      : "Sem influenciadora"}
                  {c.note ? ` · ${c.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.kind === "partner" && <Badge variant="outline" className={STATUS_BADGE.approved}>Parceria</Badge>}
                <Badge variant="outline" className={c.status === "activated" || c.status === "used" ? STATUS_BADGE.paid : STATUS_BADGE.pending}>
                  {c.status === "activated" || c.status === "used" ? "Usado" : c.status === "void" ? "Revogado" : "Disponível"}
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => {
                  navigator.clipboard?.writeText(c.code);
                  toast({ title: "Código copiado" });
                }}><Copy className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>

      {/* Comissões */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold">Comissões</h3>
        {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {commissions.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">Nenhuma comissão registrada. Elas aparecem quando um aluno indicado ativa o plano.</p>
        )}
        <div className="space-y-1.5">
          {commissions.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{partnerName.get(c.partner_id) ?? "Influenciadora"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatCents(c.gross_amount_cents)} · {formatRateBp(c.commission_rate_bp)} ·{" "}
                  {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  {!c.eligible && " · não elegível"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold">{formatCents(c.commission_amount_cents)}</span>
                <Badge variant="outline" className={STATUS_BADGE[c.status] ?? STATUS_BADGE.pending}>{c.status}</Badge>
                {c.eligible && c.status !== "paid" && c.status !== "canceled" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => markPaid([c.id])}>
                    Marcar paga
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}

export default PartnersTab;
