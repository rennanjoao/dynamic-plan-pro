// src/lib/periodizationKey.ts
// Identificador ESTÁVEL do tipo de periodização de uma sessão de treino.
//
// Por que não usar `periodization_week` (índice 0..3): o índice não descreve o
// estímulo — o coach pode reordenar/editar as semanas e a "semana 2" passa a
// ser outra coisa. A carga sugerida precisa ser específica do TIPO de semana
// (Força/Pesado, Técnica/Hipertrofia, Resistência, Deload).
//
// Sessões legadas (antes desta feature) gravam `null`. Regra documentada:
// histórico sem chave NUNCA preenche uma periodização identificada — ele só é
// usado quando a sessão atual também não tem periodização (`null`).

import { classifyWeekFocus } from "@/lib/periodizationDefaults";

export type PeriodizationKey = "peso" | "tecnica" | "resistencia" | "deload";

/** Chave usada em memória/localStorage quando a sessão não tem periodização. */
export const LEGACY_BUCKET = "legacy";

export interface BuildPeriodizationKeyInput {
  /** Periodização ligada no protocolo? Se não, a sessão fica sem chave (legado). */
  enabled?: boolean;
  /** Faixa de repetições da semana ativa (ex.: "10 a 12 reps"). */
  reps?: string;
  /** Rótulo da semana ativa (ex.: "Semana 4 — Deload"). */
  label?: string;
  /** Semana de descarga marcada explicitamente. */
  isDeload?: boolean;
}

export function buildPeriodizationKey(input: BuildPeriodizationKeyInput): PeriodizationKey | null {
  if (!input?.enabled) return null;
  if (input.isDeload || /deload|descarga/i.test(input.label ?? "")) return "deload";
  return classifyWeekFocus(input.reps).key;
}

/** Chave do estado da tela (progresso do dia) no localStorage. */
export function workoutStateStorageKey(userId: string, workoutKey: string, periodizationKey: string | null): string {
  return `workout_session_${userId}_${workoutKey}_${periodizationKey ?? LEGACY_BUCKET}`;
}

/** Chave da fila offline de séries no localStorage. */
export function workoutDraftStorageKey(userId: string, workoutKey: string, periodizationKey: string | null): string {
  return `workout_session_draft_${userId}_${workoutKey}_${periodizationKey ?? LEGACY_BUCKET}`;
}

/**
 * Filtra linhas de histórico para a periodização atual.
 * Correspondência EXATA — `null` só casa com `null`.
 */
export function selectHistoryForPeriodization<T extends { periodization_key?: string | null }>(
  rows: T[],
  periodizationKey: string | null,
): T[] {
  return (rows ?? []).filter((r) => (r?.periodization_key ?? null) === (periodizationKey ?? null));
}
