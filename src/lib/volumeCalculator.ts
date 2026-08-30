// src/lib/volumeCalculator.ts
//
// Motor Preditivo de Volume de Treino (HSE — Hard Set Equivalents).
// Lê a PRESCRIÇÃO do coach (payload.workouts, protocol builder) — nunca o
// histórico executado pelo aluno — e projeta, por grupo muscular, quantas
// séries efetivas por semana o protocolo atual gera, contra os landmarks RP
// definidos em `hseVolumeLandmarks.ts`.
//
// Convenção de HSE: série do exercício conta 1.0 para o grupo muscular
// primário e 0.5 para cada grupo secundário (mesma convenção já usada em
// src/components/coach/StudentWorkoutAnalytics.tsx para o cálculo
// retrospectivo — aqui é o equivalente prospectivo, sobre o plano).
//
// Este módulo é síncrono e puro por design: `exerciseLibrary.ts` carrega do
// Supabase de forma assíncrona (loadLibrary()), então o chamador (o futuro
// componente de dashboard) resolve a Promise UMA vez, guarda o Map resultante
// em estado local, e só então chama as funções daqui — o que mantém esse
// arquivo trivialmente testável e compatível com useMemo, no mesmo padrão já
// usado para dayMacros/trainingTotals em MacrosTab.tsx.

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

/** Um dia de treino, no mesmo formato usado por `payload.workouts`. */
type WorkoutDay = ProtocolPayload["workouts"][number];

// ─────────────────────────────────────────────────────────────────────────
// 1. REGEX — extração do número de Hard Sets a partir do campo livre `sets`
// ─────────────────────────────────────────────────────────────────────────

/**
 * Extrai o número de séries "duras" (Hard Sets) do campo de texto livre que
 * o coach digita em cada exercício (`exercise.sets`).
 *
 * Regra (v1, aprovada): pega apenas o PRIMEIRO número inteiro no início da
 * string, ignorando qualquer coisa depois. Não tenta interpretar semântica
 * de técnica avançada ("rest pause", "drop set", "bi-set" etc.) — conta o
 * número literal escrito, exatamente como o coach digitou.
 *
 *   "4x12"          -> 4
 *   "3 rest pause"  -> 3
 *   "4"             -> 4
 *   "  5 séries"    -> 5   (espaços à esquerda são tolerados)
 *   "3 a 4 séries"  -> 3   (primeiro número, leitura conservadora)
 *   "x5"            -> 0   (não começa com dígito)
 *   ""              -> 0
 *   undefined/null  -> 0
 *
 * Nunca lança erro — qualquer entrada que não comece com um inteiro vira 0.
 */
