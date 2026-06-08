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

export function calcItemMacros(item: any): Macros {
  if (!item) return { ...ZERO };
  if (item.isTaco === true && typeof item.rawWeight === "number" && item.rawWeight > 0) {
    const taco = tacoByName(item.baseName || item.name);
    if (!taco) return { ...ZERO };
    const f = item.rawWeight / 100;
    return {
      kcal: +(taco.kcal * f).toFixed(1),
      protein: +(taco.p * f).toFixed(1),
      carbs: +(taco.c * f).toFixed(1),
      fat: +(taco.g * f).toFixed(1),
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
 * Por convenção, somamos UMA opção por kind (carb/protein/fat) — a primeira
 * — para refletir o que o aluno consumiria de fato em um dia.
 */
export function calcMealMacros(meal: any): Macros {
  if (!meal) return { ...ZERO };
  const out: Macros = { ...ZERO };
  const opts: any[] = Array.isArray(meal.options) ? meal.options : [];
  const seenKind: Record<string, boolean> = {};
  opts.forEach((opt) => {
    const kind = opt?.kind || "other";
    if (seenKind[kind]) return; // só a primeira opção de cada kind
    seenKind[kind] = true;
    const items: any[] = Array.isArray(opt?.items) ? opt.items : [];
    items.forEach((it) => {
      const m = calcItemMacros(it);
      out.kcal += m.kcal;
      out.protein += m.protein;
      out.carbs += m.carbs;
      out.fat += m.fat;
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