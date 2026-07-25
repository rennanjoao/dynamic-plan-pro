import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AlertLevel, StudentStatus } from "@/hooks/useCoachStudents";
import { getMetricPolarity, colorForDelta } from "@/lib/checkInSchema";
import type { Goal } from "@/utils/macros";
import { formatDatePtBR } from "@/lib/formatDate";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb: any = supabase;

export function useCoachId() {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => { setCoachId(data.session?.user?.id || null); })
      .catch((e) => { console.warn("[useCoachId] Falha ao obter sessão:", e); setCoachId(null); });
  }, []);
  return coachId;
}

export function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${accent}15` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// Monta a explicação em texto do porquê o aluno está no nível de alerta
// atual. Usa só dados já calculados em useCoachStudents (nenhuma consulta
// nova ao banco).
function alertReason(
  level: AlertLevel,
  days: number | undefined,
  warningDays: number | undefined,
  criticalDays: number | undefined,
  lastFeedbackIso: string | null | undefined
): string {
  if (days == null || days >= 999 || !lastFeedbackIso) {
    return "Nenhum check-in registrado ainda.";
  }
  const dateLabel = formatDatePtBR(lastFeedbackIso);
  const dayWord = `${days} dia${days === 1 ? "" : "s"}`;

  if (level === "critical") {
    return `Último check-in em ${dateLabel} (${dayWord} atrás) — passou do limite crítico de ${criticalDays ?? "?"} dias sem feedback.`;
  }
  if (level === "warning") {
    return `Último check-in em ${dateLabel} (${dayWord} atrás) — passou do limite de atenção de ${warningDays ?? "?"} dias. Fica crítico em ${criticalDays ?? "?"} dias.`;
  }
  return `Último check-in em ${dateLabel} (${dayWord} atrás) — dentro do intervalo esperado (entra em atenção com ${warningDays ?? "?"} dias sem feedback).`;
}

export function AlertBadge({
  level,
  daysSinceLastFeedback,
  warningDays,
  criticalDays,
  lastFeedback,
}: {
  level: AlertLevel;
  daysSinceLastFeedback?: number;
  warningDays?: number;
  criticalDays?: number;
  lastFeedback?: string | null;
}) {
  const map: Record<AlertLevel, { label: string; cls: string }> = {
    critical: { label: "Crítico", cls: "bg-red-100 text-red-700 border-red-200" },
    warning:  { label: "Atenção", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    ok:       { label: "Em dia",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };
  const { label, cls } = map[level] || map.ok;
  const badge = (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-default ${cls}`}>
      {label}
    </span>
  );

  // Sem os dados de contexto (nenhum outro lugar do app usa esse badge hoje),
  // mantém o comportamento antigo — só o rótulo, sem tooltip.
  if (daysSinceLastFeedback === undefined) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
        {alertReason(level, daysSinceLastFeedback, warningDays, criticalDays, lastFeedback)}
      </TooltipContent>
    </Tooltip>
  );
}

// Pastilha compacta com a variação de peso desde o check-in anterior.
export function WeightTrendBadge({ student }: { student: StudentStatus }) {
  const trend = student.weightTrend;
  if (!trend || trend.deltaKg == null) return null;
  const goal = student.goal as Goal;
  const polarity = ["emagrecer", "manter", "hipertrofia", "recomposicao"].includes(goal)
    ? getMetricPolarity(goal)
    : "menor_melhor";
  const cls = trend.isStagnant
    ? "text-amber-500"
    : colorForDelta(trend.deltaKg, polarity);
  const Icon = trend.direction === "flat" ? Minus : trend.direction === "up" ? TrendingUp : TrendingDown;
  const label = trend.isStagnant
    ? "Estagnado"
    : `${trend.deltaKg > 0 ? "+" : ""}${trend.deltaKg.toFixed(1)}kg`;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
