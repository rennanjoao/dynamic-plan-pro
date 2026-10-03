// src/lib/periodizationKey.ts
// Dois eixos: periodization_key é o tipo da semana (rótulos e filtro de sessões);
// periodization_week é sua posição 0..3 (histórico de cargas série a série).
// Se o coach reordenar semanas, as cargas seguem a posição, não o estímulo.
// Sem periodização, o histórico de carga usa os últimos treinos gerais.

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

/** Semana usada como gaveta do histórico de carga; sem periodização, null. */
export function periodizationWeekSlot(enabled: boolean | undefined, weekIdx: number | null | undefined): number | null {
  if (!enabled) return null;
  return Number.isInteger(weekIdx) && (weekIdx as number) >= 0 ? (weekIdx as number) : null;
}

/** Chave do estado da tela (progresso do dia) no localStorage. */
export function workoutStateStorageKey(userId: string, workoutKey: string, periodizationKey: string | null, weekSlot: number | null = null): string {
  const base = `workout_session_${userId}_${workoutKey}_${periodizationKey ?? LEGACY_BUCKET}`;
  return weekSlot == null ? base : `${base}_w${weekSlot}`;
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
