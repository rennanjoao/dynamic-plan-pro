/**
 * tacoFoods.ts — Tabela TACO (UNICAMP) — valores verificados por 100g
 *
 * CONVENÇÃO:
 *   - Alimentos com preparo: entrada CRU tem cookFactor para converter peso cru → cozido
 *   - cookFactor = gramas cozidas que equivalem a 100g crus
 *     Ex: arroz branco cru cookFactor = 2.7 → 100g cru vira 270g cozido
 *   - Alimentos sem preparo (azeite, castanhas etc): cookFactor = 1
 *
 * FONTE: TACO 4ª edição — UNICAMP/NEPA 2011
 */

export interface TacoFood {
  name: string;
  kcal: number;
  /** proteína (g/100g) */  p: number;
  /** carboidrato (g/100g) */ c: number;
  /** lipídeo (g/100g) */  g: number;
  group: "carb" | "protein" | "fat" | "veg" | "fruit" | "dairy" | "other";
  cookFactor?: number;
  valuesArCooked?: boolean;
}

export const TACO_FOODS: TacoFood[] = [

  // ─── CARBOIDRATOS ────────────────────────────────────────────────────────────
  { name: "Arroz branco (cru)",              kcal: 358, p: 7.2,  c: 78.8, g: 0.6, group: "carb",    cookFactor: 2.7 },
  { name: "Arroz branco (cozido)",           kcal: 128, p: 2.5,  c: 28.1, g: 0.2, group: "carb",    valuesArCooked: true },
  { name: "Arroz parboilizado (cru)",        kcal: 358, p: 7.7,  c: 78.4, g: 0.7, group: "carb",    cookFactor: 2.8 },
  { name: "Arroz parboilizado (cozido)",     kcal: 127, p: 2.7,  c: 27.9, g: 0.2, group: "carb",    valuesArCooked: true },
  { name: "Arroz integral (cru)",            kcal: 360, p: 7.3,  c: 77.5, g: 1.9, group: "carb",    cookFactor: 2.5 },
  { name: "Arroz integral (cozido)",         kcal: 124, p: 2.6,  c: 25.8, g: 1.0, group: "carb",    valuesArCooked: true },
  { name: "Macarrão de arroz (cru)",         kcal: 357, p: 6.5,  c: 80.1, g: 1.0, group: "carb",    cookFactor: 2.5 },
  { name: "Macarrão de arroz (cozido)",      kcal: 131, p: 2.4,  c: 29.8, g: 0.4, group: "carb",    valuesArCooked: true },
  { name: "Macarrão comum (cru)",            kcal: 371, p: 10.0, c: 78.5, g: 1.3, group: "carb",    cookFactor: 2.5 },
  { name: "Macarrão comum (cozido)",         kcal: 148, p: 4.0,  c: 31.4, g: 0.5, group: "carb",    valuesArCooked: true },
  { name: "Batata doce (crua)",              kcal: 77,  p: 1.0,  c: 18.4, g: 0.1, group: "carb",    cookFactor: 0.9 },
  { name: "Batata doce (cozida)",            kcal: 77,  p: 1.0,  c: 18.3, g: 0.1, group: "carb",    valuesArCooked: true },
  { name: "Batata inglesa (crua)",           kcal: 64,  p: 1.2,  c: 14.7, g: 0.1, group: "carb",    cookFactor: 0.85 },
  { name: "Batata inglesa (cozida)",         kcal: 52,  p: 1.2,  c: 11.9, g: 0.1, group: "carb",    valuesArCooked: true },
  { name: "Mandioca (crua)",                 kcal: 151, p: 1.1,  c: 36.2, g: 0.3, group: "carb",    cookFactor: 0.85 },
  { name: "Mandioca (cozida)",               kcal: 125, p: 0.9,  c: 29.9, g: 0.3, group: "carb",    valuesArCooked: true },
  { name: "Pão francês",                     kcal: 300, p: 8.0,  c: 58.6, g: 3.1, group: "carb" },
  { name: "Pão integral",                    kcal: 253, p: 9.4,  c: 49.9, g: 2.9, group: "carb" },
  { name: "Tapioca (goma hidratada/pronta)", kcal: 130, p: 0.1,  c: 32.1, g: 0.2, group: "carb" },
  { name: "Tapioca (goma seca/polvilho)",    kcal: 358, p: 0.0,  c: 89.4, g: 0.1, group: "carb",    cookFactor: 2.5 },
  { name: "Cuscuz de milho (preparado)",     kcal: 113, p: 2.6,  c: 25.5, g: 0.4, group: "carb" },
  { name: "Fubá/flocos de milho (cru)",      kcal: 354, p: 7.1,  c: 77.5, g: 1.5, group: "carb",    cookFactor: 3.5 },
  { name: "Aveia em flocos",                 kcal: 394, p: 13.9, c: 66.6, g: 8.5, group: "carb" },

  // ─── PROTEÍNAS ───────────────────────────────────────────────────────────────
  { name: "Frango peito s/ pele (cru)",               kcal: 163, p: 32.0, c: 0, g: 2.5,  group: "protein", cookFactor: 0.65 },
  { name: "Frango peito s/ pele (cozido)",             kcal: 159, p: 34.6, c: 0, g: 2.4,  group: "protein", valuesArCooked: true },
  { name: "Frango coxa+sobrecoxa s/ pele (cru)",      kcal: 161, p: 19.2, c: 0, g: 9.3,  group: "protein", cookFactor: 0.70 },
  { name: "Frango coxa+sobrecoxa s/ pele (cozido)",   kcal: 179, p: 22.7, c: 0, g: 10.1, group: "protein", valuesArCooked: true },
  { name: "Patinho moído (cru)",                      kcal: 133, p: 21.7, c: 0, g: 5.0,  group: "protein", cookFactor: 0.70 },
  { name: "Patinho moído (cozido)",                   kcal: 190, p: 31.0, c: 0, g: 7.1,  group: "protein", valuesArCooked: true },
  { name: "Coxão mole (cru)",                         kcal: 137, p: 22.0, c: 0, g: 5.4,  group: "protein", cookFactor: 0.70 },
  { name: "Coxão mole (cozido)",                      kcal: 195, p: 31.4, c: 0, g: 7.7,  group: "protein", valuesArCooked: true },
  { name: "Contra-filé (cru)",                        kcal: 145, p: 21.4, c: 0, g: 6.5,  group: "protein", cookFactor: 0.70 },
  { name: "Contra-filé (grelhado)",                   kcal: 207, p: 30.6, c: 0, g: 9.3,  group: "protein", valuesArCooked: true },
  { name: "Picanha (crua)",                           kcal: 213, p: 26.4, c: 0, g: 11.5, group: "protein", cookFactor: 0.70 },
  { name: "Picanha (grelhada)",                       kcal: 304, p: 37.7, c: 0, g: 16.4, group: "protein", valuesArCooked: true },
  { name: "Ovo inteiro (cru)",                        kcal: 143, p: 13.0, c: 1.6, g: 9.5, group: "protein", cookFactor: 0.92 },
  { name: "Ovo inteiro (cozido)",                     kcal: 146, p: 13.3, c: 1.6, g: 9.7, group: "protein", valuesArCooked: true },
  { name: "Clara de ovo (crua)",                      kcal: 43,  p: 9.0,  c: 0.4, g: 0.0, group: "protein", cookFactor: 0.85 },
  { name: "Tilápia (crua)",                           kcal: 96,  p: 20.1, c: 0, g: 1.7,  group: "protein", cookFactor: 0.75 },
  { name: "Tilápia (cozida)",                         kcal: 128, p: 26.8, c: 0, g: 2.3,  group: "protein", valuesArCooked: true },
  { name: "Salmão (cru)",                             kcal: 170, p: 19.3, c: 0, g: 10.4, group: "protein", cookFactor: 0.80 },
  { name: "Salmão (cozido)",                          kcal: 213, p: 24.1, c: 0, g: 13.0, group: "protein", valuesArCooked: true },
  { name: "Filé de merluza (cru)",                    kcal: 81,  p: 16.7, c: 0, g: 1.0,  group: "protein", cookFactor: 0.75 },
  { name: "Filé de merluza (cozido)",                 kcal: 108, p: 22.3, c: 0, g: 1.3,  group: "protein", valuesArCooked: true },
  { name: "Sardinha (crua)",                          kcal: 124, p: 21.5, c: 0, g: 4.2,  group: "protein", cookFactor: 0.80 },
  { name: "Atum em água (drenado)",                   kcal: 116, p: 25.5, c: 0, g: 1.0,  group: "protein" },
  { name: "Whey protein isolado",                     kcal: 367, p: 80.0, c: 6.7, g: 3.3, group: "protein" },

  // ─── CARNES BOVINA (PANELA / ENSOPADO) ──────────────────────────────────────
  { name: "Acém bovino (cru)",                        kcal: 189, p: 18.0, c: 0, g: 12.7, group: "protein", cookFactor: 0.65 },
  { name: "Acém bovino (cozido)",                     kcal: 291, p: 27.7, c: 0, g: 19.5, group: "protein", valuesArCooked: true },
  { name: "Músculo bovino (cru)",                     kcal: 134, p: 20.8, c: 0, g: 5.4,  group: "protein", cookFactor: 0.65 },
  { name: "Músculo bovino (cozido)",                  kcal: 206, p: 32.0, c: 0, g: 8.3,  group: "protein", valuesArCooked: true },
  { name: "Costela bovina (crua)",                    kcal: 302, p: 17.8, c: 0, g: 25.6, group: "protein", cookFactor: 0.60 },
  { name: "Costela bovina (cozida)",                  kcal: 503, p: 29.6, c: 0, g: 42.6, group: "protein", valuesArCooked: true },
  { name: "Paleta bovina (crua)",                     kcal: 173, p: 19.5, c: 0, g: 10.3, group: "protein", cookFactor: 0.65 },
  { name: "Paleta bovina (cozida)",                   kcal: 266, p: 30.0, c: 0, g: 15.8, group: "protein", valuesArCooked: true },
  { name: "Lagarto bovino (cru)",                     kcal: 128, p: 21.5, c: 0, g: 4.5,  group: "protein", cookFactor: 0.68 },
  { name: "Lagarto bovino (cozido)",                  kcal: 188, p: 31.6, c: 0, g: 6.6,  group: "protein", valuesArCooked: true },
  { name: "Coxão duro (cru)",                         kcal: 131, p: 21.8, c: 0, g: 4.7,  group: "protein", cookFactor: 0.68 },
  { name: "Coxão duro (cozido)",                      kcal: 193, p: 32.1, c: 0, g: 6.9,  group: "protein", valuesArCooked: true },
  { name: "Fraldinha (crua)",                         kcal: 154, p: 20.5, c: 0, g: 7.9,  group: "protein", cookFactor: 0.70 },
  { name: "Fraldinha (grelhada)",                     kcal: 220, p: 29.3, c: 0, g: 11.3, group: "protein", valuesArCooked: true },
  { name: "Alcatra (crua)",                           kcal: 134, p: 20.2, c: 0, g: 5.7,  group: "protein", cookFactor: 0.70 },
  { name: "Alcatra (grelhada)",                       kcal: 191, p: 28.9, c: 0, g: 8.1,  group: "protein", valuesArCooked: true },
  { name: "Maminha (crua)",                           kcal: 145, p: 20.8, c: 0, g: 6.5,  group: "protein", cookFactor: 0.70 },
  { name: "Maminha (grelhada)",                       kcal: 207, p: 29.7, c: 0, g: 9.3,  group: "protein", valuesArCooked: true },

  // ─── CARNES SUÍNAS ───────────────────────────────────────────────────────────
  { name: "Pernil suíno (cru)",                       kcal: 150, p: 18.5, c: 0, g: 8.5,  group: "protein", cookFactor: 0.65 },
  { name: "Pernil suíno (assado)",                    kcal: 231, p: 28.4, c: 0, g: 13.1, group: "protein", valuesArCooked: true },
  { name: "Lombo suíno (cru)",                        kcal: 143, p: 20.1, c: 0, g: 7.0,  group: "protein", cookFactor: 0.70 },
  { name: "Lombo suíno (assado)",                     kcal: 204, p: 28.7, c: 0, g: 10.0, group: "protein", valuesArCooked: true },
  { name: "Costela suína (crua)",                     kcal: 267, p: 15.6, c: 0, g: 22.8, group: "protein", cookFactor: 0.60 },
  { name: "Costela suína (cozida)",                   kcal: 445, p: 26.0, c: 0, g: 38.0, group: "protein", valuesArCooked: true },
  { name: "Paleta suína (crua)",                      kcal: 186, p: 17.0, c: 0, g: 13.0, group: "protein", cookFactor: 0.65 },
  { name: "Paleta suína (cozida)",                    kcal: 286, p: 26.2, c: 0, g: 20.0, group: "protein", valuesArCooked: true },
  { name: "Bisteca suína (crua)",                     kcal: 219, p: 18.3, c: 0, g: 16.1, group: "protein", cookFactor: 0.70 },
  { name: "Bisteca suína (grelhada)",                 kcal: 313, p: 26.1, c: 0, g: 23.0, group: "protein", valuesArCooked: true },
  { name: "File de porco (cru)",                      kcal: 158, p: 19.5, c: 0, g: 9.0,  group: "protein", cookFactor: 0.70 },
  { name: "File de porco (grelhado)",                 kcal: 226, p: 27.9, c: 0, g: 12.9, group: "protein", valuesArCooked: true },
  { name: "Panceta suína (crua)",                     kcal: 389, p: 12.0, c: 0, g: 38.6, group: "protein", cookFactor: 0.70 },
  { name: "Linguiça suína (crua)",                    kcal: 254, p: 15.6, c: 3.0, g: 20.8, group: "protein", cookFactor: 0.80 },
  { name: "Linguiça suína (grelhada)",                kcal: 318, p: 19.5, c: 3.7, g: 26.0, group: "protein", valuesArCooked: true },

  // ─── GORDURAS ────────────────────────────────────────────────────────────────
  { name: "Azeite extra virgem",          kcal: 884, p: 0.0,  c: 0.0,  g: 100.0, group: "fat" },
  { name: "Óleo de coco",                 kcal: 892, p: 0.0,  c: 0.0,  g: 99.1,  group: "fat" },
  { name: "Manteiga integral",            kcal: 726, p: 0.4,  c: 0.1,  g: 82.4,  group: "fat" },
  { name: "Abacate",                      kcal: 96,  p: 1.2,  c: 6.0,  g: 8.4,   group: "fat" },
  { name: "Coco fresco (polpa)",          kcal: 354, p: 3.0,  c: 6.3,  g: 34.0,  group: "fat" },
  { name: "Leite de coco (sem adição)",   kcal: 197, p: 2.1,  c: 4.5,  g: 20.0,  group: "fat" },
  { name: "Castanha do Pará",             kcal: 643, p: 14.5, c: 15.1, g: 63.5,  group: "fat" },
  { name: "Amêndoa (torrada s/ sal)",     kcal: 626, p: 17.8, c: 8.5,  g: 56.6,  group: "fat" },
  { name: "Amêndoa (crua)",               kcal: 579, p: 19.0, c: 16.4, g: 50.6,  group: "fat" },
  { name: "Castanha de caju (torrada)",   kcal: 570, p: 18.5, c: 28.7, g: 43.8,  group: "fat" },
  { name: "Pasta de amendoim integral",   kcal: 598, p: 25.0, c: 20.1, g: 50.4,  group: "fat" },
  { name: "Amendoim torrado s/ sal",      kcal: 544, p: 22.5, c: 20.3, g: 43.9,  group: "fat" },

  // ─── FRUTAS ──────────────────────────────────────────────────────────────────
  { name: "Banana prata",  kcal: 89, p: 1.3, c: 23.8, g: 0.1, group: "fruit" },
  { name: "Banana nanica", kcal: 92, p: 1.4, c: 23.4, g: 0.1, group: "fruit" },
  { name: "Maçã fuji",     kcal: 56, p: 0.3, c: 15.2, g: 0.0, group: "fruit" },
  { name: "Mamão papaia",  kcal: 40, p: 0.5, c: 10.4, g: 0.1, group: "fruit" },
  { name: "Morango",       kcal: 30, p: 0.9, c:  6.8, g: 0.3, group: "fruit" },
  { name: "Abacaxi",       kcal: 48, p: 0.9, c: 12.3, g: 0.1, group: "fruit" },
  { name: "Manga palmer",  kcal: 64, p: 0.7, c: 17.0, g: 0.3, group: "fruit" },
  { name: "Uva itália",    kcal: 68, p: 0.6, c: 17.3, g: 0.1, group: "fruit" },

  // ─── VEGETAIS ────────────────────────────────────────────────────────────────
  { name: "Brócolis (cru)",     kcal: 34, p: 3.6, c: 4.3, g: 0.4, group: "veg", cookFactor: 0.60 },
  { name: "Brócolis (cozido)",  kcal: 25, p: 2.1, c: 4.0, g: 0.4, group: "veg", valuesArCooked: true },
  { name: "Espinafre (cru)",    kcal: 22, p: 2.9, c: 1.3, g: 0.4, group: "veg", cookFactor: 0.30 },
  { name: "Espinafre (cozido)", kcal: 16, p: 2.4, c: 1.7, g: 0.2, group: "veg", valuesArCooked: true },
  { name: "Cenoura (crua)",     kcal: 34, p: 1.3, c: 7.7, g: 0.2, group: "veg" },
  { name: "Abobrinha",          kcal: 19, p: 1.2, c: 4.3, g: 0.3, group: "veg" },
  { name: "Alface americana",   kcal: 14, p: 1.4, c: 2.4, g: 0.2, group: "veg" },
  { name: "Tomate",             kcal: 15, p: 1.1, c: 3.1, g: 0.2, group: "veg" },
  { name: "Pepino",             kcal: 10, p: 0.9, c: 2.0, g: 0.1, group: "veg" },
  { name: "Chuchu (cru)",       kcal: 20, p: 0.9, c: 4.5, g: 0.1, group: "veg" },
  { name: "Couve-flor (crua)",  kcal: 20, p: 2.5, c: 2.9, g: 0.3, group: "veg" },

  // ─── LÁCTEOS ─────────────────────────────────────────────────────────────────
  { name: "Leite desnatado",           kcal: 35,  p: 3.4,  c: 4.9, g: 0.2,  group: "dairy" },
  { name: "Iogurte natural desnatado", kcal: 41,  p: 4.1,  c: 5.9, g: 0.1,  group: "dairy" },
  { name: "Iogurte grego integral",    kcal: 135, p: 9.0,  c: 3.6, g: 9.8,  group: "dairy" },
  { name: "Queijo cottage",            kcal: 88,  p: 11.7, c: 2.5, g: 4.0,  group: "dairy" },
  { name: "Queijo minas frescal",      kcal: 264, p: 17.4, c: 3.2, g: 20.2, group: "dairy" },
  { name: "Ricota fresca",             kcal: 135, p: 11.3, c: 3.2, g: 8.5,  group: "dairy" },
  { name: "Requeijão cremoso",         kcal: 250, p: 7.5,  c: 3.0, g: 23.5, group: "dairy" },
  { name: "Requeijão light",           kcal: 140, p: 8.0,  c: 4.0, g: 10.5, group: "dairy" },
  { name: "Cream cheese",              kcal: 342, p: 6.2,  c: 4.1, g: 34.0, group: "dairy" },
  { name: "Queijo prato",              kcal: 358, p: 22.6, c: 1.6, g: 29.3, group: "dairy" },
  { name: "Queijo muçarela",           kcal: 300, p: 21.6, c: 2.4, g: 23.0, group: "dairy" },
  { name: "Leite integral",            kcal: 61,  p: 2.9,  c: 4.6, g: 3.2,  group: "dairy" },
  { name: "Iogurte natural integral",  kcal: 68,  p: 3.7,  c: 4.9, g: 3.7,  group: "dairy" },
  { name: "Creme de leite",            kcal: 249, p: 2.7,  c: 3.7, g: 25.5, group: "dairy" },
];

