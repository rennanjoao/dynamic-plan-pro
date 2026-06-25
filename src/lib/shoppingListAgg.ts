/**
 * shoppingListAgg.ts
 *
 * Funções de agregação para a Lista de Compras — v4.
 * - Cálculo base (protocolo sem ciclo de carbo)
 * - Cálculo com ciclo de carbo por dia real da semana
 * - Respeita hiddenKinds por refeição
 * - Lógica canônica: ShoppingList.tsx importa daqui, não duplica
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AggItem {
  name: string;
  kind: string;
  /** Total em gramas (ou unidades quando isCount=true) para o período inteiro */
  total: number;
  /** Total por 1 dia (base, sem multiplicador de período) */
  gramsPerDay: number;
  isCount: boolean;
  unit: string;
}

export type CarbLevel = "high" | "base" | "off";

// Ordem canônica dos dias da semana (segunda → domingo)
const WEEK_DAY_KEYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

// JS Date.getDay(): 0=dom, 1=seg … 6=sab
const JS_DAY_TO_KEY: Record<number, string> = {
  0: "dom",
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

export function stripHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

// ─── Name normalisation ───────────────────────────────────────────────────────

export function normalizeName(raw: string): string {
  if (!raw) return "";
  return stripHtml(raw).toLowerCase().trim();
}

// ─── Weight parsing ───────────────────────────────────────────────────────────

/**
 * Retorna gramas a partir de um item de protocolo.
 * Prioridade: item.rawWeight (TACO) > parse de item.weight (string).
 */
export function parseGrams(item: any): number {
  if (!item) return 0;

  if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
    return item.rawWeight;
  }

  const raw: string = String(item.weight ?? "").trim().replace(",", ".");
  if (!raw) return 0;

  const match = raw.match(/^([\d.]+)\s*(g|kg|ml|l)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "kg") return value * 1000;
  if (unit === "l") return value * 1000;
  return value;
}

/**
 * Detecta a unidade de display do item.
 * Retorna "ml", "l", "kg", "un" ou "g".
 */
export function parseUnit(item: any): string {
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) return "g";
  const raw = String(item.weight ?? "").trim();
  const m = raw.match(/^[\d.,]+\s*(g|kg|ml|l|un|unid)/i);
  return m ? m[1].toLowerCase() : "g";
}

// ─── Quantity formatting ──────────────────────────────────────────────────────

export function formatQty(grams: number, unit = "g"): string {
  if (unit === "ml" || unit === "l") {
    const total = Math.round(grams);
    return total >= 1000
      ? `${(total / 1000).toFixed(total % 1000 === 0 ? 0 : 1)} l`
      : `${total} ml`;
  }
  const rounded = Math.round(grams);
  if (rounded < 1000) return `${rounded} g`;
  const kg = grams / 1000;
  return Number.isInteger(kg) ? `${kg} kg` : `${kg.toFixed(2)} kg`;
}

export function formatAggItem(item: Pick<AggItem, "total" | "isCount" | "unit">): string {
  if (item.isCount) return `${Math.round(item.total)} ${item.unit}`;
  return formatQty(item.total, item.unit);
}

// ─── Carb cycle helpers ───────────────────────────────────────────────────────

function normalizeCarb(v: unknown): CarbLevel {
  if (v === "high" || v === "base" || v === "off") return v;
  if (v === "low") return "off";
  return "base";
}

function carbMultiplier(level: CarbLevel, highPct: number, lowPct: number): number {
  if (level === "high") return 1 + highPct / 100;
  if (level === "off") return 1 - lowPct / 100;
  return 1.0;
}

/**
 * Constrói o fator total de carboidrato para o período.
 *
 * Para períodos ≤ 7 dias: itera os dias reais a partir de hoje.
 * Para períodos > 7 dias: calcula 1 semana completa (seg→dom) e extrapola.
 */
