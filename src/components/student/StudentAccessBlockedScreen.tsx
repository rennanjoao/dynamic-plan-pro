/**
 * Tela de acesso pausado (mais de 7 dias de atraso).
 *
 * Mostra o que está em aberto, os planos do coach com o preço final do aluno
 * e o botão de pagar. Depois do pagamento confirmado (webhook), o app libera
 * sozinho: a tela confere a situação de novo a cada 15 s e ao voltar para ela.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Loader2, Lock, MessageCircle, RefreshCw, LogOut, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanCheckout } from "@/hooks/usePlanCheckout";
import { fetchContractParty, type CatalogPlanLike } from "@/lib/serviceContract";
import {
  fetchMyAccessStatus, fetchMyPlanQuotes, formatBRL, formatDay,
  type AccessState, type PlanQuote,
} from "@/lib/studentAccess";

interface PendingCharge {
  id: string;
  description: string;
  amount_cents: number | null;
  amount: number;
  due_date: string | null;
  plan_slug: string | null;
  plan_cycle_months: number | null;
  plan_name_snapshot: string | null;
}

const RETURN_INFO: Record<string, string> = {
  retorno: "Pagamento enviado. Assim que o Mercado Pago confirmar, o app libera sozinho.",
  pendente: "Pagamento em análise no Mercado Pago. O app libera assim que for aprovado.",
  falha: "O pagamento não foi concluído. Tente de novo ou escolha outra forma.",
};

function periodLabel(q: PlanQuote): string {
  if (q.kind === "access") return q.duration_months === 1 ? "por mês · só acesso ao app e check-ins" : `${q.duration_months} meses · só acesso ao app`;
  return q.duration_months === 1 ? "por mês · consultoria completa" : `${q.duration_months} meses · consultoria completa`;
}

export function StudentAccessBlockedScreen({ userId, state, onUnblocked }: {
  userId: string;
  state: AccessState;
  onUnblocked: () => void;
}) {
  const [params] = useSearchParams();
  const returnInfo = RETURN_INFO[params.get("checkout") ?? ""] ?? null;
  const [checking, setChecking] = useState(false);

  const { data: quotes, isLoading: loadingQuotes } = useQuery({
    queryKey: ["my-plan-quotes", userId],
    staleTime: 60_000,
    queryFn: fetchMyPlanQuotes,
  });
  const { data: pending = null } = useQuery({
    queryKey: ["my-pending-plan-charge", userId],
    queryFn: async (): Promise<PendingCharge | null> => {
      const { data } = await sb
        .from("coach_finances")
        .select("id, description, amount, amount_cents, due_date, plan_slug, plan_cycle_months, plan_name_snapshot, charge_kind")
        .eq("student_id", userId)
        .eq("status", "pending")
        .order("due_date", { ascending: true });
      const rows = ((data ?? []) as (PendingCharge & { charge_kind?: string | null })[])
        .filter((r) => r.charge_kind !== "one_off" && Number(r.amount) > 0);
      return rows[0] ?? null;
    },
  });
  const { data: whatsapp = null } = useQuery({
    queryKey: ["my-coach-whatsapp", userId],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const party = await fetchContractParty();
      const digits = String(party?.whatsapp ?? "").replace(/\D/g, "");
      if (!digits) return null;
      return digits.length <= 11 ? `55${digits}` : digits;
    },
  });

  const plans = useMemo(() => (quotes ?? []).filter((q) => q.kind !== "one_off"), [quotes]);
  const contractCatalog: CatalogPlanLike[] = useMemo(
    () => (quotes ?? []).map((q) => ({ slug: q.slug, name: q.name, price_cents: q.list_cents, duration_months: q.duration_months, kind: q.kind })),
    [quotes],
  );
  const { busy, pay, contractDialog } = usePlanCheckout(userId, contractCatalog);

  const recheck = useCallback(async (manual = false) => {
    if (manual) setChecking(true);
    const next = await fetchMyAccessStatus();
    if (manual) setChecking(false);
    if (next && !next.blocked) onUnblocked();
  }, [onUnblocked]);

  useEffect(() => {
    const id = window.setInterval(() => { void recheck(); }, 15_000);
    const onFocus = () => { void recheck(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [recheck]);

  const pendingCents = pending ? pending.amount_cents ?? Math.round(Number(pending.amount) * 100) : 0;
  const pendingPlan = pending?.plan_slug
    ? {
        slug: pending.plan_slug,
        name: pending.plan_name_snapshot ?? state.plan_name ?? "Plano",
        duration_months: pending.plan_cycle_months ?? 1,
        kind: plans.find((p) => p.slug === pending.plan_slug)?.kind ?? "coaching",
      }
    : null;
  const since = state.overdue_since ? formatDay(state.overdue_since) : null;

  return (
    <div className="min-h-screen bg-background px-4 py-10 flex justify-center">
      <div className="w-full max-w-md space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
        <header className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Seu acesso está pausado</h1>
          <p className="text-sm text-muted-foreground">
            {since ? `O pagamento do seu plano está em aberto desde ${since}. ` : "Seu plano está com pagamento em aberto. "}
            Pague abaixo e o app volta assim que o pagamento for confirmado. Seus dados e seu histórico continuam guardados.
          </p>
        </header>

        {returnInfo && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {returnInfo}
          </p>
        )}

        {pending && (
          <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Cobrança em aberto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{pending.description}</p>
                {pending.due_date && <p className="text-xs text-muted-foreground">Venceu em {formatDay(pending.due_date)}</p>}
              </div>
              <p className="text-base font-bold text-foreground shrink-0">{formatBRL(pendingCents)}</p>
            </div>
            <Button
              className="w-full"
              disabled={busy === "pending"}
              onClick={() => void pay({ finance_id: pending.id }, "pending", pendingPlan, pendingCents)}
            >
              {busy === "pending" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />}
              Pagar {formatBRL(pendingCents)}
            </Button>
          </section>
        )}

        <section className="space-y-2" aria-label="Planos">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {pending ? "Ou escolha outro plano" : "Escolha um plano"}
          </h2>
          {loadingQuotes ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border p-4 text-center">
              Nenhum plano disponível agora. Fale com seu treinador.
            </p>
          ) : (
            plans.map((q) => (
              <div key={q.plan_id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{q.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.partner_applied && <span className="mr-1 line-through opacity-70">{formatBRL(q.list_cents)}</span>}
                    <span className="font-semibold text-foreground">{formatBRL(q.final_cents)}</span> {periodLabel(q)}
                  </p>
                  {q.partner_applied && (
                    <p className="text-[11px] font-medium text-primary flex items-center gap-1">
                      <Check className="w-3 h-3" aria-hidden="true" /> 10% de desconto de parceria no 1º pagamento
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={pending?.plan_slug === q.slug ? "outline" : "default"}
                  disabled={busy === q.plan_id}
                  onClick={() => void pay({ plan_id: q.plan_id }, q.plan_id, q, q.final_cents)}
                  aria-label={`Contratar ${q.name} por ${formatBRL(q.final_cents)}`}
                >
                  {busy === q.plan_id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : "Contratar"}
                </Button>
              </div>
            ))
          )}
        </section>

        <footer className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => void recheck(true)} disabled={checking}>
              {checking ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />}
              Já paguei
            </Button>
            {whatsapp ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Falar com o coach
                </a>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut().then(() => window.location.assign("/"))}>
                <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" /> Sair
              </Button>
            )}
          </div>
          <p className="text-[11px] text-center text-muted-foreground">
            Pagou por PIX direto ao seu treinador? Avise ele: a liberação é feita assim que ele registrar.
          </p>
        </footer>
      </div>
      {contractDialog}
    </div>
  );
}
