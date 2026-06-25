/**
 * shoppingListAgg.ts — Biblioteca de agregação da Lista de Compras v4
 *
 * Funções puras exportadas:
 *   stripHtml       — remove tags HTML e &nbsp;
 *   normalizeName   — lowercase + trim + stripHtml (idempotente)
 *   parseGrams      — extrai gramas de um item (rawWeight > weight textual)
 *   parseUnit       — detecta unidade de volume (ml/l) ou peso (g/kg)
 *   formatQty       — formata gramas em string legível (g ou kg)
 *   aggregateShoppingList — agrega itens de todas as refeições com suporte a
 *                           seleção de opções, hiddenKinds e ciclo de carbo
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface AggItem {
  name: string;        // nome normalizado (capitalizado para exibição)
  kind: string;        // "protein" | "carb" | "fat" | "veg" | "other"
  unit: string;        // "g" | "ml" — unidade base
  gramsPerDay: number; // soma diária (em gramas ou ml)
  total: number;       // gramsPerDay × days (ajustado por ciclo de carbo se kind=carb)
}

export interface AggregateParams {
  meals: any[];
  selectedOptions?: Record<string, number>; // chave "mealIdx:kind" → índice da opção
  days?: number;
  carbCycle?: Record<string, unknown>;      // { mon: "high", tue: "off", ... }
  carbCycleHighPct?: number;                // default 15
  carbCycleLowPct?: number;                 // default 15
}

// ─── Helpers de string ─────────────────────────────────────────────────────────

/** Remove tags HTML e entidades &nbsp; */
export function stripHtml(s: string): string {
  if (!s) return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

/**
 * Normaliza nome para uso como chave de agregação:
 * strip HTML → trim → lowercase
 * Idempotente: normalizeName(normalizeName(x)) === normalizeName(x)
 */
export function normalizeName(s: string): string {
  if (!s) return "";
  return stripHtml(s).trim().toLowerCase();
}

/** Capitaliza primeira letra de cada palavra (para exibição) */
function toDisplayName(s: string): string {
  return s
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

// ─── Parsers de quantidade ─────────────────────────────────────────────────────

/**
 * Detecta se o item usa unidade de volume (ml/l) ou peso (g/kg).
 * Retorna "ml" ou "g".
 */
export function parseUnit(item: any): string {
  if (!item) return "g";
  const w: string = String(item.weight || "").trim().toLowerCase();
  if (/ml|l\b/.test(w)) return "ml";
  return "g";
}

/**
 * Extrai o valor numérico em gramas (ou ml) de um item do protocolo.
 *
 * Prioridade:
 *   1. item.rawWeight  — número bruto em gramas (campo TACO)
 *   2. item.weight     — string com unidade: "150g", "1.5kg", "200ml", "1L",
 *                        também aceita vírgula decimal pt-BR: "1,5kg"
 *
 * Retorna 0 se não conseguir extrair.
 */
export function parseGrams(item: any): number {
  if (!item) return 0;

  // 1. rawWeight numérico direto
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
    return item.rawWeight;
  }

  const raw: string = String(item.weight || "")
    .trim()
    .replace(",", ".") // vírgula pt-BR → ponto
    .toLowerCase();

  if (!raw) return 0;

  const match = raw.match(/^([\d.]+)\s*(g|kg|ml|l)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  if (isNaN(value)) return 0;

  const unit = match[2] || "g";

  if (unit === "kg") return value * 1000;
  if (unit === "l") return value * 1000;
  return value; // g ou ml — escala 1:1
}

// ─── Formatação de quantidade ──────────────────────────────────────────────────

/**
 * Formata uma quantidade em gramas (ou ml) como string legível.
 *
 * Regras:
 *   < 1000  → "150 g"  (arredondado)
 *   = 1000  → "1 kg"
 *   > 1000  → "1.50 kg" (2 decimais, remove zeros à direita)
 *
 * Quando unit="ml", usa "ml" e "l" no lugar de "g" e "kg".
 */
export function formatQty(grams: number, unit?: string): string {
  const isVolume = unit === "ml";
  const rounded = Math.round(grams);

  if (rounded < 1000) {
    return `${rounded} ${isVolume ? "ml" : "g"}`;
  }

  const kg = grams / 1000;
  // Remove zeros à direita: 1.50 kg, 1 kg, 10 kg
  const formatted =
    kg % 1 === 0
      ? `${kg} ${isVolume ? "l" : "kg"}`
      : `${kg.toFixed(2)} ${isVolume ? "l" : "kg"}`;

  return formatted;
}

// ─── Ciclo de carbo ────────────────────────────────────────────────────────────

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Calcula o multiplicador de carboidratos para um dado dia do ciclo.
 * high → 1 + pct/100
 * off | low → 1 - pct/100
 * base / ausente → 1.0
 */
function carbMultiplier(
  dayValue: unknown,
  highPct: number,
  lowPct: number,
): number {
  if (dayValue === "high") return 1 + highPct / 100;
  if (dayValue === "off" || dayValue === "low") return 1 - lowPct / 100;
  return 1.0;
}

/**
 * Dado um período em dias a partir de hoje, retorna o multiplicador médio
 * de carboidratos considerando os dias reais da semana.
 */
function avgCarbMultiplier(
  days: number,
  carbCycle: Record<string, unknown>,
  highPct: number,
  lowPct: number,
): number {
  if (!carbCycle || Object.keys(carbCycle).length === 0) return 1.0;

  const today = new Date();
  let sum = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayKey = DAY_KEYS[d.getDay()];
    const val = carbCycle[dayKey];
    sum += carbMultiplier(val, highPct, lowPct);
  }

  return sum / days;
}

// ─── Agregação principal ───────────────────────────────────────────────────────

/**
 * Agrega todos os itens alimentares das refeições em uma lista de compras.
 *
 * - Itera sobre `meals` e suas `options`
 * - Quando há conflito de opções (múltiplos grupos do mesmo kind), usa
 *   `selectedOptions["mealIdx:kind"]` para saber qual opção incluir;
 *   se não houver seleção, usa a opção 0 como padrão
 * - Respeita `meal.hiddenKinds` — kinds ocultos são ignorados
 * - Itens com mesmo nome normalizado e mesmo kind são somados
 * - Multiplica por `days`
 * - Aplica multiplicador de ciclo de carbo nos itens de kind "carb"
 */
export function aggregateShoppingList(
  paramsOrMeals: AggregateParams | any[],
  selectedOptionsLegacy?: Record<string, number>,
  daysLegacy?: number,
): AggItem[] {
  // Suporte à assinatura antiga usada nos testes: aggregateShoppingList(meals, selectedOptions?)
  let meals: any[];
  let selectedOptions: Record<string, number>;
  let days: number;
  let carbCycle: Record<string, unknown>;
  let carbCycleHighPct: number;
  let carbCycleLowPct: number;

  if (Array.isArray(paramsOrMeals)) {
    meals = paramsOrMeals;
    selectedOptions = selectedOptionsLegacy ?? {};
    days = daysLegacy ?? 1;
    carbCycle = {};
    carbCycleHighPct = 15;
    carbCycleLowPct = 15;
  } else {
    ({
      meals,
      selectedOptions = {},
      days = 7,
      carbCycle = {},
      carbCycleHighPct = 15,
      carbCycleLowPct = 15,
    } = paramsOrMeals);
  }

  // Mapa de agregação: chave = "kind:normalizedName"
  const map = new Map<
    string,
    { name: string; kind: string; unit: string; gramsPerDay: number }
  >();

  meals.forEach((meal, mi) => {
    const opts: any[] = Array.isArray(meal?.options) ? meal.options : [];
    const hidden: string[] = Array.isArray(meal?.hiddenKinds)
      ? meal.hiddenKinds
      : [];

    // Agrupa opções por kind
    const byKind: Record<string, any[]> = {};
    opts.forEach((o) => {
      const k = String(o?.kind || "other");
      (byKind[k] = byKind[k] || []).push(o);
    });

    Object.entries(byKind).forEach(([kind, kindOpts]) => {
      // Ignora kinds ocultos nesta refeição
      if (hidden.includes(kind)) return;

      // Determina qual opção usar
      const selKey = `${mi}:${kind}`;
      let chosenOpt: any;

      if (kindOpts.length <= 1) {
        // Sem conflito — usa a única opção disponível
        chosenOpt = kindOpts[0];
      } else {
        // Há conflito — usa a seleção do usuário (padrão: opção 0)
        const selIdx = selectedOptions[selKey] ?? 0;
        chosenOpt = kindOpts[selIdx] ?? kindOpts[0];
      }

      if (!chosenOpt) return;

      const items: any[] = Array.isArray(chosenOpt.items) ? chosenOpt.items : [];

      items.forEach((it) => {
        const g = parseGrams(it);
        if (g <= 0) return; // ignora itens sem peso

        const rawName = stripHtml(it?.baseName || it?.name || "");
        if (!rawName) return;

        const normalized = normalizeName(rawName);
        const unit = parseUnit(it);
        const aggKey = `${kind}:${normalized}`;

        const existing = map.get(aggKey);
        if (existing) {
          existing.gramsPerDay += g;
        } else {
          map.set(aggKey, {
            name: toDisplayName(rawName),
            kind,
            unit,
            gramsPerDay: g,
          });
        }
      });
    });
  });

  // Constrói lista final com total ajustado por período e ciclo de carbo
  const result: AggItem[] = [];

  map.forEach((entry) => {
    const isCarbKind = entry.kind === "carb";
    const multiplier = isCarbKind
      ? avgCarbMultiplier(days, carbCycle, carbCycleHighPct, carbCycleLowPct)
      : 1.0;

    result.push({
      name: entry.name,
      kind: entry.kind,
      unit: entry.unit,
      gramsPerDay: entry.gramsPerDay,
      total: entry.gramsPerDay * days * multiplier,
    });
  });

  return result;
}
