import type { StudentStatus } from "@/hooks/useCoachStudents";
import { ClipboardList, Dumbbell, History, Sparkles, Settings2, X, MessageSquare } from "lucide-react";
import { AlertBadge, ClinicalSignalBadge, InsightBadge, WeightTrendBadge } from "./dashboardUtils";
import { Private, usePrivacyMode } from "@/components/coach/PrivacyMode";

export function StudentRow({
  student, onAnamnesis, onProtocol, onUnlink, onHistory, onChangeHistory, onLatestFeedback, onSettings,
}: {
  student: StudentStatus;
  onAnamnesis: (s: StudentStatus) => void;
  onProtocol: (s: StudentStatus) => void;
  onUnlink: (s: StudentStatus) => void;
  onHistory: (s: StudentStatus) => void;
  onChangeHistory: (s: StudentStatus) => void;
  onLatestFeedback: (s: StudentStatus) => void;
  onSettings: (s: StudentStatus) => void;
}) {
  // Sempre em dias exatos (nunca "há N semana(s)") — o coach precisa comparar
  // isso diretamente com os limites de atenção/crítico, que também são em dias.
  //
  // Checagem por `!student.lastFeedback` (não por daysSinceLastFeedback >= 999):
  // desde que o relógio passou a poder contar a partir da data do 1º
  // protocolo (quando ainda não há nenhum check-in), daysSinceLastFeedback
  // pode ser um número pequeno normal mesmo sem check-in nenhum — só
  // lastFeedback (a data real do check-in) diz com certeza se existe um.
  const feedbackLabel = (() => {
    if (!student.lastFeedback) return "Sem check-in registrado";
    const d = student.daysSinceLastFeedback;
    if (d <= 0) return "Último check-in: hoje";
    if (d === 1) return "Último check-in: ontem";
    return `Último check-in: há ${d} dias`;
  })();

  const safeName = student.name || "Aluno";
  const initials = safeName.split(" ").slice(0, 2).map((n) => n[0] || "").join("");
  const { privacy } = usePrivacyMode();

  let displayWeight: string | number | undefined;
  if (typeof student.currentWeight === "object" && student.currentWeight !== null) {
    displayWeight = (student.currentWeight as any).peso || (student.currentWeight as any).weight || undefined;
  } else {
    displayWeight = student.currentWeight as string | number | undefined;
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors ${
      student.alertLevel === "critical" ? "bg-red-50/60 border-red-100 dark:bg-red-950/20 dark:border-red-900" :
      student.alertLevel === "warning"  ? "bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900" :
      "bg-card border-border"
    }`}>
      <Private as="div" className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-primary/10 text-primary uppercase">
        {privacy ? "••" : initials}
      </Private>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Private as="p" className="text-sm font-semibold text-foreground truncate">{safeName}</Private>
          <AlertBadge
            level={student.alertLevel || "ok"}
            daysSinceLastFeedback={student.daysSinceLastFeedback}
            warningDays={student.warningDays}
            criticalDays={student.criticalDays}
            lastFeedback={student.lastFeedback}
            awaitingFirstProtocol={student.awaitingFirstProtocol}
          />
          <ClinicalSignalBadge signal={student.clinicalSignal} />
          <InsightBadge situacao={student.insightSituacao} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{student.goal || "Objetivo não definido"}</p>
        <button
          type="button"
          onClick={() => student.lastFeedback && onLatestFeedback(student)}
          disabled={!student.lastFeedback}
          className={`text-xs flex items-center gap-1 mt-0.5 rounded px-1 -mx-1 transition-colors ${
            !student.lastFeedback ? "text-muted-foreground cursor-default" :
            student.daysSinceLastFeedback >= student.criticalDays ? "text-red-500 font-medium hover:bg-red-500/10" :
            student.daysSinceLastFeedback >= student.warningDays ? "text-orange-500 hover:bg-orange-500/10" :
            "text-emerald-500 hover:bg-emerald-500/10"
          }`}
          title={student.lastFeedback ? "Ver feedback atual" : undefined}
        >
          <MessageSquare className="w-3 h-3" />
          {feedbackLabel}
        </button>
      </div>

      {displayWeight !== undefined && displayWeight !== null && (
        <div className="hidden sm:block text-right shrink-0">
          <p className="text-xs text-muted-foreground">Peso</p>
          <p className="text-sm font-semibold text-foreground">{displayWeight} kg</p>
          <WeightTrendBadge student={student} />
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onAnamnesis(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Anamnese">
          <ClipboardList className="w-4 h-4" />
        </button>
        <button onClick={() => onProtocol(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Protocolo">
          <Dumbbell className="w-4 h-4" />
        </button>
        <button onClick={() => onHistory(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Histórico de Check-ins">
          <History className="w-4 h-4" />
        </button>
        <button onClick={() => onChangeHistory(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Histórico de Alterações">
          <Sparkles className="w-4 h-4" />
        </button>
        <button onClick={() => onSettings(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Configurar feedback do aluno">
          <Settings2 className="w-4 h-4" />
        </button>
        <button onClick={() => onUnlink(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors" title="Desvincular">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default StudentRow;
