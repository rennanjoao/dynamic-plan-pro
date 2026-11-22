// src/lib/weekTraining.ts
//
// "Dias de treino por semana" calculado da faixa da semana (aba Treino), em
// vez de digitado à mão na aba Macros (auditoria de 21/11/2026, Pacote B).
// Antes os dois podiam discordar — ex.: semana com 4 treinos e o campo em 5,
// errando a média calórica semanal das refeições de treino/descanso.

import { DAY_KEYS } from "@/lib/weekCycle";

/**
 * Quantos dias da semana têm um treino que existe no protocolo.
 * `null` quando a semana ainda não foi montada (nenhum dia escolhido) — aí
 * quem chama usa o valor antigo salvo como reserva.
 */
export function trainingDaysFromWeek(
  weekDays: Record<string, string> | null | undefined,
  workouts: Array<{ key?: string }> | null | undefined,
): number | null {
  const days = weekDays ?? {};
  const keys = new Set((workouts ?? []).map((w) => String(w?.key ?? "")).filter(Boolean));
  let assigned = 0;
  let training = 0;
  for (const d of DAY_KEYS) {
    const v = String(days[d] ?? "").trim();
    if (!v) continue;
    assigned++;
    if (v !== "REST" && keys.has(v)) training++;
  }
  return assigned === 0 ? null : training;
}
