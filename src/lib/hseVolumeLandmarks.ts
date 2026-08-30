// src/lib/hseVolumeLandmarks.ts
//
// ⚠️ NOME DELIBERADAMENTE DIFERENTE DE `volumeLandmarks.ts` — LEIA ANTES DE MEXER.
// Já existe em produção um módulo `src/lib/volumeLandmarks.ts` (+ cópia Deno em
// supabase/functions/_shared/volumeLandmarks.ts, com teste de paridade em
// src/lib/__tests__/classifierParity.test.ts) que alimenta HOJE:
//   - src/components/coach/StudentWorkoutAnalytics.tsx — análise RETROSPECTIVA
//     do volume que o aluno de fato executou (workout logbook, últimos 7 dias).
//   - supabase/functions/workout-alert-engine/index.ts — alerta "volume_mrv".
// Esse módulo antigo usa uma interface diferente (sem "mv", `mavMin`/`mavMax`
// separados em vez de tupla, `VolumeStatus` com só 4 estados) e números de
// literatura genérica de treino (ACSM/NSCA/Schoenfeld — ver cabeçalho do
// próprio arquivo), não os valores RP aprovados para o motor de HSE.
// Sobrescrever aquele arquivo mudaria silenciosamente o comportamento de duas
// features já em produção e quebraria o teste de paridade citado acima.
//
// Este arquivo aqui é o dicionário RP (MV/MEV/MAV/MRV) do MOTOR PREDITIVO DE
// HSE — consumidor novo e independente, que lê a PRESCRIÇÃO do coach
// (payload.workouts, no protocol builder), não o histórico executado pelo
// aluno. Roda 100% no client (WorkoutsTab); não precisa de cópia Deno porque
// nenhuma edge function participa desse cálculo.
//
// Referências de volume semanal por grupo muscular, em Hard Set Equivalents
// (HSE) por semana, segundo a metodologia de Volume Landmarks da Renaissance
// Periodization (RP):
//   - MV  (Maintenance Volume):      mínimo para MANTER o músculo já construído.
//   - MEV (Minimum Effective Volume): mínimo para gerar hipertrofia de forma consistente.
//   - MAV (Maximum Adaptive Volume):  faixa [min, max] de melhor relação estímulo/fadiga.
//   - MRV (Maximum Recoverable Volume): teto de volume que ainda é recuperável em uma semana.

import type { MuscleGroup } from "@/lib/muscleGroupClassifier";

export interface HseVolumeLandmark {
  mv: number;
  mev: number;
  /** [mínimo, máximo] da faixa adaptativa — a "zona ótima" de treino. */
  mav: [number, number];
  mrv: number;
}

/**
 * Nem todo grupo do enum `MuscleGroup` (src/lib/muscleGroupClassifier.ts) tem
 * landmark RP validado nesta v1 — por isso o mapa é PARCIAL. `getHseVolumeLandmark`
 * retorna `null` para um grupo ausente, e o motor de cálculo (volumeCalculator.ts)
 * trata isso como um estado explícito ("sem landmark configurado"), nunca como
 * zero e nunca inventando um número aproximado sem validação humana.
 */
export type HseVolumeLandmarkMap = Partial<Record<MuscleGroup, HseVolumeLandmark>>;

/**
 * ⚠️ DECISÃO DE ENGENHARIA — grupo "ombro" (favor validar):
 * A RP trata deltoide anterior, lateral e posterior como 3 grupos
 * independentes, cada um com landmark próprio. O enum `MuscleGroup` desta
 * base de código tem um único bucket "ombro" — e ele é compartilhado com a
 * cópia Deno de `muscleGroupClassifier.ts` e com a CHECK constraint
 * `exercise_library_primary_muscle_group_valid` no Postgres. Estender esse
 * enum para separar os 3 deltoides é uma mudança de escopo maior (schema +
 * duas cópias de classificador + migração), fora do combinado para esta
 * tarefa ("não tocar em muscleGroupClassifier.ts").
 *
 * Enquanto isso não muda, os 3 valores de deltoide fornecidos foram
 * consolidados em UM landmark para "ombro", usando os números de Deltoide
 * Lateral (MV 6, MEV 8, MAV [12,20], MRV 25): é a cabeça que concentra a
 * maior parte do volume direto de ombro na prática (elevação lateral,
 * desenvolvimento) e a mais próxima de referências RP não-segmentadas por
 * cabeça. É uma aproximação, não uma medição por cabeça — times que
 * precisem disso vão precisar da mudança de escopo maior descrita acima.
 */
export const HSE_VOLUME_LANDMARKS: HseVolumeLandmarkMap = {
  peito: { mv: 4, mev: 8, mav: [12, 20], mrv: 22 },
  costas: { mv: 6, mev: 10, mav: [14, 22], mrv: 25 },
  quadriceps: { mv: 6, mev: 8, mav: [12, 18], mrv: 20 },
  posterior_coxa: { mv: 4, mev: 6, mav: [10, 16], mrv: 18 }, // Isquiotibiais
  gluteo: { mv: 4, mev: 6, mav: [10, 20], mrv: 25 },
  ombro: { mv: 6, mev: 8, mav: [12, 20], mrv: 25 }, // consolidado — ver nota acima
  biceps: { mv: 4, mev: 6, mav: [10, 16], mrv: 22 },
  triceps: { mv: 4, mev: 6, mav: [10, 16], mrv: 22 },
  panturrilha: { mv: 6, mev: 8, mav: [12, 20], mrv: 25 },
  abdomen: { mv: 0, mev: 0, mav: [4, 12], mrv: 16 },
};

/**
 * Grupos do enum `MuscleGroup` sem landmark RP definido nesta v1 (trapézio,
 * lombar, antebraço, adutores) — não fazem parte da lista de "grandes
 * grupos" fornecida para esta rodada de valores. `src/lib/volumeLandmarks.ts`
 * (o módulo retrospectivo já existente) até tem números de referência para
 * esses 4 grupos, mas eles vêm de uma fonte diferente (ACSM/NSCA/Schoenfeld,
 * não RP) — misturar as duas fontes sob esta tabela RP seria impreciso, e o
 * próprio cabeçalho daquele arquivo já avisa para não tratar aqueles números
 * como metodologia oficial. Por isso ficam de fora aqui até serem validados
 * especificamente na metodologia RP.
 */
export const HSE_UNCONFIGURED_GROUPS: MuscleGroup[] = ["trapezio", "lombar", "antebraco", "adutores"];

/** Retorna o landmark RP de um grupo, ou `null` se ainda não configurado. */
export function getHseVolumeLandmark(group: MuscleGroup): HseVolumeLandmark | null {
  return HSE_VOLUME_LANDMARKS[group] ?? null;
}
