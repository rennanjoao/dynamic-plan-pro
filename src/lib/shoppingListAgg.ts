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
 *
 * IMPORTANTE — itens por unidade (ovos, latas, fatias…):
 *   O ProtocolBuilder sempre grava `rawWeight` em gramas ao salvar o protocolo.
 *   Por isso a prioridade é: rawWeight (número) → weight textual.
 *   Quando o weight é "14 ovos" ou "4 latas" SEM rawWeight, tentamos converter
 *   usando unitWeight do item (gravado pelo ProtocolBuilder via TACO) com
 *   fallback de 50 g/unidade — idêntico ao parseWeightString do macroCalc.ts.
 *   Isso garante que ovos, latas, fatias, colheres etc. sempre aparecem na lista.
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface AggItem {
  name: string;        // nome normalizado (capitalizado para exibição)
  kind: string;        // "protein" | "carb" | "fat" | "veg" | "other"
  unit: string;        // "g" | "ml" — unidade base
  gramsPerDay: number; // soma diária (em gramas ou ml)
  total: number;       // gramsPerDay × days (ajustado por ciclo de carbo se kind=carb)
  isUnit: boolean;     // true quando a quantidade original é em unidades (ovos, latas…)
  unitValue: number;   // quantidade em unidades (ex: 14 para "14 ovos"), 0 se peso
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
  if (/\bml\b/.test(w)) return "ml";
  if (/\bl\b/.test(w) && !/\bml\b/.test(w)) return "ml";
  return "g";
}

/**
 * Detecta se a string de peso é uma quantidade por UNIDADE
 * (ovos, latas, fatias, colheres, copos, porções…).
 * Idêntico ao regex do macroCalc.ts → parseWeightString.
 */
function isUnitString(text: string): boolean {
  return /un|unid|fatia|fatias|ovo|ovos|colher|colheres|copo|copos|porc|lata|latas/i.test(text);
}

/**
 * Extrai o valor numérico em gramas (ou ml) de um item do protocolo.
 *
 * Prioridade:
 *   1. item.rawWeight  — número em gramas já calculado pelo ProtocolBuilder
 *                        (sempre presente em itens TACO/industriais salvos)
 *   2. item.weight (string) — suporta:
 *        "150g", "1.5kg", "200ml", "1L", "1,5kg" (vírgula pt-BR)
 *        "14 ovos", "4 latas", "2 fatias", "8 unidades"
 *        → converte via unitWeight do item (fallback 50g) — igual ao macroCalc
 *
 * Retorna 0 se não conseguir extrair.
 */
export function parseGrams(item: any): number {
  if (!item) return 0;

  // 1. rawWeight numérico direto (gravado pelo ProtocolBuilder)
  if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
    return item.rawWeight;
  }

  const raw: string = String(item.weight || "")
    .trim()
    .replace(",", ".") // vírgula pt-BR → ponto
    .toLowerCase();

  if (!raw) return 0;

  // Detecta unidade ANTES de remover letras
  const isKg = /kg|quilo/.test(raw);
  // Litro: termina em "l" não precedido de "m" (evita "ml")
  const isLitro = /(?<!m)l$/.test(raw.trim()) && !isKg;

  // Unidades contáveis (ovos, latas, fatias…)
  if (isUnitString(raw)) {
    const parsedValue = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
    if (parsedValue <= 0) return 0;
    const unitWeight =
      typeof item.unitWeight === "number" && item.unitWeight > 0
        ? item.unitWeight
        : 50; // fallback idêntico ao macroCalc
    return parsedValue * unitWeight;
  }

  // Extrai o número da string
  const parsedValue = parseFloat(raw.replace(/[^\d.]/g, "")) || 0;
  if (parsedValue <= 0) return 0;

  if (isKg) return parsedValue * 1000;
  if (isLitro) return parsedValue * 1000;

  return parsedValue; // g ou ml
}

/**
 * Extrai a quantidade em UNIDADES quando o item é contável.
 * Retorna { isUnit, value } — usado para exibir "14 un" em vez de "700 g".
 */
function parseUnitCount(item: any): { isUnit: boolean; value: number } {
  if (!item) return { isUnit: false, value: 0 };

  // rawWeight foi gravado, mas weight ainda pode indicar que é por unidade
  const raw = String(item.weight || "").trim();
  if (!raw) return { isUnit: false, value: 0 };

  if (isUnitString(raw)) {
    const value = parseFloat(raw.replace(",", ".").replace(/[^\d.]/g, "")) || 0;
    return { isUnit: value > 0, value };
  }
  return { isUnit: false, value: 0 };
}

// ─── Formatação de quantidade ──────────────────────────────────────────────────

