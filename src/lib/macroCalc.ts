/**
 * macroCalc.ts — cálculo puro de macros no client-side.
 *
 * Regras:
 *  - isTaco === true && rawWeight > 0 → busca TACO_FOODS por baseName e
 *    aplica (rawWeight / 100) × nutrientes. Sempre pelo peso CRU.
 *  - manualMacros existe → usa direto (não-TACO).
 *  - Caso contrário → contribuição zero.
 */

import { TACO_FOODS, type TacoFood } from "@/data/tacoFoods";
import { INDUSTRIAL_FOODS, industrialByName, type IndustrialFood } from "@/data/industrialFoods";

/** Mapeia o `group` da TACO para o `kind` de card (carb | protein | fat). */
export function tacoGroupToKind(group: TacoFood["group"]): "carb" | "protein" | "fat" {
  if (group === "protein") return "protein";
  if (group === "fat") return "fat";
  return "carb";
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function tacoByName(name: string): TacoFood | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return TACO_FOODS.find((t) => t.name.toLowerCase() === n);
}

/**
 * Lookup unificado: TACO primeiro, depois industrializados.
 * Retorna o registro nutricional (g/100g) para qualquer alimento conhecido.
 */
function foodByName(name: string): TacoFood | IndustrialFood | undefined {
  return tacoByName(name) || industrialByName(name);
}

/**
 * Parser numérico seguro para a string de quantidade do alimento.
 * Extrai o valor numérico e detecta se é unidade (un, unidade, fatia, ovo)
 * ou peso em gramas/ml.
 *
 * Retorna { grams, isUnit, value } — `grams` já convertido quando isUnit=true
 * usando `unitWeight` opcional do alimento (fallback 50g).
 *
 * Exemplos:
 *   "150g"        → { value:150, grams:150,  isUnit:false }
 *   "1,5 kg"      → { value:1.5, grams:1500, isUnit:false }
 *   "8 unidades"  → { value:8,   grams:400,  isUnit:true  } (com unitWeight=50)
 *   "2 fatias"    → { value:2,   grams:100,  isUnit:true  }
 *   ""            → { value:0,   grams:0,    isUnit:false }
 */
