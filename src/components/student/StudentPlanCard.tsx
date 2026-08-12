/**
 * StudentPlanCard.tsx — plano contratado pelo ALUNO.
 *
 * Aditivo: se o aluno ainda não tiver contrato, o componente não renderiza nada
 * e o fluxo financeiro antigo (alerta de cobrança + PIX) continua valendo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, ChevronDown, ExternalLink } from "lucide-react";
import { formatCents, toCents } from "@/lib/studentPlans";
import { formatDatePtBR } from "@/lib/formatDate";
import { useMyStudentSubscription } from "@/hooks/useStudentPlans";

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

export function StudentPlanCard({ userId }: { userId: string | null | undefined }) {
  const { data: sub } = useMyStudentSubscription(userId);
  const [open, setOpen] = useState(false);

  const { data: charges = [] } = useQuery({
    queryKey: ["my-plan-charges", userId],
    enabled: !!userId && !!sub,
    queryFn: async () => {
      const { data } = await sb
        .from("coach_finances")
        .select("id, description, amount, status, due_date, paid_at, payment_method, source, checkout_url, receipt_url, card_installments")
        .eq("student_id", userId)
        .order("due_date", { ascending: false })
        .limit(24);
      return (data ?? []) as Array<{
        id: string; description: string; amount: number; status: string;
        due_date: string | null; paid_at: string | null; payment_method: string | null;
        source: string | null; checkout_url: string | null; receipt_url: string | null;
        card_installments: number | null;
      }>;
    },
  });

  if (!sub) return null;

  const pending = charges.find((c) => c.status === "pending");
  const status = STATUS_LABEL[sub.status] ?? STATUS_LABEL.pending;

  return (
    <Card className="p-4 bg-card/60 border border-border/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-sm font-bold text-foreground">Plano {sub.plan_name}</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCents(sub.price_cents)} · ciclo de {sub.cycle_months}{" "}
            {sub.cycle_months === 1 ? "mês" : "meses"}
          </p>
          {sub.next_due_date && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Próximo vencimento: {formatDatePtBR(sub.next_due_date)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Ver histórico"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {pending?.checkout_url && (
        <Button
          size="sm"
          className="w-full mt-3"
          onClick={() => window.open(pending.checkout_url!, "_blank", "noopener")}
        >
          Pagar {formatCents(toCents(Number(pending.amount)))} <ExternalLink className="w-3.5 h-3.5 ml-1" />
        </Button>
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
                <span className="shrink-0 font-semibold">
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
