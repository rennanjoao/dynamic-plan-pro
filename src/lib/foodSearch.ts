/**
 * foodSearch.ts — Busca unificada de alimentos.
 * TACO é prioridade; industrializados aparecem em seguida.
 */

import { TACO_FOODS, searchTaco, type TacoFood } from "@/data/tacoFoods";
import { INDUSTRIAL_FOODS, type IndustrialFood } from "@/data/industrialFoods";

export type FoodHit =
  | (TacoFood & { source: "taco"; brand?: undefined })
  | (IndustrialFood & { source: "industrial" });

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function searchFoods(query: string, limit = 14): FoodHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const tacoHits: FoodHit[] = searchTaco(q).map((t) => ({ ...t, source: "taco" as const }));
  const nq = norm(q);
  const industrialHits: FoodHit[] = INDUSTRIAL_FOODS
    .filter((f) => norm(f.name).includes(nq) || norm(f.brand).includes(nq))
    .map((f) => ({ ...f, source: "industrial" as const }));
  return [...tacoHits, ...industrialHits].slice(0, limit);
}

export function findFoodByName(name: string): FoodHit | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  const taco = TACO_FOODS.find((t) => t.name.toLowerCase() === n);
  if (taco) return { ...taco, source: "taco" as const };
  const ind = INDUSTRIAL_FOODS.find((f) => f.name.toLowerCase() === n);
  if (ind) return { ...ind, source: "industrial" as const };
  return undefined;
}