import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/studentPlans";
import { formatRateBp } from "@/lib/partnerPricing";
import { usePartnerProfile, usePartnerCommissions, usePartnerReferrals } from "@/hooks/usePartnerships";
import { formatDatePtBR } from "@/lib/formatDate";

/**
 * Área da influenciadora — visão mínima e segura:
 * indicados (nome + etapa), comissões e dados de recebimento.
 * Nenhum dado de saúde, medida, foto, dieta ou treino é exibido aqui.
 */
export default function PartnerArea() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: partner, isLoading } = usePartnerProfile(userId);
  const { data: referrals = [] } = usePartnerReferrals(partner ? userId : null);
  const { data: commissions = [] } = usePartnerCommissions({ partnerId: partner ? userId : null });

  const pending = commissions.filter((c) => c.eligible && c.status !== "paid" && c.status !== "canceled")
    .reduce((s, c) => s + c.commission_amount_cents, 0);
  const paid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.commission_amount_cents, 0);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!partner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Esta área é exclusiva para parcerias ativas.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar ao início</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-card border-b border-border/50 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-base font-bold">Área de Parceria</h1>
            <p className="text-xs text-muted-foreground">Comissão de {formatRateBp(partner.commission_rate_bp)} sobre o valor pago</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Indicados</p>
            <p className="text-xl font-bold mt-1">{referrals.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> A receber</p>
            <p className="text-xl font-bold mt-1 text-amber-500">{formatCents(pending)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Recebido</p>
            <p className="text-xl font-bold mt-1 text-emerald-500">{formatCents(paid)}</p>
          </CardContent></Card>
        </div>

        <Card><CardContent className="p-4 space-y-2">
          <h2 className="text-sm font-bold">Seus indicados</h2>
          {referrals.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma indicação registrada ainda.</p>}
          {referrals.map((r, i) => (
            <div key={`${r.student_name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{r.student_name}</p>
                <p className="text-[11px] text-muted-foreground">{formatDatePtBR(r.attributed_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.commission_amount_cents != null && (
                  <span className="text-xs font-bold">{formatCents(r.commission_amount_cents)}</span>
                )}
                <Badge variant="outline">{r.stage}</Badge>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">
            Por privacidade, você vê apenas o nome e a etapa de cada indicado — nenhum dado de saúde, treino ou dieta.
          </p>
        </CardContent></Card>

        <Card><CardContent className="p-4 space-y-1">
          <h2 className="text-sm font-bold">Dados de recebimento</h2>
          <p className="text-xs text-muted-foreground">
            Pix ({partner.pix_type ?? "—"}): <span className="text-foreground font-medium">{partner.pix_key ?? "não cadastrado"}</span>
          </p>
          <p className="text-xs text-muted-foreground">Titular: {partner.pix_holder_name ?? "não cadastrado"}</p>
          <p className="text-[11px] text-muted-foreground pt-1">Para alterar, fale com seu coach.</p>
        </CardContent></Card>
      </main>
    </div>
  );
}
