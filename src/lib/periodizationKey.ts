// src/lib/periodizationKey.ts
// Identificador ESTÁVEL do tipo de periodização de uma sessão de treino.
//
// Por que não usar `periodization_week` (índice 0..3): o índice não descreve o
// estímulo — o coach pode reordenar/editar as semanas e a "semana 2" passa a
// ser outra coisa. A carga sugerida precisa ser específica do TIPO de semana
// (Força/Pesado, Técnica/Hipertrofia, Resistência, Deload).
//
// Periodização ativa: somente a fase exata; outra fase e legado sem chave
// nunca preenchem a carga. Desligada: último treino geral do exercício.

import { classifyWeekFocus } from "@/lib/periodizationDefaults";

export type PeriodizationKey = "peso" | "tecnica" | "resistencia" | "deload";

export const PERIODIZATION_KEY_LABEL: Record<PeriodizationKey, string> = {
  peso: "Peso", tecnica: "Técnica", resistencia: "Resistência", deload: "Deload",
};

export function periodizationKeyLabel(key: string | null | undefined): string | null {
  return key && Object.prototype.hasOwnProperty.call(PERIODIZATION_KEY_LABEL, key)
    ? PERIODIZATION_KEY_LABEL[key as PeriodizationKey]
    : null;
}

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
 * Fase identificada exige correspondência exata; sem fase não filtra.
 */
export function selectHistoryForPeriodization<T extends { periodization_key?: string | null }>(
  rows: T[],
  periodizationKey: string | null,
): T[] {
  return periodizationKey == null ? (rows ?? []) : (rows ?? []).filter((r) => r?.periodization_key === periodizationKey);
}