/**
 * Formata uma quantidade em gramas (ou ml) como string legível.
 *
 * Quando isUnit=true e unitValue>0, exibe "14 un" em vez de "700 g".
 *
 * Regras para peso/volume:
 *   < 1000  → "150 g"  (arredondado)
 *   = 1000  → "1 kg"
 *   > 1000  → "1.50 kg" (2 decimais)
 *
 * Quando unit="ml", usa "ml" e "l" no lugar de "g" e "kg".
 */
export function formatQty(
  grams: number,
  unit?: string,
  isUnit?: boolean,
  unitValue?: number,
): string {
  // Quantidade por unidade: mostra "14 un"
  if (isUnit && unitValue && unitValue > 0) {
    const rounded = Math.round(unitValue);
    return `${rounded} un`;
  }

  const isVolume = unit === "ml";
  const rounded = Math.round(grams);

  if (rounded < 1000) {
    return `${rounded} ${isVolume ? "ml" : "g"}`;
  }

  const kg = grams / 1000;
  return kg % 1 === 0
    ? `${kg} ${isVolume ? "l" : "kg"}`
    : `${kg.toFixed(2)} ${isVolume ? "l" : "kg"}`;
}

// ─── Ciclo de carbo ────────────────────────────────────────────────────────────

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Sentinel value para selectedOptions: somar TODAS as opções daquele kind/meal. */
export const BUY_BOTH = -1;

function carbMultiplier(
  dayValue: unknown,
  highPct: number,
  lowPct: number,
): number {
  if (dayValue === "high") return 1 + highPct / 100;
  if (dayValue === "off" || dayValue === "low") return 1 - lowPct / 100;
  return 1.0;
}

// Cache simples para evitar recalcular o multiplicador médio para o mesmo
// (days + ciclo + percentuais). O ciclo é serializado em uma chave estável.
const _carbMultCache = new Map<string, number>();

function avgCarbMultiplier(
  days: number,
  carbCycle: Record<string, unknown>,
  highPct: number,
  lowPct: number,
): number {
  if (!carbCycle || Object.keys(carbCycle).length === 0) return 1.0;

  // Chave de cache: dia atual (para que mude ao virar o dia), days, pcts e ciclo.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const cycleKey = DAY_KEYS.map((k) => String(carbCycle[k] ?? "")).join("|");
  const cacheKey = `${todayKey}|${days}|${highPct}|${lowPct}|${cycleKey}`;
  const cached = _carbMultCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let sum = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayKey = DAY_KEYS[d.getDay()];
    sum += carbMultiplier(carbCycle[dayKey], highPct, lowPct);
  }
  const result = sum / days;
  // Mantém o cache pequeno
  if (_carbMultCache.size > 64) _carbMultCache.clear();
  _carbMultCache.set(cacheKey, result);
  return result;
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
 *
 * Suporta assinatura legada usada nos testes:
 *   aggregateShoppingList(meals, selectedOptions?, days?)
 */
export function aggregateShoppingList(
  paramsOrMeals: AggregateParams | any[],
  selectedOptionsLegacy?: Record<string, number>,
  daysLegacy?: number,
): AggItem[] {
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
    {
      name: string;
      kind: string;
      unit: string;
      gramsPerDay: number;
      isUnit: boolean;
      unitValuePerDay: number; // soma das unidades por dia
    }
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
      if (hidden.includes(kind)) return;

      // Determina qual opção usar
      const selKey = `${mi}:${kind}`;
      const selIdx = selectedOptions[selKey];

      // "Comprar as duas" → soma items de TODAS as opções desse kind/meal
      const chosenOpts: any[] =
        kindOpts.length > 1 && selIdx === BUY_BOTH
          ? kindOpts
          : kindOpts.length <= 1
            ? [kindOpts[0]]
            : [kindOpts[selIdx ?? 0] ?? kindOpts[0]];

      const items: any[] = chosenOpts.flatMap((o) =>
        Array.isArray(o?.items) ? o.items : [],
      );

      items.forEach((it) => {
        const g = parseGrams(it);
        if (g <= 0) return;

        const rawName = stripHtml(it?.baseName || it?.name || "");
        if (!rawName) return;

        const normalized = normalizeName(rawName);
        const unit = parseUnit(it);
        const { isUnit, value: unitCount } = parseUnitCount(it);
        const aggKey = `${kind}:${normalized}`;

        const existing = map.get(aggKey);
        if (existing) {
          existing.gramsPerDay += g;
          if (isUnit) existing.unitValuePerDay += unitCount;
        } else {
          map.set(aggKey, {
            name: toDisplayName(rawName),
            kind,
            unit,
            gramsPerDay: g,
            isUnit,
            unitValuePerDay: isUnit ? unitCount : 0,
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
      isUnit: entry.isUnit,
      unitValue: entry.isUnit ? entry.unitValuePerDay * days : 0,
    });
  });

  return result;
}
