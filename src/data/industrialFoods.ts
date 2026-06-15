/**
 * industrialFoods.ts — Tabela complementar de alimentos industrializados.
 *
 * REGRA: TACO é fonte primária. Esta lista é usada apenas quando o
 * alimento não tem equivalente direto na TACO (ex.: marcas específicas
 * de requeijão, suplementos prontos, "creme de arroz" industrializado).
 *
 * Valores normalizados para 100g a partir das tabelas oficiais dos
 * fabricantes (porção do rótulo convertida proporcionalmente).
 */

import type { TacoFood } from "./tacoFoods";

export interface IndustrialFood extends TacoFood {
  brand: string;
  source: "industrial";
  /** Porção referência do rótulo, em gramas (ex.: 30g) */
  servingG: number;
  /** Gordura saturada por 100g (g) */
  saturatedFat?: number;
  /** Sódio por 100g (mg) */
  sodium?: number;
  lactoseFree?: boolean;
}

/** Marcador para diferenciar de TacoFood em tempo de execução. */
export function isIndustrial(food: TacoFood | IndustrialFood | undefined | null): food is IndustrialFood {
  return !!food && (food as IndustrialFood).source === "industrial";
}

export const INDUSTRIAL_FOODS: IndustrialFood[] = [
  {
    name: "Requeijão Light Tirolez",
    brand: "Tirolez",
    source: "industrial",
    servingG: 30,
    kcal: 186.7, p: 8.7, c: 2.3, g: 16.0,
    saturatedFat: 11.0, sodium: 490,
    group: "dairy",
  },
  {
    name: "Requeijão Light Itambé",
    brand: "Itambé",
    source: "industrial",
    servingG: 30,
    kcal: 153.3, p: 13.0, c: 1.3, g: 10.7,
    saturatedFat: 7.0, sodium: 520,
    group: "dairy",
  },
  {
    name: "Requeijão Tradicional Tirolez",
    brand: "Tirolez",
    source: "industrial",
    servingG: 30,
    kcal: 253.3, p: 5.7, c: 1.7, g: 25.0,
    saturatedFat: 17.0, sodium: 453,
    group: "dairy",
  },
  {
    name: "Requeijão Zero Lactose Tirolez",
    brand: "Tirolez",
    source: "industrial",
    servingG: 30,
    kcal: 273.3, p: 7.0, c: 0.3, g: 27.0,
    saturatedFat: 17.0, sodium: 490,
    lactoseFree: true,
    group: "dairy",
  },
  {
    name: "Requeijão Zero Lactose Light Betânia",
    brand: "Betânia",
    source: "industrial",
    servingG: 30,
    kcal: 193.3, p: 10.7, c: 2.0, g: 16.0,
    lactoseFree: true,
    group: "dairy",
  },
  {
    name: "Creme de Arroz (genérico)",
    brand: "Genérico",
    source: "industrial",
    servingG: 100,
    kcal: 370, p: 7.0, c: 82.0, g: 0.5,
    group: "carb",
  },
];

/**
 * Busca em alimentos industrializados — usada quando TACO não retorna
 * resultado relevante ou quando o usuário pesquisa explicitamente por
 * marca/produto.
 */
export function searchIndustrial(query: string): IndustrialFood[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nq = norm(q);
  return INDUSTRIAL_FOODS.filter((f) => norm(f.name).includes(nq) || norm(f.brand).includes(nq)).slice(0, 8);
}

export function industrialByName(name: string): IndustrialFood | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return INDUSTRIAL_FOODS.find((f) => f.name.toLowerCase() === n);
}