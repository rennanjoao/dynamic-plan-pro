/**
 * dietDayMode.ts — "Hoje não vou treinar" / "Hoje vou treinar" na dieta.
 *
 * Regras definidas pelo Rennan (18/11/2026):
 *  - Só a AÇÃO EXPLÍCITA da aluna muda o dia. Não abrir o app ou não usar o
 *    Modo Treino NÃO significa descanso — nada é inferido.
 *  - Vale só para o dia em que ela tocou (chave por data local).
 *  - "Hoje não vou treinar" (dia de treino): troca para a versão descanso
 *    apenas as refeições que TÊM versão descanso (par treino/descanso) e
 *    baixa o carbo para o nível de dia off.
 *  - "Hoje vou treinar" (dia de descanso): troca só as refeições para a
 *    versão treino; o carbo segue o que o coach planejou para o dia.
 *  - Nada é escondido: os controles por refeição e o seletor de carbo
 *    continuam disponíveis.
 */
import type { CarbLevel } from "@/lib/weekCycle";

export type DayOverride = "rest" | "training";

export interface DayPlanInput {
  /** Há treino marcado para hoje no protocolo. */
  plannedTraining: boolean;
  /** Nível de carbo planejado pelo coach para hoje. */
  plannedCarb: CarbLevel;
  /** Escolha da aluna para hoje (ou null). */
  override: DayOverride | null;
}

export interface DayPlan {
  /** Versão das refeições com par treino/descanso. */
  dayType: "training" | "rest";
  /** Nível de carbo que a tela deve usar. */
  carb: CarbLevel;
  /** A aluna mudou o dia hoje. */
  adjusted: boolean;
}

export function resolveDayPlan({ plannedTraining, plannedCarb, override }: DayPlanInput): DayPlan {
  // Override que repete o planejado não é ajuste.
  if (!override || (override === "training") === plannedTraining) {
    return { dayType: plannedTraining ? "training" : "rest", carb: plannedCarb, adjusted: false };
  }
  if (override === "rest") return { dayType: "rest", carb: "off", adjusted: true };
  return { dayType: "training", carb: plannedCarb, adjusted: true };
}

/**
 * Qual botão oferecer hoje (ou nenhum, quando não mudaria nada).
 * "skip" = "Hoje não vou treinar"; "train" = "Hoje vou treinar".
 */
export function availableDayAction(opts: {
  plannedTraining: boolean;
  plannedCarb: CarbLevel;
  hasPairs: boolean;
  hasCarbCycle: boolean;
}): "skip" | "train" | null {
  if (opts.plannedTraining) {
    const carbWouldDrop = opts.hasCarbCycle && opts.plannedCarb !== "off";
    return opts.hasPairs || carbWouldDrop ? "skip" : null;
  }
  return opts.hasPairs ? "train" : null;
}

// ─── Persistência no aparelho ───────────────────────────────────────────────

const overrideKey = (uid: string, dayKey: string) => `diet_day_override_${uid}_${dayKey}`;
const cookedKey = (uid: string) => `diet_cooked_pref_${uid}`;

export function readDayOverride(uid: string, dayKey: string): DayOverride | null {
  try {
    const v = localStorage.getItem(overrideKey(uid, dayKey));
    return v === "rest" || v === "training" ? v : null;
  } catch {
    return null;
  }
}

export function writeDayOverride(uid: string, dayKey: string, value: DayOverride | null): void {
  try {
    if (value) localStorage.setItem(overrideKey(uid, dayKey), value);
    else localStorage.removeItem(overrideKey(uid, dayKey));
  } catch { /* noop */ }
}

/** Lembra cru/cozido da aluna (decisão: abrir como ela usou da última vez). */
export function readCookedPref(uid: string): boolean | null {
  try {
    const v = localStorage.getItem(cookedKey(uid));
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeCookedPref(uid: string, cooked: boolean): void {
  try { localStorage.setItem(cookedKey(uid), cooked ? "1" : "0"); } catch { /* noop */ }
}
