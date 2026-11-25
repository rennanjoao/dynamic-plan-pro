// src/lib/householdMeasures.ts
//
// "Mostrar medidas caseiras ao aluno" (por aluno, aba Dieta): ao lado dos gramas, o aluno vê a
// medida caseira aproximada — "120 g ≈ 5 colheres de sopa". O coach continua prescrevendo em
// gramas; a medida vem SÓ das medidas cadastradas do próprio alimento (portions, com fonte) ou do
// peso da unidade. Sem medida cadastrada, não aparece nada — nunca se inventa peso.

import { findFoodByName, parseFoodQuantity } from "@/lib/macroCalc";

const MEASURE_WORDS = /\b(un|unid|unidades?|fatias?|ovos?|claras?|colher(es)?|copos?|por[cç](ao|ões|oes)|scoops?|xicaras?|xícaras?|conchas?|escumadeiras?|pegador(es)?|punhados?|pratos?|lata|pote|peda[cç]os?|fil[eé]s?|bifes?|postas?|rodelas?|folhas?|ramos?|cachos?|gomos?)\b/i;

/** O coach já escreveu uma medida caseira? Aí não repetimos. */
export function hasHouseholdWord(text: string): boolean {
  return MEASURE_WORDS.test(String(text || ""));
}

function fmtQty(q: number): string {
  const whole = Math.floor(q);
  const half = q - whole >= 0.5;
  if (whole === 0) return "½";
  return half ? `${whole} ½` : String(whole);
}

/** Medida principal do alimento: a 1ª medida cadastrada; senão, a unidade. */
function primaryMeasure(food: { portions?: Array<{ label: string; grams: number }>; unitWeight?: number }): { label: string; per: number } | null {
  const portions: Array<{ label: string; grams: number }> = Array.isArray(food?.portions) ? food.portions : [];
  for (const p of portions) {
    const m = /^\s*(\d+(?:[.,]\d+)?|\d+\/\d+)?\s*(.*)$/.exec(p.label);
    const n = m?.[1] ? (m[1].includes("/") ? Number(m[1].split("/")[0]) / Number(m[1].split("/")[1]) : parseFloat(m[1].replace(",", "."))) : 1;
    const label = (m?.[2] || p.label).trim();
    if (p.grams > 0 && n > 0 && label) return { label, per: p.grams / n };
  }
  if (typeof food?.unitWeight === "number" && food.unitWeight > 0) return { label: "unidade", per: food.unitWeight };
  return null;
}

/**
 * "≈ 2 ½ colheres de sopa" para `grams` do alimento `foodName`, ou null quando não há medida
 * cadastrada ou o número ficaria sem sentido (menos de ½ ou mais de 15 medidas).
 */
export function householdApprox(foodName: string, grams: number): string | null {
  if (!(grams > 0)) return null;
  const food = findFoodByName(foodName);
  if (!food) return null;
  const m = primaryMeasure(food);
  if (!m) return null;
  const q = Math.round((grams / m.per) * 2) / 2;
  if (q < 0.5 || q > 15) return null;
  // O parser devolve o texto padronizado (plural certo: "colheres de sopa").
  const parsed = parseFoodQuantity(food, `${q} ${m.label}`);
  const text = parsed.canonicalText ? parsed.canonicalText.replace(/^\S+/, fmtQty(q)) : `${fmtQty(q)} ${m.label}`;
  return `≈ ${text}`;
}