export function buildCarbMultipliers(
  carbCycle: Record<string, unknown>,
  highPct: number,
  lowPct: number,
  days: number,
  startDayIndex?: number,
): number[] {
  const startJsDay = startDayIndex ?? new Date().getDay();

  if (days <= 7) {
    return Array.from({ length: days }, (_, i) => {
      const jsDay = (startJsDay + i) % 7;
      const key = JS_DAY_TO_KEY[jsDay];
      const level = normalizeCarb(carbCycle[key]);
      return carbMultiplier(level, highPct, lowPct);
    });
  }

  // Para períodos > 7 dias: calcula os multiplicadores de 1 semana (seg→dom)
  const weekMultipliers = WEEK_DAY_KEYS.map((key) => {
    const level = normalizeCarb(carbCycle[key]);
    return carbMultiplier(level, highPct, lowPct);
  });

  const weekSum = weekMultipliers.reduce((a, b) => a + b, 0);
  const fullWeeks = Math.floor(days / 7);
  const extraDays = days % 7;
  const extraSum = WEEK_DAY_KEYS.slice(0, extraDays).reduce((sum, key) => {
    return sum + carbMultiplier(normalizeCarb(carbCycle[key]), highPct, lowPct);
  }, 0);

  const totalFactor = fullWeeks * weekSum + extraSum;
  const perDay = totalFactor / days;
  return Array.from({ length: days }, () => perDay);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface ShoppingAggOptions {
  meals: any[];
  selectedOptions?: Record<string, number>;
  days?: number;
  carbCycle?: Record<string, unknown>;
  carbCycleHighPct?: number;
  carbCycleLowPct?: number;
}

/**
 * Agrega itens de todas as refeições numa lista de compras.
 * Respeita ciclo de carbo e hiddenKinds.
 */
export function aggregateShoppingList({
  meals,
  selectedOptions = {},
  days = 1,
  carbCycle = {},
  carbCycleHighPct = 15,
  carbCycleLowPct = 15,
}: ShoppingAggOptions): AggItem[] {
  if (!Array.isArray(meals) || meals.length === 0) return [];

  const hasCarbCycle =
    Object.keys(carbCycle).length > 0 &&
    Object.values(carbCycle).some((v) => v === "high" || v === "off" || v === "low");

  const carbMultipliers = hasCarbCycle
    ? buildCarbMultipliers(carbCycle, carbCycleHighPct, carbCycleLowPct, days)
    : null;

  const carbFactor = carbMultipliers
    ? carbMultipliers.reduce((a, b) => a + b, 0)
    : days;

  const acc: Record
    string,
    { name: string; kind: string; gramsPerDay: number; unit: string }
  > = {};

  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
    const hidden: string[] = Array.isArray(meal.hiddenKinds) ? meal.hiddenKinds : [];

    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = o?.kind || "other";
      (byKind[k] ||= []).push(o);
    });

    Object.entries(byKind).forEach(([kind, options]) => {
      if (hidden.includes(kind)) return;

      const selKey = `${mi}:${kind}`;
      const selIdx = selectedOptions[selKey] ?? 0;
      const chosen = options[Math.min(selIdx, options.length - 1)];
      if (!chosen) return;

      const items: any[] = Array.isArray(chosen.items) ? chosen.items : [];
      items.forEach((item) => {
        const grams = parseGrams(item);
        if (grams === 0) return;

        const rawName = item.baseName || item.name || "";
        const name = stripHtml(rawName).trim();
        if (!name) return;

        const unit = parseUnit(item);
        const normKey = `${normalizeName(rawName)}|${kind}`;

        if (!acc[normKey]) {
          acc[normKey] = { name, kind, gramsPerDay: 0, unit };
        }
        acc[normKey].gramsPerDay += grams;
      });
    });
  });

  return Object.values(acc).map(({ name, kind, gramsPerDay, unit }) => {
    const factor = kind === "carb" && hasCarbCycle ? carbFactor : days;
    return {
      name,
      kind,
      gramsPerDay,
      total: gramsPerDay * factor,
      isCount: false,
      unit,
    };
  });
}
