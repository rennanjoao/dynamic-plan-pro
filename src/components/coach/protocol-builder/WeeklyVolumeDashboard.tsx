import { memo, useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import { loadLibrary, type LibraryEntry } from "@/lib/exerciseLibrary";
import {
  calculateWeeklyVolume,
  type MuscleGroupVolume,
  type VolumeStatus,
  type WeeklyVolumeReport,
} from "@/lib/volumeCalculator";

type WorkoutsProp = ProtocolPayload["workouts"];
type WeekDaysProp = ProtocolPayload["weekDays"];

interface WeeklyVolumeDashboardProps {
  workouts: WorkoutsProp;
  weekDays: WeekDaysProp;
  periodization?: ProtocolPayload["periodization"]; 
}

interface StatusMeta {
  label: string;
  badgeClass: string;
  barClass: string;
}

const STATUS_META: Record<VolumeStatus, StatusMeta> = {
  abaixo_mv: {
    label: "Abaixo do MV",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/20",
    barClass: "bg-red-500",
  },
  manutencao: {
    label: "Manutenção",
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    barClass: "bg-amber-500",
  },
  crescimento: {
    label: "Crescimento",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    barClass: "bg-emerald-500",
  },
  otimo: {
    label: "Ótimo",
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    barClass: "bg-emerald-500",
  },
  alerta: {
    label: "Alerta",
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    barClass: "bg-amber-500",
  },
  acima_mrv: {
    label: "Acima do MRV",
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/20",
    barClass: "bg-red-500",
  },
  sem_landmark: {
    label: "Sem referência",
    badgeClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    barClass: "bg-slate-400",
  },
};

function formatHse(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const VolumeGroupRow = memo(function VolumeGroupRow({ row }: { row: MuscleGroupVolume }) {
  const meta = STATUS_META[row.status];
  const landmark = row.landmark;
  const fillPercent = landmark ? Math.min(100, (row.hse / landmark.mrv) * 100) : 0;
  const mevPercent = landmark ? Math.min(100, (landmark.mev / landmark.mrv) * 100) : null;

  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{row.label}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{formatHse(row.hse)} HSE</span>
          <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] font-normal", meta.badgeClass)}>
            {meta.label}
          </Badge>
        </div>
      </div>

      {landmark ? (
        <>
          <div
            className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={Math.round(row.hse * 10) / 10}
            aria-valuemin={0}
            aria-valuemax={landmark.mrv}
            aria-label={`${row.label}: ${formatHse(row.hse)} de ${landmark.mrv} HSE (MRV)`}
          >
            <div
              className={cn("h-full rounded-full transition-all", meta.barClass)}
              style={{ width: `${fillPercent}%` }}
            />
            {mevPercent !== null && (
              <div
                className="absolute top-0 h-full w-px bg-foreground/40"
                style={{ left: `${mevPercent}%` }}
                title={`MEV: ${landmark.mev} HSE`}
              />
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            MV {landmark.mv} · MEV {landmark.mev} · MAV {landmark.mav[0]}–{landmark.mav[1]} · MRV {landmark.mrv}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-[10px] text-muted-foreground">Landmark RP ainda não definido para este grupo.</p>
      )}
    </div>
  );
});
VolumeGroupRow.displayName = "VolumeGroupRow";

function WeeklyVolumeDashboardImpl({ workouts, weekDays, periodization }: WeeklyVolumeDashboardProps) {
  const [libraryMap, setLibraryMap] = useState<Map<string, LibraryEntry> | null>(null);
  const [activeWeek, setActiveWeek] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((map) => { if (!cancelled) setLibraryMap(map); })
      .catch(() => { if (!cancelled) setLibraryMap(new Map()); });
    return () => { cancelled = true; };
  }, []);

  // Previne index out-of-bounds caso alguma semana seja deletada
  const safeActiveWeek = periodization?.enabled && periodization.weeks && activeWeek >= periodization.weeks.length ? 0 : activeWeek;

  const report: WeeklyVolumeReport | null = useMemo(() => {
    if (!libraryMap) return null;

    const wSets = periodization?.enabled ? periodization.weeks?.[safeActiveWeek]?.sets : "";
    const wReps = periodization?.enabled ? periodization.weeks?.[safeActiveWeek]?.reps : "";

    const effectiveWorkouts = workouts?.map(day => ({
      ...day,
      exercises: day.exercises?.map((ex, ei) => {
        let effSets = ex.sets;
        let effReps = ex.reps;

        if (periodization?.enabled) {
           // Resgata o override específico deste exercício nesta semana, se o coach tiver feito algum
           const ov = periodization.overrides?.[String(safeActiveWeek)]?.[`${day.key}_${ei}`];
           
           // A precedência obedece a visão real do aluno:
           // 1. Override específico do exercício na semana
           // 2. Regra global da semana
           // 3. O valor padrão do exercício base
           effSets = (ov?.sets && ov.sets.trim() !== "") ? ov.sets : (wSets && wSets.trim() !== "") ? wSets : ex.sets;
           effReps = (ov?.reps && ov.reps.trim() !== "") ? ov.reps : (wReps && wReps.trim() !== "") ? wReps : ex.reps;
        }

        return {
          ...ex,
          sets: effSets,
          reps: effReps,
        };
      })
    }));

    return calculateWeeklyVolume(effectiveWorkouts, weekDays, libraryMap);
  }, [workouts, weekDays, periodization, libraryMap, safeActiveWeek]);

  const sortedRows = useMemo(() => {
    if (!report) return [];
    return [...report.byMuscleGroup].sort((a, b) => {
      if (a.hse > 0 && b.hse <= 0) return -1;
      if (a.hse <= 0 && b.hse > 0) return 1;
      if (a.hse > 0 && b.hse > 0) return b.hse - a.hse;
      return 0;
    });
  }, [report]);

  const hasUnscheduled = !!report && report.unscheduledWorkoutKeys.length > 0;
  const hasUnclassified = !!report && report.unclassifiedExercises.length > 0;
  const hasWarnings = hasUnscheduled || hasUnclassified;
  const warningCount = report ? report.unscheduledWorkoutKeys.length + report.unclassifiedExercises.length : 0;

  const headerText = periodization?.enabled && periodization.weeks?.[safeActiveWeek]
    ? `Análise de Volume (HSE) — ${periodization.weeks[safeActiveWeek].label || `Semana ${safeActiveWeek + 1}`}`
    : "Análise de Volume Semanal (HSE)";

  return (
    <Card className="bg-card/40 border-border p-2.5">
      <Accordion type="single" collapsible>
        <AccordionItem value="weekly-volume" className="border-none">
          <AccordionTrigger className="px-1.5 py-1.5 text-sm hover:no-underline">
            <div className="flex flex-1 items-center justify-between pr-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{headerText}</span>
              </div>
              {hasWarnings && (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-[10px] font-normal text-amber-500 shrink-0 ml-2"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount}
                </Badge>
              )}
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-1.5">
            {periodization?.enabled && periodization.weeks && periodization.weeks.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 bg-muted/20 p-2 rounded-lg border border-border/40">
                {periodization.weeks.map((w, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveWeek(idx)}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all",
                      safeActiveWeek === idx
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {w.label || `S ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}

            {!report ? (
              <p className="py-2 text-xs text-muted-foreground">Carregando biblioteca de exercícios…</p>
            ) : (
              <>
                {hasWarnings && (
                  <div className="mb-2 space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5">
                    {hasUnscheduled && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        <strong>Treinos sem dia atribuído na semana</strong> — não entram no cálculo:{" "}
                        {report.unscheduledWorkoutKeys.join(", ")}
                      </p>
                    )}
                    {hasUnclassified && (
                      <div className="text-xs text-amber-700 dark:text-amber-400">
                        <p>
                          <strong>
                            {report.unclassifiedExercises.length}{" "}
                            {report.unclassifiedExercises.length === 1 ? "exercício" : "exercícios"} sem grupo
                            muscular identificado
                          </strong>{" "}
                          — não {report.unclassifiedExercises.length === 1 ? "entra" : "entram"} no HSE:
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5">
                          {report.unclassifiedExercises.map((ex, idx) => (
                            <li key={`${ex.workoutKey}-${ex.exerciseName}-${idx}`}>
                              {ex.exerciseName}{" "}
                              <span className="text-amber-700/70 dark:text-amber-400/70">(treino {ex.workoutKey})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="divide-y divide-border/60">
                  {sortedRows.map((row) => (
                    <VolumeGroupRow key={row.group} row={row} />
                  ))}
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

export const WeeklyVolumeDashboard = memo(WeeklyVolumeDashboardImpl);
WeeklyVolumeDashboard.displayName = "WeeklyVolumeDashboard";
