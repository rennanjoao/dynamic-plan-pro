/**
 * WeeklyVolumeDashboard.tsx — painel "Análise de Volume Semanal (HSE)".
 *
 * Lê a PRESCRIÇÃO do coach (payload.workouts + payload.weekDays) e projeta,
 * por grupo muscular, o volume semanal em Hard Set Equivalents contra os
 * landmarks RP (src/lib/hseVolumeLandmarks.ts), via src/lib/volumeCalculator.ts.
 *
 * Performance: recebe só `workouts`/`weekDays` (não o `payload` inteiro) e é
 * exportado envolto em `React.memo`, então só recalcula quando esses dois
 * slices realmente mudam de referência — o que só acontece quando o coach
 * de fato edita um treino, não quando outras abas do protocolo (Dieta,
 * Macros) disparam um novo objeto `payload`. As linhas da lista de grupos
 * também são memoizadas individualmente (`VolumeGroupRow`).
 *
 * `exerciseLibrary.loadLibrary()` é assíncrona (Supabase); este componente
 * resolve a Promise UMA vez em um `useEffect` e guarda o Map resultante em
 * estado local — o motor de cálculo em si permanece 100% síncrono e puro.
 */
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
}

interface StatusMeta {
  label: string;
  badgeClass: string;
  barClass: string;
}

// Paleta "termal" com as MESMAS famílias de cor já usadas em
// src/lib/volumeLandmarks.ts / StudentWorkoutAnalytics.tsx (vermelho/âmbar/
// esmeralda em badges "soft" — bg-{cor}/10 + texto + borda), reaplicadas aos
// 7 estados de HseVolumeStatus (que têm um landmark a mais — MV — do que o
// VolumeStatus antigo). Vermelho é reservado para os dois extremos
// (abaixo do MV / acima do MRV): tanto treinar de menos a ponto de nem
// manter quanto ultrapassar o teto recuperável são, na prática, o mesmo
// tipo de alerta para o coach — só em direções opostas.
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

/** "4" para inteiros, "4.5" para meios — nunca "4.0" (HSE só soma em múltiplos de 0.5). */
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

function WeeklyVolumeDashboardImpl({ workouts, weekDays }: WeeklyVolumeDashboardProps) {
  const [libraryMap, setLibraryMap] = useState<Map<string, LibraryEntry> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((map) => {
        if (!cancelled) setLibraryMap(map);
      })
      .catch(() => {
        // Nunca deixa o painel travado em "carregando" para sempre — se a
        // library falhar, segue com um Map vazio (tudo cai no fallback do
        // classificador por nome dentro de calculateWeeklyVolume).
        if (!cancelled) setLibraryMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const report: WeeklyVolumeReport | null = useMemo(() => {
    if (!libraryMap) return null;
    return calculateWeeklyVolume(workouts, weekDays, libraryMap);
  }, [workouts, weekDays, libraryMap]);

  // Grupos com hse > 0 primeiro (mais treinado -> menos treinado); grupos
  // zerados depois, na ordem natural do enum MuscleGroup.
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

  return (
    <Card className="bg-card/40 border-border p-2.5">
      <Accordion type="single" collapsible>
        <AccordionItem value="weekly-volume" className="border-none">
          <AccordionTrigger className="px-1.5 py-1.5 text-sm hover:no-underline">
            <div className="flex flex-1 items-center justify-between pr-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Análise de Volume Semanal (HSE)</span>
              </div>
              {hasWarnings && (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/20 bg-amber-500/10 px-1.5 py-0 text-[10px] font-normal text-amber-500"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount}
                </Badge>
              )}
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-1.5">
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