export function extractHardSetsCount(rawSets: string | null | undefined): number {
  if (!rawSets) return 0;

  const match = rawSets.trim().match(/^(\d+)/);
  if (!match) return 0;

  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. RESOLUÇÃO DE GRUPO MUSCULAR — libraryMap -> fallback classificador
// ─────────────────────────────────────────────────────────────────────────

export interface ResolvedMuscleGroups {
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  /** De onde veio a classificação — só para depuração/telemetria, opcional de usar na UI. */
  source: "library" | "name_classifier";
}

/**
 * Resolve o(s) grupo(s) muscular(es) de um exercício da prescrição, na mesma
 * ordem de prioridade já usada por `getLibraryEntry` (exerciseLibrary.ts):
 *
 *   1. `exercise.gifKey` bate com uma entrada carregada da exercise_library
 *      (classificação cadastrada manualmente ou já auto-classificada lá)
 *      -> usa `primaryMuscleGroup` / `secondaryMuscleGroups` de lá.
 *   2. Sem gifKey (ou gifKey não encontrado), tenta o NOME normalizado
 *      (`toExerciseKey`) como chave da mesma library — cobre protocolos
 *      legados que referenciam o exercício só pelo nome.
 *   3. Se a library não tiver classificação para esse exercício (ou o campo
 *      `primaryMuscleGroup` de lá ainda estiver `null` — gif cadastrado mas
 *      não classificado), cai para `classifyExerciseByName` (o mesmo
 *      classificador por palavra-chave usado no restante do app).
 *   4. Se nada resolver, retorna `null` — o chamador decide o que fazer
 *      (aqui: excluir do HSE e reportar como "não classificado").
 *
 * Nunca lança erro e nunca adivinha um grupo "genérico" — silêncio (`null`)
 * é sempre preferível a um número de HSE que parece certo mas não é.
 */
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
// 3. STATUS — HSE semanal de um grupo x landmark RP
// ─────────────────────────────────────────────────────────────────────────

export type VolumeStatus =
  | "abaixo_mv" // hse < MV — nem mantém o músculo já construído
  | "manutencao" // MV <= hse < MEV — mantém, não é suficiente para crescer
  | "crescimento" // MEV <= hse < MAV_min — já é produtivo, ainda não é o pico
  | "otimo" // MAV_min <= hse <= MAV_max — faixa de melhor relação estímulo/fadiga
  | "alerta" // MAV_max < hse < MRV — retorno decrescente, perto do teto
  | "acima_mrv" // hse >= MRV — provavelmente acima do que dá para recuperar
  | "sem_landmark"; // grupo sem landmark RP configurado (ver HSE_UNCONFIGURED_GROUPS)

/**
 * Classifica um total semanal de HSE contra o landmark RP do grupo.
 * Fronteiras são meio-abertas e consistentes (`[mv, mev)`, `[mev, mavMin)`,
 * `[mavMin, mavMax]`, `(mavMax, mrv)`, `[mrv, ∞)`), assumindo a ordenação
 * `mv <= mev <= mavMin <= mavMax <= mrv` nos dados de `hseVolumeLandmarks.ts`.
 *
 * Caso especial esperado: grupos com `mv === mev` (ex. abdômen, MV 0 / MEV 0)
 * pulam direto de "abaixo_mv" (impossível, hse nunca é negativo) para
 * "crescimento" já em hse = 0 — não é bug, é a RP dizendo que esse grupo não
 * tem uma zona de "manutenção" distinta.
 */
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
// 4. FREQUÊNCIA SEMANAL — payload.weekDays -> quantas vezes/semana cada
//    workout key realmente acontece (splits rotativos treinam o mesmo
//    workout mais de uma vez por semana; ver nota em calculateWeeklyVolume)
// ─────────────────────────────────────────────────────────────────────────

function buildWorkoutFrequencyMap(weekDays: Record<string, string> | undefined | null): Map<string, number> {
  const frequency = new Map<string, number>();
  if (!weekDays) return frequency;

  for (const rawValue of Object.values(weekDays)) {
    const value = (rawValue ?? "").trim();
    if (!value || value.toLowerCase() === "rest") continue; // "" ou "rest" = sem treino nesse dia
    frequency.set(value, (frequency.get(value) ?? 0) + 1);
  }

  return frequency;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. AGREGAÇÃO SEMANAL — o cálculo completo
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
  /** Total de HSE por semana já ponderado (1.0 primário / 0.5 secundário) e já multiplicado pela frequência semanal do treino. */
  hse: number;
  landmark: HseVolumeLandmark | null;
  status: VolumeStatus;
}

export interface WeeklyVolumeReport {
  /** Uma linha por grupo do enum `MuscleGroup` (mesmo os com hse = 0) — o dashboard sempre tem a lista completa para renderizar. */
  byMuscleGroup: MuscleGroupVolume[];
  /** Exercícios com séries prescritas (>0) que não puderam ser classificados em nenhum grupo muscular. */
  unclassifiedExercises: SkippedExercise[];
  /** Quantos exercícios de mobilidade/alongamento (is_mobility) foram encontrados e excluídos do HSE (não é um problema — é o comportamento esperado). */
  mobilityExcludedCount: number;
  /** Workouts que existem em `payload.workouts` mas não estão atribuídos a nenhum dia em `payload.weekDays` — contribuem 0 para o total semanal. */
  unscheduledWorkoutKeys: string[];
  /** Soma de HSE de todos os grupos — só informativo (não é um número com significado fisiológico próprio). */
  totalHse: number;
}

/**
 * Calcula o volume semanal em HSE por grupo muscular a partir da prescrição
 * do coach.
 *
 * IMPORTANTE — por que `weekDays` é obrigatório aqui e não só `workouts`:
 * um mesmo workout (ex. a chave "A") pode estar agendado em mais de um dia
 * da semana (ex. split ABC repetido = 6 dias de treino a partir de 3
 * templates). Somar cada workout template uma única vez, ignorando quantas
 * vezes ele de fato se repete na semana, SUBESTIMARIA o volume semanal real
 * em qualquer split rotativo — que é exatamente o cenário mais comum em
 * programas de hipertrofia. `weekDays` é o mapa dia-da-semana -> workout key
 * (`payload.weekDays`, já usado hoje em `src/lib/weekCycle.ts` e no "week
 * strip" do WorkoutsTab) — é ele quem diz quantas vezes por semana cada
 * template realmente treina.
 *
 * Puro e síncrono: `libraryMap` já deve estar resolvido (ver cabeçalho do
 * arquivo). Nunca lança erro para dados malformados — na dúvida, exclui do
 * cálculo e reporta, em vez de adivinhar.
 */
export function calculateWeeklyVolume(
  workouts: WorkoutDay[] | undefined | null,
  weekDays: Record<string, string> | undefined | null,
  libraryMap: Map<string, LibraryEntry>,
): WeeklyVolumeReport {
  const frequency = buildWorkoutFrequencyMap(weekDays);

  // Todo grupo do enum começa em 0 — garante uma linha por grupo no relatório
  // final, mesmo que nenhum exercício da semana o treine (isso também é um
  // dado útil para o coach: "Bíceps: 0 HSE").
  const hseByGroup = new Map<MuscleGroup, number>(MUSCLE_GROUP_OPTIONS.map((group) => [group, 0]));

  const unclassifiedExercises: SkippedExercise[] = [];
  let mobilityExcludedCount = 0;

  for (const day of workouts ?? []) {
    const timesPerWeek = frequency.get(day.key) ?? 0;
    if (timesPerWeek === 0) continue; // não agendado em nenhum dia desta semana: não contribui.

    for (const exercise of day.exercises ?? []) {
      if (isMobilityExercise(exercise)) {
        mobilityExcludedCount += 1;
        continue;
      }

      const hardSetsPerOccurrence = extractHardSetsCount(exercise.sets);
      const resolved = resolveExerciseMuscleGroups(exercise, libraryMap);

      if (!resolved) {
        if (hardSetsPerOccurrence > 0) {
          // Só reporta como "não computado" quem de fato tem séries
          // prescritas — uma linha em branco (exercício não preenchido)
          // não é um problema de classificação, é só uma linha vazia.
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

/**
 * Atalho de conveniência para o componente de UI: evita que o chamador tenha
 * que desestruturar `payload.workouts`/`payload.weekDays` toda vez.
 * `calculateWeeklyVolume` continua sendo a função "de verdade" (mais fácil
 * de testar isoladamente); esta é só um wrapper fino por cima dela.
 */
export function calculateWeeklyVolumeFromPayload(
  payload: Pick<ProtocolPayload, "workouts" | "weekDays">,
  libraryMap: Map<string, LibraryEntry>,
): WeeklyVolumeReport {
  return calculateWeeklyVolume(payload.workouts, payload.weekDays, libraryMap);
}
