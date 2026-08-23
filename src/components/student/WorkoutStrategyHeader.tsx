import { StretchHorizontal, ChevronRight } from "lucide-react";
import { buildWeekStrip, todayKey } from "@/lib/weekCycle";
import { classifyWeekFocus, WEEK_FOCUS_COLOR, type WeekMeta } from "@/lib/periodizationDefaults";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

interface Props {
  payload: any;
  studentName?: string;
  periodizationEnabled: boolean;
  weeks: WeekMeta[];
  currentWeek: number;
  // Chamado com os exercícios de mobilidade do treino de hoje quando o
  // aluno toca no link "Mobilidade sugerida". Omitido/sem itens → o link
  // não é exibido.
  onOpenMobility?: (exercises: any[]) => void;
}

export default function WorkoutStrategyHeader({
  payload,
  studentName,
  periodizationEnabled,
  weeks,
  currentWeek,
  onOpenMobility,
}: Props) {
  const strip = buildWeekStrip(payload, todayKey());
  const todayInfo = strip.find((d) => d.isToday);
  const workouts: any[] = Array.isArray(payload?.workouts) ? payload.workouts : [];
  const todayWorkout = todayInfo?.workoutKey
    ? workouts.find((w) => w.key === todayInfo.workoutKey)
    : null;
  // Exercícios de mobilidade do treino de hoje — só estes entram no
  // modal/drawer aberto pelo link abaixo do header.
  const todayMobility: any[] = Array.isArray(todayWorkout?.exercises)
    ? todayWorkout.exercises.filter((ex: any) => !!ex?.is_mobility)
    : [];

  const weekMeta = periodizationEnabled ? weeks[currentWeek] : null;
  const focus = weekMeta ? classifyWeekFocus(weekMeta.reps) : null;
  const cc = focus ? WEEK_FOCUS_COLOR[focus.key] : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <p className="text-sm text-muted-foreground">
        {getGreeting()}
        {studentName ? `, ${studentName}` : ""}! 👋
      </p>

      <div className="flex items-center gap-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          Hoje · Treino
        </p>
        {todayWorkout ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-black text-sm">
              {todayWorkout.key}
            </span>
            {todayWorkout.focus ? (
              <span className="text-sm font-semibold text-foreground truncate">
                {todayWorkout.focus}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm font-semibold text-muted-foreground">Descanso</p>
        )}
      </div>

      {/* Link sutil para a mobilidade sugerida do treino de hoje — só
          aparece quando há treino hoje e ele tem itens de mobilidade. */}
      {todayWorkout && todayMobility.length > 0 && onOpenMobility && (
        <button
          type="button"
          onClick={() => onOpenMobility(todayMobility)}
          className="w-full -mt-1 flex items-center gap-1.5 text-xs font-medium text-sky-500 hover:text-sky-400 transition-colors"
        >
          <StretchHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Mobilidade sugerida antes de iniciar o treino</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 ml-auto opacity-60" />
        </button>
      )}

      {weekMeta && focus && cc && (
        <div className={`flex items-center flex-wrap gap-2 rounded-lg border ${cc.border} ${cc.bg} px-3 py-2`}>
          <span className="text-xs font-bold text-foreground">
            Semana {currentWeek + 1} de {weeks.length}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${cc.pill}`}>
            {focus.label}
          </span>
          <span className="text-[11px] text-muted-foreground">({weekMeta.reps})</span>
        </div>
      )}
    </div>
  );
}
