import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AlertLevel, StudentStatus } from "@/hooks/useCoachStudents";
import { colorForDelta, weightPolarityForGoal } from "@/lib/checkInSchema";
import type { ClinicalSignal } from "@/lib/checkInSchema";
import { INSIGHT_META, type CoachInsightSituacao } from "@/lib/coachInsights";
import { formatDatePtBR } from "@/lib/formatDate";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Fonte única de verdade pras 3 cores de status usadas nos selos do coach
// (crítico/atenção/ok). Usa os tokens semânticos em opacidade — funciona em
// claro e escuro sem precisar de par dark: manual (mesmo truque já usado
// nos cards de módulo do aluno, ex. bg-amber-500/10).
export const STATUS_PILL: Record<"critical" | "warning" | "ok", string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  ok: "bg-success/10 text-success border-success/20",
};
export const STATUS_TEXT: Record<"critical" | "warning" | "ok", string> = {
  critical: "text-destructive",
  warning: "text-warning",
  ok: "text-success",
};
export const STATUS_DOT: Record<"critical" | "warning" | "ok", string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  ok: "bg-success",
};

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
    <div className="bg-card rounded-xl border border-border p-4 transition-shadow duration-300 hover:shadow-md">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ background: `${accent}15` }}>
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
  awaitingFirstProtocol,
}: {
  level: AlertLevel;
  daysSinceLastFeedback?: number;
  warningDays?: number;
  criticalDays?: number;
  lastFeedback?: string | null;
  awaitingFirstProtocol?: boolean;
}) {
  // O aluno ainda não abriu o protocolo pela primeira vez (e nunca enviou
  // check-in) — não existe "radar" ainda pra esse aluno, então nunca é
  // crítico/atenção aqui, independente de quantos dias já se passaram.
  if (awaitingFirstProtocol) {
    const badge = (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-default ${STATUS_PILL.ok}`}>
        Aguardando abrir plano
      </span>
    );
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
          O radar de check-in só começa a contar a partir do momento em que o aluno abre o protocolo novo pela primeira vez.
        </TooltipContent>
      </Tooltip>
    );
  }


  const map: Record<AlertLevel, { label: string; cls: string }> = {
    critical: { label: "Crítico", cls: STATUS_PILL.critical },
    warning:  { label: "Atenção", cls: STATUS_PILL.warning },
    ok:       { label: "Em dia",  cls: STATUS_PILL.ok },
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

/**
 * Badge do SINAL CLÍNICO (conteúdo do último check-in) — deliberadamente
 * diferente do AlertBadge (que mede só atraso): aqui é um ponto colorido
 * com rótulo curto, não uma pílula preenchida.
 */
export function ClinicalSignalBadge({ signal }: { signal: ClinicalSignal | null | undefined }) {
  if (!signal) return null;
  const map: Record<ClinicalSignal, { label: string; dot: string; text: string; tip: string }> = {
    alerta:  { label: "Sinal ruim",  dot: STATUS_DOT.critical, text: STATUS_TEXT.critical, tip: "Último check-in com pedido de atenção urgente ou várias respostas no pior nível." },
    atencao: { label: "Observar",    dot: STATUS_DOT.warning,  text: STATUS_TEXT.warning,  tip: "Último check-in com sinais intermediários — vale acompanhar." },
    ok:      { label: "Bem",         dot: STATUS_DOT.ok,       text: STATUS_TEXT.ok,       tip: "Último check-in sem sinais negativos relevantes." },
  };
  const { label, dot, text, tip } = map[signal];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold cursor-default ${text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">{tip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Selo resumido do Radar de Evolução (coach_insights) na lista de alunos.
 * Mesma estrutura do ClinicalSignalBadge, com o emoji de INSIGHT_META no
 * lugar do ponto colorido.
 */
export function InsightBadge({ situacao }: { situacao: CoachInsightSituacao | null | undefined }) {
  if (!situacao) return null;
  const meta = INSIGHT_META[situacao];
  if (!meta) return null;
  const textCls: Record<CoachInsightSituacao, string> = {
    boa:                 STATUS_TEXT.ok,
    atencao:             STATUS_TEXT.warning,
    risco:               STATUS_TEXT.critical,
    dados_insuficientes: "text-muted-foreground",
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold cursor-default ${textCls[situacao]}`}>
          <span aria-hidden className="text-[10px] leading-none">{meta.emoji}</span>
          Radar
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
        Radar de Evolução: {meta.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function WeightTrendBadge({ student }: { student: StudentStatus }) {
  const trend = student.weightTrend;
  if (!trend || trend.deltaKg == null) return null;
  const polarity = weightPolarityForGoal(student.goal);
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
