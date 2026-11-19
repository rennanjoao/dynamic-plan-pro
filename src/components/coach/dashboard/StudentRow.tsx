import type { StudentStatus } from "@/hooks/useCoachStudents";
import {
  ClipboardList, Dumbbell, History, Activity, X, MessageSquare, MoreVertical, MessageSquareReply,
  ChevronRight, LineChart, UserRound, PersonStanding,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertBadge, ClinicalSignalBadge, InsightBadge, STATUS_TEXT, WeightTrendBadge } from "./dashboardUtils";
import { Private, usePrivacyMode } from "@/components/coach/PrivacyMode";
import { waitingLabel } from "@/lib/coachPending";
import type { StudentProfileTab } from "./StudentProfileSheet";

export function StudentRow({
  student, onOpenProfile, onProtocol, onUnlink, onLatestFeedback,
}: {
  student: StudentStatus;
  /** Abre a ficha do aluno (opcionalmente numa aba específica). */
  onOpenProfile: (s: StudentStatus, tab?: StudentProfileTab) => void;
  onProtocol: (s: StudentStatus) => void;
  onUnlink: (s: StudentStatus) => void;
  onLatestFeedback: (s: StudentStatus) => void;
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
    if (student.awaitingFirstProtocol) return "Sem check-in — ver anamnese";
    const d = student.daysSinceLastFeedback;
    const prefix = student.lastFeedback ? "Último check-in" : "Protocolo aberto";
    if (d <= 0) return `${prefix}: hoje`;
    if (d === 1) return `${prefix}: ontem`;
    return `${prefix}: há ${d} dias`;
  })();

  const feedbackStatusClass = student.awaitingFirstProtocol
    ? "text-muted-foreground hover:bg-accent"
    : `${STATUS_TEXT[student.alertLevel || "ok"]} ${student.alertLevel === "critical" ? "font-medium" : ""} hover:bg-accent`;

  const safeName = student.name || "Aluno";
  const initials = safeName.split(" ").slice(0, 2).map((n) => n[0] || "").join("");
  const { privacy } = usePrivacyMode();
  const awaiting = student.awaitingReply;

  let displayWeight: string | number | undefined;
  if (typeof student.currentWeight === "object" && student.currentWeight !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayWeight = (student.currentWeight as any).peso || (student.currentWeight as any).weight || undefined;
  } else {
    displayWeight = student.currentWeight as string | number | undefined;
  }

  return (
    <div
      data-testid={`student-row-${student.id}`}
      className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3.5 rounded-xl border transition-colors ${
        student.alertLevel === "critical" ? "bg-red-50/60 border-red-100 dark:bg-red-950/20 dark:border-red-900" :
        student.alertLevel === "warning"  ? "bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900" :
        "bg-card border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenProfile(student)}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir ficha de ${safeName}`}
      >
        <Private as="div" className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-primary/10 text-primary uppercase">
          {privacy ? "••" : initials}
        </Private>
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onOpenProfile(student)}
            className="inline-flex items-center gap-0.5 min-w-0 text-left hover:underline underline-offset-2"
            title="Abrir ficha do aluno"
          >
            <Private as="span" className="text-sm font-semibold text-foreground truncate">{safeName}</Private>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </button>
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
        {awaiting ? (
          <button
            type="button"
            onClick={() => onLatestFeedback(student)}
            className="text-xs flex items-center gap-1 mt-0.5 rounded px-1 -mx-1 font-semibold text-amber-700 dark:text-amber-400 hover:bg-accent"
            title="Abrir o check-in que espera sua resposta"
          >
            <MessageSquareReply className="w-3 h-3" />
            {awaiting.count > 1 ? `${awaiting.count} check-ins esperando resposta` : "Check-in esperando resposta"} · {waitingLabel(awaiting.since)}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (student.lastFeedback ? onLatestFeedback(student) : onOpenProfile(student, "anamnese"))}
            className={`text-xs flex items-center gap-1 mt-0.5 rounded px-1 -mx-1 transition-colors ${feedbackStatusClass}`}
            title={student.lastFeedback ? "Ver último check-in" : "Ver anamnese"}
          >
            {student.lastFeedback ? <MessageSquare className="w-3 h-3" /> : <ClipboardList className="w-3 h-3" />}
            {feedbackLabel}
          </button>
        )}
      </div>

      {displayWeight !== undefined && displayWeight !== null && (
        <div className="hidden sm:block text-right shrink-0">
          <p className="text-xs text-muted-foreground">Peso</p>
          <p className="text-sm font-semibold text-foreground">{displayWeight} kg</p>
          <WeightTrendBadge student={student} />
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {/* Ação principal com texto: quando há check-in esperando, "Responder"
            passa na frente do "Protocolo" — é o trabalho pendente do coach. */}
        {awaiting ? (
          <Button
            size="sm"
            onClick={() => onLatestFeedback(student)}
            className="h-9 gap-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="row-reply-button"
          >
            <MessageSquareReply className="w-4 h-4" /> <span className="hidden min-[380px]:inline">Responder</span>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onProtocol(student)} className="h-9 gap-1.5 px-2.5">
            <Dumbbell className="w-4 h-4" /> <span className="hidden min-[380px]:inline">Protocolo</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Mais ações para ${safeName}`}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => onOpenProfile(student)}>
              <UserRound className="w-4 h-4 mr-2" /> Abrir ficha do aluno
            </DropdownMenuItem>
            {awaiting && (
              <DropdownMenuItem onSelect={() => onProtocol(student)}>
                <Dumbbell className="w-4 h-4 mr-2" /> Editar protocolo
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenProfile(student, "checkins")}>
              <History className="w-4 h-4 mr-2" /> Check-ins
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenProfile(student, "evolucao")}>
              <LineChart className="w-4 h-4 mr-2" /> Evolução
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenProfile(student, "postura")}>
              <PersonStanding className="w-4 h-4 mr-2" /> Postura
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenProfile(student, "treinos")}>
              <Activity className="w-4 h-4 mr-2" /> Treinos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenProfile(student, "anamnese")}>
              <ClipboardList className="w-4 h-4 mr-2" /> Anamnese
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onUnlink(student)} className="text-destructive focus:text-destructive">
              <X className="w-4 h-4 mr-2" /> Desvincular aluno
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default StudentRow;