export function parseWeightString(
  raw: unknown,
  unitWeight: number = 50,
): { value: number; grams: number; isUnit: boolean } {
  const text = String(raw ?? "").trim();
  if (!text) return { value: 0, grams: 0, isUnit: false };

  const parsedValue =
    parseFloat(text.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

  const isUnit = /un|unid|fatia|fatias|ovo|ovos|colher|colheres|copo|copos|porc/i.test(text);
  const isKg = /\bkg\b/i.test(text) || /\bquilo/i.test(text);
  const isLitro = /\bl\b/i.test(text) && !/\bml\b/i.test(text);

  let grams = parsedValue;
  if (isUnit) grams = parsedValue * (unitWeight > 0 ? unitWeight : 50);
  else if (isKg || isLitro) grams = parsedValue * 1000;

  return { value: parsedValue, grams, isUnit };
}

export function calcItemMacros(item: any): Macros {
  if (!item) return { ...ZERO };
  // Itens marcados como opcional não entram no cálculo
  if (item.optional === true) return { ...ZERO };
  // isTaco === true cobre TACO + industrializados (ambos têm tabela conhecida g/100g).
  // isIndustrial === true também aceito para clareza.
  if (item.isTaco === true || item.isIndustrial === true) {
    const food = foodByName(item.baseName || item.name);
    if (!food) return { ...ZERO };

    // Prioriza rawWeight numérico já gravado; senão, parseia weight string.
    let grams = 0;
    if (typeof item.rawWeight === "number" && item.rawWeight > 0) {
      grams = item.rawWeight;
    } else if (item.weight != null) {
      const unitW = typeof (food as any).unitWeight === "number" ? (food as any).unitWeight : 50;
      grams = parseWeightString(item.weight, unitW).grams;
    }
    if (!grams || !isFinite(grams) || grams <= 0) return { ...ZERO };
    const f = grams / 100;
    return {
      kcal: +(food.kcal * f).toFixed(1),
      protein: +(food.p * f).toFixed(1),
      carbs: +(food.c * f).toFixed(1),
      fat: +(food.g * f).toFixed(1),
    };
  }
  if (item.manualMacros) {
    const m = item.manualMacros;
    const protein = Number(m.protein) || 0;
    const carbs = Number(m.carbs) || 0;
    const fat = Number(m.fat) || 0;
    const kcal = Number(m.kcal) || protein * 4 + carbs * 4 + fat * 9;
    return {
      kcal: +kcal.toFixed(1),
      protein: +protein.toFixed(1),
      carbs: +carbs.toFixed(1),
      fat: +fat.toFixed(1),
    };
  }
  return { ...ZERO };
}

/**
 * Calcula macros de UMA refeição.
 *
 * Soma os macros de TODOS os itens da primeira opção de cada kind.
 * O kind de cada item é determinado pelo group TACO do alimento (não pelo
 * kind declarado na opção), evitando que "Frango peito" colocado
 * erroneamente na seção Carbo distorça os totais.
 *
 * Para o placar do dia, o que importa é o valor nutricional real do item,
 * independentemente de em qual card o coach o posicionou.
 */
export function calcMealMacros(meal: any): Macros {
  if (!meal) return { ...ZERO };
  const out: Macros = { ...ZERO };
  const opts: any[] = Array.isArray(meal.options) ? meal.options : [];

  // Pega a primeira opção de cada kind para não somar alternativas (Op1 + Op2)
  const seenKind: Record<string, boolean> = {};
  opts.forEach((opt) => {
    const kind = opt?.kind || "other";
    if (seenKind[kind]) return;
    seenKind[kind] = true;
    const items: any[] = Array.isArray(opt?.items) ? opt.items : [];
    items.forEach((it) => {
      const m = calcItemMacros(it);
      out.kcal    += m.kcal;
      out.protein += m.protein;
      out.carbs   += m.carbs;
      out.fat     += m.fat;
    });
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
}

export function calcDayMacros(meals: any[]): Macros {
  if (!Array.isArray(meals)) return { ...ZERO };
  const out: Macros = { ...ZERO };
  meals.forEach((m) => {
    const r = calcMealMacros(m);
    out.kcal += r.kcal;
    out.protein += r.protein;
    out.carbs += r.carbs;
    out.fat += r.fat;
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
}

/**
 * Macros de UMA opção (principal ou substituição).
 * Soma todos os items da opção; usado para comparar opções entre si.
 */
export function optionMacros(option: any): Macros {
  if (!option) return { ...ZERO };
  const items: any[] = Array.isArray(option.items) ? option.items : [];
  const out: Macros = { ...ZERO };
  items.forEach((it) => {
    const m = calcItemMacros(it);
    out.kcal    += m.kcal;
    out.protein += m.protein;
    out.carbs   += m.carbs;
    out.fat     += m.fat;
  });
  return {
    kcal: +out.kcal.toFixed(1),
    protein: +out.protein.toFixed(1),
    carbs: +out.carbs.toFixed(1),
    fat: +out.fat.toFixed(1),
  };
}

/** Limites de tolerância (delta percentual). */
export const SUBSTITUTION_THRESHOLDS = {
  warnKcal: 0.10, warnMacro: 0.15,
  errKcal:  0.20, errMacro:  0.30,
} as const;

export type SubstitutionSeverity = "ok" | "warn" | "err";

export interface SubstitutionDelta {
  kcal: number; protein: number; carbs: number; fat: number;
  kcalPct: number; proteinPct: number; carbsPct: number; fatPct: number;
  severity: SubstitutionSeverity;
  worstMetric: "kcal" | "protein" | "carbs" | "fat" | null;
}

/**
 * Compara uma substituição contra a opção principal e classifica
 * a severidade do desbalanceamento. Usado apenas no painel do coach.
 */
export function compareOptions(main: Macros, alt: Macros): SubstitutionDelta {
  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 1) : (a - b) / b);
  const d = {
    kcal:    +(alt.kcal    - main.kcal   ).toFixed(1),
    protein: +(alt.protein - main.protein).toFixed(1),
    carbs:   +(alt.carbs   - main.carbs  ).toFixed(1),
    fat:     +(alt.fat     - main.fat    ).toFixed(1),
    kcalPct:    pct(alt.kcal,    main.kcal),
    proteinPct: pct(alt.protein, main.protein),
    carbsPct:   pct(alt.carbs,   main.carbs),
    fatPct:     pct(alt.fat,     main.fat),
  };
  const k = Math.abs(d.kcalPct);
  const macroAbs = [
    { key: "protein" as const, v: Math.abs(d.proteinPct) },
    { key: "carbs"   as const, v: Math.abs(d.carbsPct)   },
    { key: "fat"     as const, v: Math.abs(d.fatPct)     },
  ];
  const worstMacro = macroAbs.reduce((a, b) => (b.v > a.v ? b : a));

  let severity: SubstitutionSeverity = "ok";
  let worstMetric: SubstitutionDelta["worstMetric"] = null;

  if (k >= SUBSTITUTION_THRESHOLDS.errKcal || worstMacro.v >= SUBSTITUTION_THRESHOLDS.errMacro) {
    severity = "err";
  } else if (k >= SUBSTITUTION_THRESHOLDS.warnKcal || worstMacro.v >= SUBSTITUTION_THRESHOLDS.warnMacro) {
    severity = "warn";
  }
  if (severity !== "ok") {
    worstMetric = k >= worstMacro.v ? "kcal" : worstMacro.key;
  }
  return { ...d, severity, worstMetric };
}

// Re-export para conveniência dos consumidores
export { INDUSTRIAL_FOODS };

/**
 * Sugere substituições TACO para um item — mesmo kind/grupo, macro dominante
 * similar (±15%), com gramagem recalculada para equivalência. Máx. 4 itens.
 */
export function suggestTacoSubstitutes(item: any, kind: "carb" | "protein" | "fat"): Array<{ name: string; grams: number; baseName: string; cookFactor: number }> {
  const group: TacoFood["group"] = kind === "carb" ? "carb" : kind === "protein" ? "protein" : "fat";
  const macroField: keyof TacoFood = kind === "carb" ? "c" : kind === "protein" ? "p" : "g";

  if (!item) return [];
  const target = tacoByName(item.baseName || item.name);
  if (!target || !item.rawWeight) return [];

  const targetMacro = (target[macroField] as number) * (item.rawWeight / 100);
  if (!targetMacro) return [];

  const candidates = TACO_FOODS.filter((t) => {
    if (t.group !== group) return false;
    if (t.name === target.name) return false;
    const v = t[macroField] as number;
    return v > 0;
  });

  return candidates
    .map((t) => {
      const v = t[macroField] as number;
      const grams = (targetMacro / v) * 100;
      const refDiff = Math.abs(v - (target[macroField] as number)) / (target[macroField] as number);
      return { name: t.name, grams: Math.round(grams), baseName: t.name, cookFactor: t.cookFactor ?? 1, refDiff };
    })
    .filter((s) => s.refDiff <= 0.5 && s.grams > 0 && s.grams < 1500)
    .sort((a, b) => a.refDiff - b.refDiff)
    .slice(0, 4)
    .map(({ refDiff: _r, ...rest }) => rest);
}

/**
 * Match fuzzy de nomes para TACO (usado no import).
 * Score 0..1; ≥ 0.7 considera-se match.
 */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(grelhado|grelhada|cozido|cozida|assado|assada|cru|crua|crus|cruas)\b/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyFindTaco(rawName: string): { taco: TacoFood; score: number } | null {
  const q = normalize(rawName);
  if (!q) return null;
  const qTokens = q.split(" ").filter(Boolean);

  let best: { taco: TacoFood; score: number } | null = null;
  TACO_FOODS.forEach((t) => {
    const tn = normalize(t.name);
    let score = 0;
    if (tn === q) score = 1;
    else if (tn.includes(q) || q.includes(tn)) score = 0.9;
    else {
      const tTokens = tn.split(" ").filter(Boolean);
      const hits = qTokens.filter((tok) => tTokens.some((tt) => tt.startsWith(tok) || tok.startsWith(tt))).length;
      score = hits / Math.max(qTokens.length, tTokens.length);
    }
    if (!best || score > best.score) best = { taco: t, score };
  });
  return best && best.score >= 0.7 ? best : null;
}

export function parseRawWeight(text: string): number {
  const m = (text || "").match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)?/i);
  if (!m) return 0;
  let v = Number(m[1].replace(",", "."));
  if (m[2] && /kg|l/i.test(m[2])) v *= 1000;
  return Math.round(v);
}
