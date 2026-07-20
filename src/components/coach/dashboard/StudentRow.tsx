import type { StudentStatus } from "@/hooks/useCoachStudents";
import { ClipboardList, Dumbbell, History, Sparkles, Settings2, X, MessageSquare } from "lucide-react";
import { formatRelativePtBR } from "@/lib/formatDate";
import { AlertBadge, WeightTrendBadge } from "./dashboardUtils";

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
  const feedbackLabel =
    student.daysSinceLastFeedback >= 999 || !student.lastFeedback
      ? "Sem check-in registrado"
      : `Último check-in: ${formatRelativePtBR(student.lastFeedback)}`;

  const safeName = student.name || "Aluno";
  const initials = safeName.split(" ").slice(0, 2).map((n) => n[0] || "").join("");

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
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-primary/10 text-primary uppercase">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">{safeName}</p>
          <AlertBadge level={student.alertLevel || "ok"} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{student.goal || "Objetivo não definido"}</p>
        <button
          type="button"
          onClick={() => student.daysSinceLastFeedback < 999 && onLatestFeedback(student)}
          disabled={student.daysSinceLastFeedback >= 999}
          className={`text-xs flex items-center gap-1 mt-0.5 rounded px-1 -mx-1 transition-colors ${
            student.daysSinceLastFeedback >= 999 ? "text-muted-foreground cursor-default" :
            student.daysSinceLastFeedback >= student.criticalDays ? "text-red-500 font-medium hover:bg-red-500/10" :
            student.daysSinceLastFeedback >= student.warningDays ? "text-orange-500 hover:bg-orange-500/10" :
            "text-emerald-500 hover:bg-emerald-500/10"
          }`}
          title={student.daysSinceLastFeedback < 999 ? "Ver feedback atual" : undefined}
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
        <button onClick={() => onAnamnesis(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Evolução e Anamnese">
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