// ─── FUNÇÕES ──────────────────────────────────────────────────────────────────

export const TACO_MODES = ["kcal", "p", "c", "g"] as const;
export type TacoMode = (typeof TACO_MODES)[number];

export function searchTaco(query: string): TacoFood[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = TACO_FOODS.filter((f) => f.name.toLowerCase().startsWith(q));
  const contains = TACO_FOODS.filter(
    (f) => !f.name.toLowerCase().startsWith(q) && f.name.toLowerCase().includes(q)
  );
  return [...starts, ...contains].slice(0, 10);
}

export function rawToCooked(food: TacoFood, rawGrams: number): number {
  if (!food.cookFactor) return rawGrams;
  return Math.round(rawGrams * food.cookFactor);
}

export function cookedToRaw(food: TacoFood, cookedGrams: number): number {
  if (!food.cookFactor) return cookedGrams;
  return Math.round(cookedGrams / food.cookFactor);
}

export function calcMacros(food: TacoFood, grams: number) {
  const ratio = grams / 100;
  return {
    kcal: parseFloat((food.kcal * ratio).toFixed(1)),
    p:    parseFloat((food.p    * ratio).toFixed(1)),
    c:    parseFloat((food.c    * ratio).toFixed(1)),
    g:    parseFloat((food.g    * ratio).toFixed(1)),
  };
}

export function findCookedPair(food: TacoFood): TacoFood | undefined {
  const baseName = food.name.replace(/\s*\((cru|crua|seca|cozido|cozida|grelhado|grelhada)\)/i, "").trim();
  return TACO_FOODS.find(
    (f) =>
      f !== food &&
      f.name.includes(baseName) &&
      /(cozido|cozida|grelhado|grelhada|pronto|pronta)/.test(f.name.toLowerCase())
  );
}

export function findRawPair(food: TacoFood): TacoFood | undefined {
  const baseName = food.name.replace(/\s*\((cru|crua|seca|cozido|cozida|grelhado|grelhada)\)/i, "").trim();
  return TACO_FOODS.find(
    (f) =>
      f !== food &&
      f.name.includes(baseName) &&
      /(cru|crua|seca)/.test(f.name.toLowerCase())
  );
}

export function equivalentGrams(
  from: TacoFood,
  fromGrams: number,
  to: TacoFood,
  mode: TacoMode
): number | null {
  const fromValue = (from[mode] as number) * (fromGrams / 100);
  const toPer100 = to[mode] as number;
  if (!toPer100 || toPer100 === 0) return null;
  return (fromValue / toPer100) * 100;
}
