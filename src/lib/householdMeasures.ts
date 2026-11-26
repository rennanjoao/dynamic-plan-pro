// src/lib/householdMeasures.ts
//
// "Mostrar medidas caseiras ao aluno" (por aluno, aba Dieta; desligado por padrão — o aluno vê
// gramas): ao lado dos gramas aparece a medida caseira aproximada, "120 g ≈ 5 colheres de sopa".
// O coach continua prescrevendo em gramas. A medida vem SÓ das medidas cadastradas do próprio
// alimento (portions, com fonte) ou do peso da unidade; se nenhuma der um número fácil e próximo
// dos gramas, não aparece nada — nunca se inventa peso.

import { findFoodByName, parseFoodQuantity } from "@/lib/macroCalc";
import { measureKey } from "@/data/householdMeasures";

const MEASURE_WORDS = /\b(un|unid|unidades?|fatias?|ovos?|claras?|colher(es)?|copos?|por[cç](ao|ões|oes)|scoops?|xicaras?|xícaras?|conchas?|escumadeiras?|pegador(es)?|punhados?|pratos?|lata|pote|peda[cç]os?|fil[eé]s?|bifes?|postas?|rodelas?|folhas?|ramos?|cachos?|gomos?|pontas?)\b/i;

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

/**
 * Preferência da medida mostrada ao aluno, e quantas dela no máximo:
 *  0 peça inteira (unidade, filé, scoop…) · 1 parte (fatia, pedaço…) · 2 colher de sopa (a mais
 *  padronizada) · 3 utensílio de servir (colher de servir, concha, escumadeira, xícara, copo) ·
 *  4 medidas pequenas ou vagas (colher de chá/sobremesa, ponta de faca, punhado).
 */
const TIERS: Array<{ words: string[]; max: number }> = [
  { words: ["unidade", "ovo", "clara", "castanha", "bife", "file", "posta", "scoop", "lata", "pote"], max: 15 },
  { words: ["fatia", "pedaco", "rodela", "gomo", "folha", "cacho"], max: 8 },
  { words: ["colher sopa"], max: 6 },
  { words: ["colher servir", "concha", "escumadeira", "xicara", "copo", "pegador"], max: 6 },
];
function tierOf(label: string): { tier: number; max: number } {
  const k = measureKey(label);
  const i = TIERS.findIndex((t) => t.words.includes(k));
  return i >= 0 ? { tier: i, max: TIERS[i].max } : { tier: TIERS.length, max: 6 };
}

type Candidate = { label: string; per: number; tier: number; max: number };

/** Medidas do alimento (rótulo sem o número + gramas de 1 medida). */
function candidatesOf(food: { portions?: Array<{ label: string; grams: number }>; unitWeight?: number }): Candidate[] {
  const out: Candidate[] = [];
  const portions: Array<{ label: string; grams: number }> = Array.isArray(food?.portions) ? food.portions : [];
  for (const p of portions) {
    const mm = /^\s*(\d+(?:[.,]\d+)?|\d+\/\d+)?\s*(.*)$/.exec(p.label);
    const n = mm?.[1] ? (mm[1].includes("/") ? Number(mm[1].split("/")[0]) / Number(mm[1].split("/")[1]) : parseFloat(mm[1].replace(",", "."))) : 1;
    const label = (mm?.[2] || p.label).trim();
    if (p.grams > 0 && n > 0 && label) out.push({ label, per: p.grams / n, ...tierOf(label) });
  }
  const uw = food?.unitWeight;
  // Peso da unidade sem medida própria (ex.: banana nanica). Se já há uma medida com o mesmo peso
  // (pão de forma: unidade = fatia), vale a medida, que diz mais.
  if (typeof uw === "number" && uw > 0 && !out.some((c) => Math.abs(c.per - uw) < 0.01)) {
    out.push({ label: "unidade", per: uw, ...tierOf("unidade") });
  }
  return out;
}

/**
 * "≈ 2 ½ colheres de sopa" para `grams` do alimento `foodName`, ou null.
 * Escolhe a medida mais natural cujo número (arredondado em ½) fica a até 15% dos gramas:
 * primeiro peças inteiras, depois partes, colher de sopa, utensílios de servir e, por último,
 * medidas pequenas; entre medidas do mesmo tipo, a de menor erro e menor número.
 */
export function householdApprox(foodName: string, grams: number): string | null {
  if (!(grams > 0)) return null;
  const food = findFoodByName(foodName);
  if (!food) return null;
  let best: { c: Candidate; q: number; score: number } | null = null;
  for (const c of candidatesOf(food)) {
    const q = Math.round((grams / c.per) * 2) / 2;
    if (q < 0.5 || q > c.max) continue;
    const err = Math.abs(q * c.per - grams) / grams;
    if (err > 0.15 + 1e-9) continue;
    const score = err + 0.02 * q;
    if (!best || c.tier < best.c.tier || (c.tier === best.c.tier && score < best.score - 1e-9)) best = { c, q, score };
  }
  if (!best) return null;
  // O parser devolve o texto padronizado (plural certo: "colheres de sopa").
  const parsed = parseFoodQuantity(food, `${best.q} ${best.c.label}`);
  const text = parsed.canonicalText ? parsed.canonicalText.replace(/^\S+/, fmtQty(best.q)) : `${fmtQty(best.q)} ${best.c.label}`;
  return `≈ ${text}`;
}
