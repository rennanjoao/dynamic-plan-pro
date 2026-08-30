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

// ─────────────────────────────────────────────────────────────────────────
// 1.1 FILTRO NEURAL/LIXO — palavras que zeram o HSE (sem dano tecidual real)
// ─────────────────────────────────────────────────────────────────────────

// Sets de "sensação"/abertura: não geram estresse metabólico nem tensão
// mecânica relevante. Zero absoluto, sempre.
const ZERO_HSE_PATTERN =
  /\b(aquecimento|warm[\s-]?up|feeder|reconhecimento|teste|tentativa)\b/i;

// Trabalho de força pura / neural (1 a ~5RM, testes de força). Não é zero
// fisiológico puro (ver Parte 1 da auditoria), mas também não é hipertrofia
// plena — recebe peso fracionado configurável em vez de eliminar o dado.
const STRENGTH_WORK_PATTERN = /\b(\d+\s*rm|for[çc]a)\b/i;

// Peso fracionado aplicado a séries de força pura/neurais dentro do MRV de
// hipertrofia. Ajustável conforme a filosofia do app (0 = zera como antes).
export const STRENGTH_WORK_HSE_WEIGHT = 0.3;

// Teto superior da faixa de reps com equivalência de estímulo hipertrófico
// por série (~5–30 reps até a falha, segundo o corpo de evidência sobre
// "reps efetivas"). Acima disso, a série desloca para resistência muscular
// localizada: o custo de fadiga sistêmica/cardiovascular por série tende a
// ser MAIOR, mas o estímulo hipertrófico marginal por série é MENOR — por
// isso a resposta certa é reduzir o peso, nunca multiplicar por reps.
export const HYPERTROPHY_REP_CEILING = 30;

// Peso fracionado para séries que ultrapassam o teto de hipertrofia (ex.:
// "3x100"). Ajustável — 0.5 reflete que ainda há algum estímulo (a série é
// levada perto da falha), mas fora da faixa calibrada pela literatura.
export const HIGH_REP_ENDURANCE_HSE_WEIGHT = 0.5;

/**
 * Varre o campo `reps` e retorna o MAIOR número encontrado (cobre ranges
 * como "80-100" ou notações "12+5+5"), ou null se não houver nenhum dígito
 * (ex.: "AMRAP", "até a falha" — nesses casos não dá para inferir a faixa
 * de reps com segurança, então o motor não pune nem pressupõe nada).
 */
function extractRepsCeiling(reps: string): number | null {
  const numbers = reps.match(/\d+(?:[.,]\d+)?/g);
  if (!numbers) return null;

  const parsed = numbers.map((n) => parseFloat(n.replace(",", "."))).filter(Number.isFinite);
  if (parsed.length === 0) return null;

  return Math.max(...parsed);
}

/**
 * Núcleo "nullable" da extração: distingue explicitamente "não havia número
 * nenhum" (null) de "havia um número e ele era 0" (0) — essa diferença
 * importa para a notação "+" abaixo, onde um segmento sem dígito deve
 * disparar fallback, mas um segmento com "0" explícito deve ser respeitado.
 *
 * Sempre conservador: nunca superestima.
 * - Ignora tudo que não seja o número-líder (ex.: "4x12" -> 4, "10x8" -> 10)
 * - Ranges pegam o menor valor (ex.: "3-4" ou "3 a 4 séries" -> 3)
 * - Decimais são arredondados para baixo (ex.: "3.5" -> 3), aceitando
 *   vírgula ou ponto como separador (padrão BR)
 * - Notações sem número líder válido (ex.: "x5") retornam null — dado
 *   ambíguo não deve virar volume contabilizado nem disparar suposições
 */
function tryExtractLeadingSetsNumber(value: string): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)/);
  if (!match) return null;

  const parsed = parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.floor(parsed);
}

/** Wrapper conveniente para os caminhos que só precisam de um número (0 = "nada encontrado"). */
function extractLeadingSetsNumber(value: string): number {
  return tryExtractLeadingSetsNumber(value) ?? 0;
}

/**
 * Extrai o número de HARD SETS (já ponderados fisiologicamente) de forma
 * infalível a partir do texto livre do coach.
 *
 * Ordem de resolução:
 *  1. Filtro neural/lixo no campo `reps` → aquecimento/feeder/reconhecimento
 *     zeram o HSE incondicionalmente (sem dano tecidual = sem volume).
 *  2. Força pura / neural (XRM, "força") → conta, mas com peso fracionado
 *     (STRENGTH_WORK_HSE_WEIGHT), pois há tensão mecânica real, ainda que
 *     subótima para hipertrofia.
 *  2b. Resistência muscular localizada (reps acima de HYPERTROPHY_REP_CEILING,
 *      ex.: "3x100") → conta, mas com peso fracionado
 *      (HIGH_REP_ENDURANCE_HSE_WEIGHT): a série sai da faixa de equivalência
 *      de estímulo por série, então NÃO multiplicamos por reps (isso
 *      superestimaria hipertrofia), reduzimos o peso.
 *  3. Notação "aquecimento + hard sets" no campo `sets` (ex.: "1+3",
 *     "1+1+3") → descarta todos os segmentos exceto o ÚLTIMO, que é
 *     sempre o hard set de verdade nessa convenção.
 *  4. Extração numérica líder padrão (ranges, decimais, "NxM", etc.).
 */
export function extractHardSetsCount(
  rawSets: string | null | undefined,
  rawReps?: string | null | undefined,
): number {
  if (!rawSets) return 0;

  // 1) Filtro de segurança fisiológica: sets de sensação/abertura são 0 HSE.
  const reps = (rawReps ?? "").toLowerCase();
  if (ZERO_HSE_PATTERN.test(reps)) return 0;

  // 2) Peso fracionado nas duas pontas da faixa de hipertrofia. Mutuamente
  //    exclusivos: uma série não é simultaneamente "força pura" (poucas
  //    reps) e "resistência muscular" (reps acima do teto).
  let weight = 1;
  if (STRENGTH_WORK_PATTERN.test(reps)) {
    weight = STRENGTH_WORK_HSE_WEIGHT;
  } else {
    const repsCeiling = extractRepsCeiling(reps);
    if (repsCeiling !== null && repsCeiling > HYPERTROPHY_REP_CEILING) {
      weight = HIGH_REP_ENDURANCE_HSE_WEIGHT;
    }
  }

  const cleanSets = String(rawSets).trim();
  if (!cleanSets) return 0;

  // 3) Notação "warmup+hard sets" (ex.: "1+3" → descarta o 1, fica com o 3).
  //    Convenção: o ÚLTIMO segmento é sempre o hard set real — MAS só quando
  //    ele de fato começa com um número. Se o coach usou o "+" para anexar
  //    uma nota descritiva (ex.: "3x10 + dropset até falha"), o último
  //    segmento não tem dígito líder: nesse caso caímos para o número líder
  //    da string inteira, em vez de zerar um exercício que claramente tem
  //    hard sets prescritos.
  if (cleanSets.includes("+")) {
    const segments = cleanSets.split("+");
    const lastSegment = segments[segments.length - 1];
    const lastSegmentSets = tryExtractLeadingSetsNumber(lastSegment);
    const hardSets = lastSegmentSets !== null ? lastSegmentSets : extractLeadingSetsNumber(cleanSets);
    return hardSets * weight;
  }

  // 4) Caminho padrão: número líder, com postura conservadora em ranges/decimais.
  const hardSets = extractLeadingSetsNumber(cleanSets);
  return hardSets * weight;
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
