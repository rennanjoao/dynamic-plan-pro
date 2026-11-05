/**
 * workoutDayOps.ts — operações puras sobre BLOCOS de treino (dias A, B, C…)
 * do protocolo. Hoje: gerar a próxima key livre e duplicar um treino.
 *
 * Regras do projeto respeitadas (AGENTS.md):
 *  - exercícios são identificados pelo `__id` persistido; a cópia recebe `__id`
 *    NOVOS (nunca compartilha id com o original);
 *  - overrides de periodização são ligados por `exerciseId`; a cópia ganha os
 *    overrides do original apontando para os ids novos, com a chave posicional
 *    `${novaKey}_${índice}` mantida só por compatibilidade com payloads legados.
 */
import { genItemId, type ProtocolPayload } from "./protocolSchema";
import { findExerciseOverride } from "./periodizationValidation";

/** Próxima key de treino livre (A–Z), sem colidir com as existentes nem com "REST". */
export function nextWorkoutKey(workouts: Array<{ key?: string }>): string {
  const used = new Set(workouts.map((w) => w.key));
  for (let i = 0; i < 26; i++) {
    const k = String.fromCharCode(65 + i);
    if (!used.has(k) && k !== "REST") return k;
  }
  return `W${Date.now().toString(36)}`;
}

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

type Overrides = ProtocolPayload["periodization"]["overrides"];
type ExerciseOverridePatch = Overrides[string][string];

export interface DuplicateWorkoutDayResult {
  payload: ProtocolPayload;
  /** key do treino novo */
  newKey: string;
  /** posição do treino novo em `payload.workouts` (sempre o fim da lista) */
  newIndex: number;
}

/**
 * Duplica o treino `dayIndex` e acrescenta a cópia no FIM da lista.
 *
 * Por que no fim: a letra exibida (A, B, C…) é a posição na lista. Inserir a
 * cópia no meio faria os treinos seguintes mudarem de letra para o aluno.
 *
 * O que é copiado: foco, todos os exercícios (força e mobilidade, com ids
 * novos), os overrides de periodização de cada exercício e os aeróbicos
 * vinculados a este treino.
 * O que NÃO é copiado: o vínculo com dias da semana — a cópia nasce "Sem dia",
 * para nunca roubar a vaga do treino original.
 *
 * Devolve `null` se o índice não existir.
 */
export function duplicateWorkoutDay(
  payload: ProtocolPayload,
  dayIndex: number,
): DuplicateWorkoutDayResult | null {
  const source = payload.workouts[dayIndex];
  if (!source) return null;

  const newKey = nextWorkoutKey(payload.workouts);
  const newExercises = source.exercises.map((ex) => ({
    ...deepClone(ex),
    __id: genItemId("ex"),
  }));

  // Overrides: para cada semana e exercício, resolve o override do ORIGINAL com a
  // mesma regra do app (id estável primeiro, posição legada depois) e o replica
  // para o exercício novo.
  const per = payload.periodization;
  let nextPeriodization = per;
  if (per?.overrides && Object.keys(per.overrides).length > 0) {
    const nextOverrides: Overrides = { ...per.overrides };
    for (const weekIdx of Object.keys(per.overrides)) {
      const copies: Record<string, ExerciseOverridePatch> = {};
      source.exercises.forEach((_, i) => {
        const found = findExerciseOverride(payload, Number(weekIdx), source.key, i);
        if (!found) return;
        copies[`${newKey}_${i}`] = { ...deepClone(found), exerciseId: newExercises[i].__id };
      });
      if (Object.keys(copies).length > 0) {
        nextOverrides[weekIdx] = { ...(per.overrides[weekIdx] ?? {}), ...copies };
      }
    }
    nextPeriodization = { ...per, overrides: nextOverrides };
  }

  const cardio = payload.cardio ?? [];
  const copiedCardio = cardio
    .filter((c) => c.associationType === "workout" && c.workoutKey === source.key)
    .map((c) => ({ ...deepClone(c), workoutKey: newKey }));

  const nextPayload = {
    ...payload,
    workouts: [
      ...payload.workouts,
      { key: newKey, focus: source.focus, exercises: newExercises },
    ],
    ...(nextPeriodization ? { periodization: nextPeriodization } : {}),
    ...(copiedCardio.length > 0 ? { cardio: [...cardio, ...copiedCardio] } : {}),
  } as ProtocolPayload;

  return { payload: nextPayload, newKey, newIndex: nextPayload.workouts.length - 1 };
}
