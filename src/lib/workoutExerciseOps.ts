/**
 * workoutExerciseOps.ts — helpers puros para operações estruturais em
 * `day.exercises` (inserir, remover, reordenar) que preservam a integridade
 * dos overrides de periodização.
 *
 * CONTEXTO / RISCO: `WorkoutPeriodizationEditor.tsx`, `WeekPreviewDialog.tsx`
 * (via `resolveExerciseForWeek`) e `WorkoutPeriodizationView.tsx` (visão do
 * aluno) indexam overrides por `${day.key}_${exerciseIndex}` — a POSIÇÃO do
 * exercício no array `day.exercises`, não um id estável. Qualquer operação
 * que insira, remova ou reordene itens nesse array desloca os índices dos
 * itens seguintes e faz overrides antigos apontarem para o exercício errado.
 *
 * Em vez de recalcular manualmente esse deslocamento para cada tipo de
 * operação (inserção em massa, remoção, drag-and-drop, swap para
 * cima/baixo), este módulo compara o array ANTES/DEPOIS por `__id` (já
 * gerado por `makeEmptyExercise`/`genItemId` e feito backfill em
 * `WorkoutsTab`) e remapeia os overrides de acordo — uma única rotina
 * genérica e testável, reaproveitada por todas as operações estruturais.
 */
import type { ProtocolPayload } from "./protocolSchema";
import { isMobilityExercise } from "./protocolSchema";

type AnyExercise = { __id?: string; [k: string]: unknown };
type Periodization = ProtocolPayload["periodization"];

/**
 * Compara o array de exercícios antes/depois de uma operação estrutural e
 * devolve, para cada índice antigo, o novo índice do mesmo item (por
 * `__id`) — ou `null` quando o item foi removido (ou não tem `__id`
 * rastreável, caso defensivo para dados legados sem backfill).
 */
export function computeExerciseIndexRemap(
  oldExercises: AnyExercise[],
  newExercises: AnyExercise[],
): Map<number, number | null> {
  const idToNewIndex = new Map<string, number>();
  newExercises.forEach((ex, i) => {
    if (ex.__id) idToNewIndex.set(ex.__id, i);
  });
  const map = new Map<number, number | null>();
  oldExercises.forEach((ex, i) => {
    const newIndex = ex.__id && idToNewIndex.has(ex.__id) ? idToNewIndex.get(ex.__id)! : null;
    map.set(i, newIndex);
  });
  return map;
}

/**
 * Remapeia os overrides de periodização de UM dia (`dayKey`) de acordo com
 * `indexMap` (índice antigo → índice novo, ou `null` = item removido).
 * Overrides de outros dias e semanas sem nenhum override para este dia são
 * preservados por referência (evita re-renders desnecessários e nunca apaga
 * overrides de outros exercícios/dias silenciosamente).
 */
export function remapDayOverrides(
  periodization: Periodization,
  dayKey: string,
  indexMap: Map<number, number | null>,
): Periodization {
  const overrides = periodization.overrides || {};
  const prefix = `${dayKey}_`;
  const dayHasOverrides = Object.values(overrides).some((weekMap) =>
    Object.keys(weekMap || {}).some((id) => id.startsWith(prefix)),
  );
  if (!dayHasOverrides) return periodization;

  const nextOverrides: typeof overrides = {};
  for (const [weekKey, weekMap] of Object.entries(overrides)) {
    const nextWeekMap: Record<string, unknown> = {};
    for (const [id, patch] of Object.entries(weekMap || {})) {
      if (!id.startsWith(prefix)) {
        // Override de outro dia — preserva intacto.
        nextWeekMap[id] = patch;
        continue;
      }
      const oldIdxRaw = id.slice(prefix.length);
      const oldIdx = Number(oldIdxRaw);
      if (!Number.isFinite(oldIdx)) {
        // Formato inesperado — mantém como está em vez de descartar.
        nextWeekMap[id] = patch;
        continue;
      }
      const mapped = indexMap.has(oldIdx) ? indexMap.get(oldIdx) : oldIdx;
      if (mapped == null) continue; // item removido — descarta o override
      nextWeekMap[`${dayKey}_${mapped}`] = patch;
    }
    if (Object.keys(nextWeekMap).length > 0) nextOverrides[weekKey] = nextWeekMap;
  }
  return { ...periodization, overrides: nextOverrides };
}

/**
 * Ponto único de saída: aplica uma nova lista de exercícios a um dia do
 * protocolo, remapeando os overrides de periodização afetados na MESMA
 * atualização (uma única mutação imutável do payload). Toda operação
 * estrutural do builder (inserir em massa, remover, reordenar/drag,
 * swap para cima/baixo) deve passar por aqui em vez de montar
 * `{ ...payload, workouts: ... }` manualmente.
 */
export function applyDayExercisesChange(
  payload: ProtocolPayload,
  dayIndex: number,
  newExercises: AnyExercise[],
): ProtocolPayload {
  const day = payload.workouts[dayIndex];
  if (!day) return payload;
  const indexMap = computeExerciseIndexRemap(day.exercises as AnyExercise[], newExercises);
  const nextWorkouts = [...payload.workouts];
  nextWorkouts[dayIndex] = { ...day, exercises: newExercises as ProtocolPayload["workouts"][number]["exercises"] };
  const nextPeriodization = remapDayOverrides(payload.periodization, day.key, indexMap);
  return { ...payload, workouts: nextWorkouts, periodization: nextPeriodization };
}

/**
 * Monta o novo array de exercícios de um dia ao inserir itens vindos da
 * biblioteca em massa: reconstrói como `[...força, ...novos, ...mobilidade]`,
 * preservando a ordem relativa de cada grupo e colocando as novas entradas
 * no fim da lista de força (antes da mobilidade) — conforme especificado.
 */
export function buildExercisesWithLibraryAdditions(
  exercises: AnyExercise[],
  additions: AnyExercise[],
): AnyExercise[] {
  const strength: AnyExercise[] = [];
  const mobility: AnyExercise[] = [];
  exercises.forEach((ex) => {
    (isMobilityExercise(ex) ? mobility : strength).push(ex);
  });
  return [...strength, ...additions, ...mobility];
}
