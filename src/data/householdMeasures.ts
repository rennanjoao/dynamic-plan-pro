/**
 * householdMeasures.ts — medidas caseiras dos alimentos (peso em gramas de cada medida).
 *
 * REGRAS (decisões do Rennan, 25/11/2026):
 *  - Fonte das medidas: IBGE, Pesquisa de Orçamentos Familiares 2008-2009 — "Tabela de Medidas
 *    Referidas para os Alimentos Consumidos no Brasil" (2011). Cada medida guarda a fonte.
 *  - Alimento CRU só recebe medida de cru (ex.: xícara de arroz cru). Medida de alimento pronto
 *    (colher de servir, concha, escumadeira) vai no item COZIDO.
 *  - Alimentos que existem com dois nomes (base enriquecida ↔ legada, foodTwins.ts) compartilham
 *    as medidas: o que um tem, o outro passa a ter.
 *  - Nada de peso inventado: alimento sem medida na fonte fica só com gramas.
 *
 * chave = nome EXATO do alimento no catálogo.
 */
import type { TacoFood } from "./tacoFoods";
import { ENRICHED_TO_LEGACY } from "./foodTwins";

export interface HouseholdMeasure { label: string; grams: number; source: string }

const IBGE = "IBGE POF 2008-2009, Tabela de Medidas Referidas";
const CADASTRO = "peso já cadastrado no app (unidade = fatia)";

export const HOUSEHOLD_MEASURES: Record<string, HouseholdMeasure[]> = {
  // Pão de forma: o peso "1 unidade" (25 g) já cadastrado é o de uma fatia.
  "Pão de forma tradicional": [{ label: "1 fatia", grams: 25, source: CADASTRO }],
  // Medidas do IBGE entram aqui depois da revisão do Rennan (lista em revisão).
};
void IBGE;

/** Junta medidas sem repetir o mesmo rótulo (a primeira da lista vence). */
function mergePortions(
  a: Array<{ label: string; grams: number }> | undefined,
  b: Array<{ label: string; grams: number }> | undefined,
): Array<{ label: string; grams: number }> | undefined {
  const out: Array<{ label: string; grams: number }> = [];
  const seen = new Set<string>();
  for (const p of [...(a ?? []), ...(b ?? [])]) {
    const k = p.label.trim().toLowerCase();
    if (!seen.has(k) && p.grams > 0) { seen.add(k); out.push({ label: p.label, grams: p.grams }); }
  }
  return out.length ? out : undefined;
}

/**
 * Aplica as medidas caseiras e unifica os pares de nomes. Muda os objetos dos catálogos no
 * carregamento (uma vez), para que qualquer leitura (cálculo, busca, dicas) veja o mesmo dado.
 */
export function applyHouseholdMeasures(enriched: TacoFood[], legacy: TacoFood[]): void {
  const byName = new Map<string, TacoFood>();
  for (const f of [...enriched, ...legacy]) byName.set(f.name, f);
  for (const [name, measures] of Object.entries(HOUSEHOLD_MEASURES)) {
    const f = byName.get(name);
    if (f) f.portions = mergePortions(f.portions, measures);
  }
  for (const [eName, lName] of Object.entries(ENRICHED_TO_LEGACY)) {
    const e = byName.get(eName);
    const l = byName.get(lName);
    if (!e || !l) continue;
    const portions = mergePortions(l.portions, e.portions);
    e.portions = portions;
    l.portions = portions;
    const uw = l.unitWeight ?? e.unitWeight;
    if (uw != null) { l.unitWeight = uw; e.unitWeight = uw; }
  }
}
