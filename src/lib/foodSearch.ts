/**
 * foodSearch.ts — Busca unificada de alimentos.
 * TACO é prioridade; industrializados aparecem em seguida.
 *
 * Regras da busca (única fonte para o coach e para a calculadora do aluno):
 *  - Ignora acento, maiúsculas e pontuação: "feijao", "maca" e "Banana, prata" funcionam.
 *  - Todas as palavras digitadas precisam aparecer no nome (ordem livre: "peito frango").
 *  - Ordem: nome começa com o que foi digitado → palavras começam com o digitado → contém.
 *  - Itens da base enriquecida ("Banana, prata, crua") são trocados pelo equivalente com
 *    parênteses ("Banana prata (crua)"), que tem peso por unidade e medidas caseiras mais
 *    precisos. Ver data/foodTwins.ts.
 *  - `cookFactor` sempre vem preenchido (1 quando o cadastro não tem fator).
 */

import { TACO_FOODS, type TacoFood } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { INDUSTRIAL_FOODS, type IndustrialFood } from "@/data/industrialFoods";
import { ENRICHED_TO_LEGACY } from "@/data/foodTwins";

export type FoodHit =
  | (TacoFood & { source: "taco"; brand?: undefined })
  | (IndustrialFood & { source: "industrial" });

/** Minúsculas, sem acento e sem pontuação: "Banana, prata, crua" → "banana prata crua". */
export function normFood(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface IndexEntry {
  hit: FoodHit;
  key: string;
  words: string[];
}

let INDEX: IndexEntry[] | null = null;

/** Catálogo pesquisável (montado uma vez): legado e enriquecido primeiro, depois industrializados. */
function getIndex(): IndexEntry[] {
  if (INDEX) return INDEX;
  const taco: IndexEntry[] = [...TACO_FOODS, ...ENRICHED_FOODS].map((f) => {
    const key = normFood(f.name);
    return { hit: { ...f, cookFactor: f.cookFactor ?? 1, source: "taco" as const }, key, words: key.split(" ") };
  });
  const industrial: IndexEntry[] = INDUSTRIAL_FOODS.map((f) => {
    const key = normFood(`${f.name} ${f.brand}`);
    return { hit: { ...f, cookFactor: f.cookFactor ?? 1, source: "industrial" as const }, key, words: key.split(" ") };
  });
  INDEX = [...taco, ...industrial];
  return INDEX;
}

const LEGACY_BY_NAME = new Map<string, TacoFood>(TACO_FOODS.map((f) => [f.name, f]));

/**
 * Remove redundância: quando um item enriquecido tem equivalente com parênteses, o equivalente
 * ocupa o lugar dele. Mantém a ordem da primeira ocorrência e descarta repetidos.
 */
export function collapseEnrichedTwins<T extends { name: string; source: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const hit of hits) {
    let item = hit;
    if (hit.source === "taco") {
      const twin = LEGACY_BY_NAME.get(ENRICHED_TO_LEGACY[hit.name]);
      if (twin) item = { ...twin, cookFactor: twin.cookFactor ?? 1, source: "taco" } as unknown as T;
    }
    const key = `${item.source}|${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function searchFoods(query: string, limit = 14): FoodHit[] {
  const tokens = normFood(query).split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.join("").length < 2) return [];
  const joined = tokens.join(" ");

  const ranked: Array<{ e: IndexEntry; rank: number; idx: number }> = [];
  getIndex().forEach((e, idx) => {
    if (!tokens.every((t) => e.key.includes(t))) return;
    const rank = e.key.startsWith(joined) ? 0 : tokens.every((t) => e.words.some((w) => w.startsWith(t))) ? 1 : 2;
    ranked.push({ e, rank, idx });
  });

  // TACO antes de industrializado; dentro de cada grupo, melhor correspondência primeiro
  // (empate mantém a ordem do catálogo).
  ranked.sort((a, b) => {
    const ia = a.e.hit.source === "industrial" ? 1 : 0;
    const ib = b.e.hit.source === "industrial" ? 1 : 0;
    return ia - ib || a.rank - b.rank || a.idx - b.idx;
  });

  return collapseEnrichedTwins(ranked.map((r) => r.e.hit))
    .slice(0, limit)
    .map((h) => ({ ...h }));
}
