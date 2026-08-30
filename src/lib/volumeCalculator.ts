// src/lib/volumeCalculator.ts

import {
  classifyExerciseByName,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type MuscleGroup,
} from "@/lib/muscleGroupClassifier";
import { isMobilityExercise, type Exercise, type ProtocolPayload } from "@/lib/protocolSchema";
import { toExerciseKey } from "@/lib/workoutTypes";
import type { LibraryEntry } from "@/lib/exerciseLibrary";
import { getHseVolumeLandmark, type HseVolumeLandmark } from "@/lib/hseVolumeLandmarks";

type WorkoutDay = ProtocolPayload["workouts"][number];

// ─────────────────────────────────────────────────────────────────────────
// 1. REGEX BLINDADA — EXTRAÇÃO DIRETA DE SÉRIES
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extrai o número de séries válidas de forma infalível.
 * - Lê números isolados (ex: "4", "100")
 * - Lê notações de soma (ex: "2+3" pega o total ou a última parte)
 * - Respeita o filtro de repetições (ex: se reps for 1RM, zera o HSE)
 */
export function extractHardSetsCount(
  rawSets: string | null | undefined,
  rawReps?: string | null | undefined,
): number {
  if (!rawSets) return 0;

  // Filtro de segurança fisiológica: se for aquecimento ou 1RM/força pura, o HSE é 0
  if (rawReps) {
    const r = rawReps.toLowerCase();
    if (r.includes("aquecimento") || r.includes("warmup")) return 0;
    if (/\b[1-3]\s*rm\b/.test(r) || /\bfor[çc]a\b/.test(r)) return 0;
  }

  const cleanSets = String(rawSets).trim();

  // Se houver uma expressão com "+" (ex: 2+3), somamos os valores ou pegamos o total
  if (cleanSets.includes("+")) {
    const parts = cleanSets.split("+").map(p => {
      const m = p.trim().match(/(\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : 0;
    });
    const sum = parts.reduce((acc, curr) => acc + curr, 0);
    if (sum > 0) return sum;
  }

  // Extração universal de qualquer número na string de séries (ex: "4x12", "10", "100 séries")
  const match = cleanSets.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. RESOLUÇÃO DE GRUPO MUSCULAR
// ─────────────────────────────────────────────────────────────────────────

export interface ResolvedMuscleGroups {
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  source: "library" | "name_classifier";
}

export function resolveExerciseMuscleGroups(
  exercise: Pick<Exercise, "name" | "gifKey">,
  libraryMap: Map<string, LibraryEntry>,
): ResolvedMuscleGroups | null {
  const name = exercise.name ?? "";

  const byGifKey = exercise.gifKey ? libraryMap.get(exercise.gifKey) : undefined;
  const byName = byGifKey ? undefined : libraryMap.get(toExerciseKey(name));
  const libraryEntry = byGifKey ?? byName;

  if (libraryEntry?.primaryMuscleGroup) {
    return {
      primary: libraryEntry.primaryMuscleGroup,
      secondary: libraryEntry.secondaryMuscleGroups ?? [],
      source: "library",
    };
  }

  const guess = classifyExerciseByName(name);
  if (guess.primary) {
    return { primary: guess.primary, secondary: guess.secondary, source: "name_classifier" };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. STATUS TERMAL DAS LANDMARKS
// ─────────────────────────────────────────────────────────────────────────

export type VolumeStatus =
  | "abaixo_mv"
  | "manutencao"
  | "crescimento"
  | "otimo"
  | "alerta"
  | "acima_mrv"
  | "sem_landmark";

export function getVolumeStatus(hse: number, landmark: HseVolumeLandmark | null): VolumeStatus {
  if (!landmark) return "sem_landmark";

  const { mv, mev, mav, mrv } = landmark;
  const [mavMin, mavMax] = mav;

  if (hse < mv) return "abaixo_mv";
  if (hse < mev) return "manutencao";
  if (hse < mavMin) return "crescimento";
  if (hse <= mavMax) return "otimo";
  if (hse < mrv) return "alerta";
  return "acima_mrv";
}

// ─────────────────────────────────────────────────────────────────────────
// 4. FREQUÊNCIA SEMANAL
// ─────────────────────────────────────────────────────────────────────────

function buildWorkoutFrequencyMap(weekDays: Record<string, string> | undefined | null): Map<string, number> {
  const frequency = new Map<string, number>();
  if (!weekDays) return frequency;

  for (const rawValue of Object.values(weekDays)) {
    const value = (rawValue ?? "").trim();
    if (!value || value.toLowerCase() === "rest") continue; 
    frequency.set(value, (frequency.get(value) ?? 0) + 1);
  }

  return frequency;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. AGREGAÇÃO SEMANAL E EXPORTAÇÃO
// ─────────────────────────────────────────────────────────────────────────

export interface SkippedExercise {
  workoutKey: string;
  workoutFocus: string;
  exerciseName: string;
  rawSets: string;
}

export interface MuscleGroupVolume {
  group: MuscleGroup;
  label: string;
  hse: number;
  landmark: HseVolumeLandmark | null;
  status: VolumeStatus;
}

export interface WeeklyVolumeReport {
  byMuscleGroup: MuscleGroupVolume[];
  unclassifiedExercises: SkippedExercise[];
  mobilityExcludedCount: number;
  unscheduledWorkoutKeys: string[];
  totalHse: number;
}

export function calculateWeeklyVolume(
  workouts: WorkoutDay[] | undefined | null,
  weekDays: Record<string, string> | undefined | null,
  libraryMap: Map<string, LibraryEntry>,
): WeeklyVolumeReport {
  const frequency = buildWorkoutFrequencyMap(weekDays);

  const hseByGroup = new Map<MuscleGroup, number>(MUSCLE_GROUP_OPTIONS.map((group) => [group, 0]));
  const unclassifiedExercises: SkippedExercise[] = [];
  let mobilityExcludedCount = 0;

  for (const day of workouts ?? []) {
    const timesPerWeek = frequency.get(day.key) ?? 0;
    if (timesPerWeek === 0) continue;

    for (const exercise of day.exercises ?? []) {
      if (isMobilityExercise(exercise)) {
        mobilityExcludedCount += 1;
        continue;
      }

      // Extração direta e limpa de séries e reps
      const hardSetsPerOccurrence = extractHardSetsCount(exercise.sets, exercise.reps);
      const resolved = resolveExerciseMuscleGroups(exercise, libraryMap);

      if (!resolved) {
        if (hardSetsPerOccurrence > 0) {
          unclassifiedExercises.push({
            workoutKey: day.key,
            workoutFocus: day.focus ?? "",
            exerciseName: exercise.name?.trim() || "(sem nome)",
            rawSets: exercise.sets ?? "",
          });
        }
        continue;
      }

      const weeklyHardSets = hardSetsPerOccurrence * timesPerWeek;
      if (weeklyHardSets <= 0) continue;

      hseByGroup.set(resolved.primary, (hseByGroup.get(resolved.primary) ?? 0) + weeklyHardSets * 1.0);
      for (const secondaryGroup of resolved.secondary) {
        hseByGroup.set(secondaryGroup, (hseByGroup.get(secondaryGroup) ?? 0) + weeklyHardSets * 0.5);
      }
    }
  }

  const scheduledKeys = new Set(frequency.keys());
  const unscheduledWorkoutKeys = (workouts ?? []).map((day) => day.key).filter((key) => !scheduledKeys.has(key));

  const byMuscleGroup: MuscleGroupVolume[] = MUSCLE_GROUP_OPTIONS.map((group) => {
    const hse = hseByGroup.get(group) ?? 0;
    const landmark = getHseVolumeLandmark(group);
    return {
      group,
      label: MUSCLE_GROUP_LABELS[group],
      hse,
      landmark,
      status: getVolumeStatus(hse, landmark),
    };
  });

  const totalHse = byMuscleGroup.reduce((sum, row) => sum + row.hse, 0);

  return { byMuscleGroup, unclassifiedExercises, mobilityExcludedCount, unscheduledWorkoutKeys, totalHse };
}

export function calculateWeeklyVolumeFromPayload(
  payload: Pick<ProtocolPayload, "workouts" | "weekDays">,
  libraryMap: Map<string, LibraryEntry>,
): WeeklyVolumeReport {
  return calculateWeeklyVolume(payload.workouts, payload.weekDays, libraryMap);
}
