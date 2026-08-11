/**
 * tacoFoods.ts — Tabela TACO (UNICAMP) Expandida — valores por 100g
 *
 * CONVENÇÃO:
 * - Alimentos com preparo: entrada CRU tem cookFactor para converter peso cru → cozido
 * - cookFactor = gramas cozidas que equivalem a 100g crus
 * - Alimentos sem preparo: cookFactor = 1
 *
 * FONTE: TACO 4ª edição + USDA + Padrões de Suplementação Fitness
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
  /** peso médio em gramas de 1 unidade deste alimento */
  unitWeight?: number;
}

export const TACO_FOODS: TacoFood[] = [
  // ─── CARBOIDRATOS & LEGUMINOSAS ──────────────────────────────────────────────
  { name: "Arroz branco (cru)",              kcal: 345, p: 7.0,  c: 77.4, g: 0.5, group: "carb", cookFactor: 2.7 },
  { name: "Arroz branco (cozido)",           kcal: 128, p: 2.5,  c: 28.1, g: 0.2, group: "carb", valuesArCooked: true },
  { name: "Arroz parboilizado (cru)",        kcal: 352, p: 7.3,  c: 76.8, g: 0.5, group: "carb", cookFactor: 2.8 },
  { name: "Arroz parboilizado (cozido)",     kcal: 124, p: 2.6,  c: 26.9, g: 0.2, group: "carb", valuesArCooked: true },
  { name: "Arroz integral (cru)",            kcal: 352, p: 7.3,  c: 72.0, g: 1.9, group: "carb", cookFactor: 2.5 },
  { name: "Arroz integral (cozido)",         kcal: 124, p: 2.6,  c: 25.5, g: 1.0, group: "carb", valuesArCooked: true },
  { name: "Macarrão de trigo comum (cru)",   kcal: 371, p: 10.0, c: 78.5, g: 1.3, group: "carb", cookFactor: 2.5 },
  { name: "Macarrão de trigo comum (cozido)",kcal: 148, p: 4.0,  c: 31.4, g: 0.5, group: "carb", valuesArCooked: true },
  { name: "Macarrão integral (cru)",         kcal: 348, p: 13.0, c: 68.0, g: 1.5, group: "carb", cookFactor: 2.5 },
  { name: "Macarrão integral (cozido)",      kcal: 139, p: 5.2,  c: 27.2, g: 0.6, group: "carb", valuesArCooked: true },
  { name: "Macarrão de arroz (cru)",         kcal: 357, p: 6.5,  c: 80.1, g: 1.0, group: "carb", cookFactor: 2.5 },
  { name: "Macarrão de arroz (cozido)",      kcal: 131, p: 2.4,  c: 29.8, g: 0.4, group: "carb", valuesArCooked: true },
  { name: "Batata doce (crua)",              kcal: 77,  p: 0.6,  c: 18.4, g: 0.1, group: "carb", cookFactor: 0.9 },
  { name: "Batata doce (cozida)",            kcal: 77,  p: 0.6,  c: 18.4, g: 0.1, group: "carb", valuesArCooked: true },
  { name: "Batata inglesa (crua)",           kcal: 64,  p: 1.2,  c: 14.7, g: 0.1, group: "carb", cookFactor: 0.85 },
  { name: "Batata inglesa (cozida)",         kcal: 52,  p: 1.2,  c: 11.9, g: 0.1, group: "carb", valuesArCooked: true },
  { name: "Mandioca / Aipim (crua)",         kcal: 151, p: 1.1,  c: 36.2, g: 0.3, group: "carb", cookFactor: 0.85 },
  { name: "Mandioca / Aipim (cozida)",       kcal: 125, p: 0.9,  c: 29.9, g: 0.3, group: "carb", valuesArCooked: true },
  { name: "Mandioquinha / Chuchu (cozido)",  kcal: 24,  p: 0.8,  c: 5.5,  g: 0.1, group: "carb", valuesArCooked: true },
  { name: "Inhame (cru)",                    kcal: 97,  p: 2.1,  c: 23.2, g: 0.2, group: "carb", cookFactor: 0.85 },
  { name: "Inhame (cozido)",                 kcal: 118, p: 1.5,  c: 27.9, g: 0.1, group: "carb", valuesArCooked: true },
  { name: "Pão francês",                     kcal: 300, p: 8.0,  c: 58.6, g: 3.1, group: "carb", unitWeight: 50 },
  { name: "Pão de forma tradicional",        kcal: 253, p: 8.5,  c: 49.9, g: 2.0, group: "carb", unitWeight: 25 },
  { name: "Pão de forma integral",           kcal: 253, p: 9.4,  c: 49.9, g: 2.9, group: "carb", unitWeight: 25 },
  { name: "Rap10 / Tortilha de trigo",       kcal: 288, p: 8.0,  c: 50.0, g: 5.5, group: "carb", unitWeight: 40 },
  { name: "Tapioca (goma hidratada/pronta)", kcal: 130, p: 0.1,  c: 32.1, g: 0.2, group: "carb", unitWeight: 60 },
  { name: "Tapioca (goma seca/polvilho)",    kcal: 358, p: 0.0,  c: 89.4, g: 0.1, group: "carb", cookFactor: 2.5 },
  { name: "Cuscuz de milho (flocos crus)",   kcal: 354, p: 7.1,  c: 77.5, g: 1.5, group: "carb", cookFactor: 3.0 },
  { name: "Cuscuz de milho (preparado)",     kcal: 113, p: 2.6,  c: 25.5, g: 0.4, group: "carb", valuesArCooked: true },
  { name: "Aveia em flocos",                 kcal: 394, p: 13.9, c: 66.6, g: 8.5, group: "carb" },
  { name: "Farelo de aveia",                 kcal: 360, p: 15.0, c: 60.0, g: 7.0, group: "carb" },
  { name: "Quinoa (crua)",                   kcal: 335, p: 12.1, c: 68.3, g: 6.1, group: "carb", cookFactor: 3.0 },
  { name: "Quinoa (cozida)",                 kcal: 120, p: 4.4,  c: 21.3, g: 1.9, group: "carb", valuesArCooked: true },
  { name: "Feijão carioca (cru)",            kcal: 329, p: 20.0, c: 61.2, g: 1.3, group: "carb", cookFactor: 3.0 },
  { name: "Feijão carioca (cozido)",         kcal: 76,  p: 4.8,  c: 13.6, g: 0.5, group: "carb", valuesArCooked: true },
  { name: "Feijão preto (cru)",              kcal: 324, p: 21.3, c: 58.8, g: 1.2, group: "carb", cookFactor: 3.0 },
  { name: "Feijão preto (cozido)",           kcal: 77,  p: 4.5,  c: 14.0, g: 0.5, group: "carb", valuesArCooked: true },
  { name: "Feijão fradinho (cru)",           kcal: 338, p: 23.9, c: 59.8, g: 1.2, group: "carb", cookFactor: 3.0 },
  { name: "Lentilha (crua)",                 kcal: 339, p: 23.2, c: 60.1, g: 0.8, group: "carb", cookFactor: 3.0 },
  { name: "Lentilha (cozida)",               kcal: 116, p: 9.0,  c: 20.1, g: 0.5, group: "carb", valuesArCooked: true },
  { name: "Grão-de-bico (cru)",              kcal: 355, p: 21.2, c: 57.8, g: 5.4, group: "carb", cookFactor: 2.5 },
  { name: "Grão-de-bico (cozido)",           kcal: 164, p: 8.8,  c: 27.4, g: 2.5, group: "carb", valuesArCooked: true },
  { name: "Ervilha (crua)",                  kcal: 341, p: 24.6, c: 60.4, g: 1.2, group: "carb", cookFactor: 3.0 },
  { name: "Soja (crua)",                     kcal: 446, p: 36.5, c: 30.2, g: 19.9,group: "protein", cookFactor: 2.5 },
  { name: "Pipoca (estourada sem óleo)",     kcal: 387, p: 13.0, c: 77.0, g: 4.5, group: "carb" },
  { name: "Açúcar branco / refinado",        kcal: 387, p: 0.0,  c: 99.9, g: 0.0, group: "carb" },
  { name: "Açúcar mascavo",                  kcal: 362, p: 0.0,  c: 93.0, g: 0.0, group: "carb" },
  { name: "Mel de abelha",                   kcal: 320, p: 0.3,  c: 82.0, g: 0.0, group: "carb", unitWeight: 15 }, // colher

  // ─── PROTEÍNAS - AVES & OVOS ─────────────────────────────────────────────────
  { name: "Frango peito s/ pele (cru)",      kcal: 119, p: 21.5, c: 0.0, g: 3.0, group: "protein", cookFactor: 0.65 },
  { name: "Frango peito s/ pele (grelhado)", kcal: 159, p: 32.0,  c: 0.0, g: 2.5,  group: "protein", valuesArCooked: true },
  { name: "Frango peito s/ pele (desfiado)", kcal: 159, p: 32.0,  c: 0.0, g: 2.5,  group: "protein", valuesArCooked: true },
  { name: "Frango coxa+sobrecoxa (cru)",     kcal: 161, p: 19.2, c: 0.0,  g: 9.3,  group: "protein", cookFactor: 0.70 },
  { name: "Frango coxa+sobrecoxa (assado)",  kcal: 213, p: 25.8, c: 0.0,  g: 12.2, group: "protein", valuesArCooked: true },
  // Coxa+sobrecoxa — versões explícitas com e sem pele
  { name: "Frango coxa+sobrecoxa s/ pele (crua)",    kcal: 161, p: 19.2, c: 0.0, g:  9.3, group: "protein", cookFactor: 0.70 },
  { name: "Frango coxa+sobrecoxa s/ pele (cozida)",  kcal: 213, p: 25.8, c: 0.0, g: 12.2, group: "protein", valuesArCooked: true },
  { name: "Frango coxa+sobrecoxa c/ pele (crua)",    kcal: 191, p: 16.0, c: 0.0, g: 14.1, group: "protein", cookFactor: 0.68 },
  { name: "Frango coxa+sobrecoxa c/ pele (assada)",  kcal: 282, p: 23.5, c: 0.0, g: 20.8, group: "protein", valuesArCooked: true },
  { name: "Ovo de galinha inteiro (cru)",    kcal: 143, p: 13.0, c: 1.6,  g: 9.5,  group: "protein", cookFactor: 0.92, unitWeight: 50 },
  { name: "Ovo de galinha inteiro (cozido)", kcal: 146, p: 13.3, c: 0.6,  g: 9.5,  group: "protein", valuesArCooked: true, unitWeight: 50 },
  { name: "Ovo de galinha (frito s/ óleo)",  kcal: 146, p: 13.3, c: 0.6,  g: 9.5,  group: "protein", valuesArCooked: true, unitWeight: 50 },
  { name: "Clara de ovo (crua/líquida)",     kcal: 43,  p: 9.0,  c: 0.4,  g: 0.0,  group: "protein", cookFactor: 0.85, unitWeight: 35 },
  { name: "Clara de ovo (cozida)",           kcal: 50,  p: 10.5, c: 0.5,  g: 0.0,  group: "protein", valuesArCooked: true, unitWeight: 35 },
  { name: "Gema de ovo (crua)",              kcal: 322, p: 16.0, c: 3.6,  g: 28.0, group: "fat",     cookFactor: 0.9,  unitWeight: 15 },

  // ─── PROTEÍNAS - CARNE BOVINA ────────────────────────────────────────────────
  { name: "Patinho (cru)",                   kcal: 133, p: 21.7, c: 0.0,  g: 4.5,  group: "protein", cookFactor: 0.70 },
  { name: "Patinho (moído/cozido)",          kcal: 219, p: 35.9, c: 0.0,  g: 7.3,  group: "protein", valuesArCooked: true },
  { name: "Filé Mignon (cru)",               kcal: 143, p: 21.6, c: 0.0,  g: 5.6,  group: "protein", cookFactor: 0.70 },
  { name: "Filé Mignon (grelhado)",          kcal: 220, p: 32.8, c: 0.0,  g: 8.8,  group: "protein", valuesArCooked: true },
  { name: "Alcatra (crua)",                  kcal: 134, p: 20.2, c: 0.0,  g: 5.7,  group: "protein", cookFactor: 0.70 },
  { name: "Alcatra (grelhada)",              kcal: 236, p: 32.6, c: 0.0,  g: 11.7,  group: "protein", valuesArCooked: true },
  { name: "Coxão mole (cru)",                kcal: 137, p: 22.0, c: 0.0,  g: 5.4,  group: "protein", cookFactor: 0.70 },
  { name: "Coxão mole (cozido)",             kcal: 219, p: 32.4, c: 0.0,  g: 8.9,  group: "protein", valuesArCooked: true },
  { name: "Coxão duro (cru)",                kcal: 131, p: 21.8, c: 0.0,  g: 4.7,  group: "protein", cookFactor: 0.68 },
  { name: "Coxão duro (cozido)",             kcal: 217, p: 31.9, c: 0.0,  g: 8.9,  group: "protein", valuesArCooked: true },
  { name: "Lagarto (cru)",                   kcal: 128, p: 21.5, c: 0.0,  g: 4.5,  group: "protein", cookFactor: 0.68 },
  { name: "Lagarto (cozido)",                kcal: 222, p: 32.9, c: 0.0,  g: 9.1,  group: "protein", valuesArCooked: true },
  { name: "Acém (cru)",                      kcal: 189, p: 18.0, c: 0.0,  g: 12.7, group: "protein", cookFactor: 0.65 },
  { name: "Acém (cozido)",                   kcal: 291, p: 27.7, c: 0.0,  g: 19.5, group: "protein", valuesArCooked: true },
  { name: "Músculo (cru)",                   kcal: 134, p: 20.8, c: 0.0,  g: 5.4,  group: "protein", cookFactor: 0.65 },
  { name: "Músculo (cozido)",                kcal: 206, p: 32.0, c: 0.0,  g: 8.3,  group: "protein", valuesArCooked: true },
  { name: "Contra-filé (cru)",               kcal: 145, p: 21.4, c: 0.0,  g: 6.5,  group: "protein", cookFactor: 0.70 },
  { name: "Contra-filé (grelhado)",          kcal: 236, p: 32.6, c: 0.0,  g: 11.7,  group: "protein", valuesArCooked: true },
  { name: "Picanha s/ gordura (crua)",       kcal: 149, p: 21.3, c: 0.0,  g: 6.5,  group: "protein", cookFactor: 0.70 },
  { name: "Picanha c/ gordura (grelhada)",   kcal: 304, p: 37.7, c: 0.0,  g: 16.4, group: "protein", valuesArCooked: true },
  { name: "Picanha c/ gordura (crua)",       kcal: 244, p: 16.0, c: 0.0, g: 20.0, group: "protein", cookFactor: 0.68 },
  { name: "Picanha s/ gordura (grelhada)",   kcal: 205, p: 30.4, c: 0.0, g:  9.3, group: "protein", valuesArCooked: true },
  { name: "Fígado bovino (cru)",             kcal: 141, p: 19.9, c: 1.1,  g: 5.4,  group: "protein", cookFactor: 0.67 },
  { name: "Fígado bovino (grelhado)",        kcal: 225, p: 29.9, c: 4.2,  g: 9.0,  group: "protein", valuesArCooked: true },
  { name: "Fígado bovino (cozido)",          kcal: 191, p: 29.1, c: 5.1,  g: 5.3,  group: "protein", valuesArCooked: true },
  // Cortes gordos bovinos — com e sem gordura
  { name: "Costela bovina c/ gordura (crua)",  kcal: 292, p: 15.5, c: 0.0, g: 25.6, group: "protein", cookFactor: 0.58 },
  { name: "Costela bovina c/ gordura (cozida)",kcal: 504, p: 26.7, c: 0.0, g: 44.1, group: "protein", valuesArCooked: true },
  { name: "Costela bovina s/ gordura (crua)",  kcal: 136, p: 21.0, c: 0.0, g:  5.8, group: "protein", cookFactor: 0.65 },
  { name: "Costela bovina s/ gordura (cozida)",kcal: 209, p: 32.3, c: 0.0, g:  8.9, group: "protein", valuesArCooked: true },
  { name: "Cupim (cru)",                       kcal: 242, p: 18.2, c: 0.0, g: 18.8, group: "protein", cookFactor: 0.63 },
  { name: "Cupim (assado)",                    kcal: 384, p: 28.9, c: 0.0, g: 29.8, group: "protein", valuesArCooked: true },
  { name: "Maminha (crua)",                    kcal: 160, p: 19.7, c: 0.0, g:  9.0, group: "protein", cookFactor: 0.70 },
  { name: "Maminha (grelhada)",                kcal: 229, p: 28.1, c: 0.0, g: 12.9, group: "protein", valuesArCooked: true },
  { name: "Fraldinha (crua)",                  kcal: 155, p: 20.4, c: 0.0, g:  8.1, group: "protein", cookFactor: 0.70 },
  { name: "Fraldinha (grelhada)",              kcal: 221, p: 29.1, c: 0.0, g: 11.6, group: "protein", valuesArCooked: true },

  // ─── PROTEÍNAS - SUÍNO ───────────────────────────────────────────────────────
  { name: "Lombo suíno (cru)",               kcal: 143, p: 20.1, c: 0.0,  g: 7.0,  group: "protein", cookFactor: 0.70 },
  { name: "Lombo suíno (assado)",            kcal: 204, p: 28.7, c: 0.0,  g: 10.0, group: "protein", valuesArCooked: true },
  { name: "Pernil suíno s/ osso (cru)",      kcal: 150, p: 18.5, c: 0.0,  g: 8.5,  group: "protein", cookFactor: 0.65 },
  { name: "Pernil suíno (assado)",           kcal: 231, p: 28.4, c: 0.0,  g: 13.1, group: "protein", valuesArCooked: true },
  { name: "Bisteca suína (crua)",            kcal: 219, p: 18.3, c: 0.0,  g: 16.1, group: "protein", cookFactor: 0.70 },
  { name: "Bisteca suína (grelhada)",        kcal: 313, p: 26.1, c: 0.0,  g: 23.0, group: "protein", valuesArCooked: true },
  // Bisteca suína — com e sem gordura explicitados
  { name: "Bisteca suína c/ gordura (crua)",     kcal: 219, p: 18.3, c: 0.0, g: 16.1, group: "protein", cookFactor: 0.70 },
  { name: "Bisteca suína c/ gordura (grelhada)", kcal: 313, p: 26.1, c: 0.0, g: 23.0, group: "protein", valuesArCooked: true },
  { name: "Bisteca suína s/ gordura (crua)",     kcal: 145, p: 21.5, c: 0.0, g:  6.6, group: "protein", cookFactor: 0.70 },
  { name: "Bisteca suína s/ gordura (grelhada)", kcal: 207, p: 30.7, c: 0.0, g:  9.4, group: "protein", valuesArCooked: true },

  // ─── PROTEÍNAS - PEIXES & FRUTOS DO MAR ──────────────────────────────────────
  { name: "Tilápia / St. Peters (crua)",     kcal: 96,  p: 20.1, c: 0.0,  g: 1.7,  group: "protein", cookFactor: 0.75 },
  { name: "Tilápia (grelhada/assada)",       kcal: 128, p: 26.8, c: 0.0,  g: 2.3,  group: "protein", valuesArCooked: true },
  { name: "Salmão s/ pele (cru)",            kcal: 170, p: 19.3, c: 0.0,  g: 10.4, group: "protein", cookFactor: 0.80 },
  { name: "Salmão s/ pele (grelhado)",       kcal: 213, p: 24.1, c: 0.0,  g: 13.0, group: "protein", valuesArCooked: true },
  { name: "Atum fresco (cru)",               kcal: 108, p: 23.4, c: 0.0,  g: 0.9,  group: "protein", cookFactor: 0.75 },
  { name: "Atum em lata (em água/drenado)",  kcal: 116, p: 25.5, c: 0.0,  g: 1.0,  group: "protein", valuesArCooked: true },
  { name: "Atum em lata (em óleo/drenado)",  kcal: 166, p: 24.0, c: 0.0,  g: 8.0,  group: "protein", valuesArCooked: true },
  { name: "Sardinha fresca (crua)",          kcal: 124, p: 21.1, c: 0.0,  g: 3.8,  group: "protein", cookFactor: 0.80 },
  { name: "Sardinha em lata (óleo/drenada)", kcal: 208, p: 24.6, c: 0.0,  g: 11.5, group: "protein", valuesArCooked: true },
  { name: "Merluza / Pescada (crua)",        kcal: 81,  p: 16.7, c: 0.0,  g: 1.0,  group: "protein", cookFactor: 0.75 },
  { name: "Merluza (grelhada/assada)",       kcal: 108, p: 22.3, c: 0.0,  g: 1.3,  group: "protein", valuesArCooked: true },
  { name: "Camarão (cru)",                   kcal: 90,  p: 20.0, c: 0.0,  g: 1.0,  group: "protein", cookFactor: 0.75 },

  // ─── SUPLEMENTOS PROTÉICOS ───────────────────────────────────────────────────
  { name: "Whey Protein Concentrado (80%)",  kcal: 400, p: 80.0, c: 8.0,  g: 6.0,  group: "protein", unitWeight: 30 },
  { name: "Whey Protein Isolado (90%+)",     kcal: 367, p: 90.0, c: 2.0,  g: 1.0,  group: "protein", unitWeight: 30 },
  { name: "Albumina em pó",                  kcal: 350, p: 80.0, c: 4.0,  g: 0.0,  group: "protein", unitWeight: 30 },
  { name: "Proteína de Soja isolada",        kcal: 375, p: 88.0, c: 2.0,  g: 1.0,  group: "protein", unitWeight: 30 },

  // ─── GORDURAS & OLEAGINOSAS ──────────────────────────────────────────────────
  { name: "Azeite de oliva extra virgem",    kcal: 884, p: 0.0,  c: 0.0,  g: 100.0,group: "fat", unitWeight: 13 }, // 1 colher sopa
  { name: "Óleo de coco",                    kcal: 892, p: 0.0,  c: 0.0,  g: 99.1, group: "fat", unitWeight: 13 },
  { name: "Manteiga integral (com ou s/ sal)",kcal: 726, p: 0.4,  c: 0.1,  g: 82.4, group: "fat", unitWeight: 10 },
  { name: "Pasta de amendoim integral",      kcal: 588, p: 25.0, c: 20.0, g: 50.0, group: "fat", unitWeight: 15 },
  { name: "Amendoim torrado (s/ pele/sal)",  kcal: 585, p: 23.0, c: 21.0, g: 49.0, group: "fat" },
  { name: "Castanha de caju (torrada)",      kcal: 570, p: 18.5, c: 28.7, g: 43.8, group: "fat" },
  { name: "Castanha do Pará / Brasil",       kcal: 643, p: 14.5, c: 15.1, g: 63.5, group: "fat", unitWeight: 4 }, // 1 castanha
  { name: "Nozes",                           kcal: 618, p: 14.0, c: 14.0, g: 59.0, group: "fat" },
  { name: "Amêndoa (torrada)",               kcal: 626, p: 17.8, c: 8.5,  g: 56.6, group: "fat" },
  { name: "Amêndoa (crua)",                  kcal: 579, p: 19.0, c: 16.4, g: 50.6, group: "fat" },
  { name: "Abacate (polpa)",                 kcal: 96,  p: 1.2,  c: 6.0,  g: 8.4,  group: "fat" },
  { name: "Coco fresco (polpa crua)",        kcal: 354, p: 3.0,  c: 6.3,  g: 34.0, group: "fat" },
  { name: "Coco ralado (seco s/ açúcar)",    kcal: 650, p: 6.0,  c: 20.0, g: 60.0, group: "fat" },
  { name: "Leite de coco (garrafinha)",      kcal: 197, p: 2.1,  c: 4.5,  g: 20.0, group: "fat" },
  { name: "Chia (sementes)",                 kcal: 486, p: 16.5, c: 42.1, g: 30.7, group: "fat" },
  { name: "Linhaça (sementes)",              kcal: 534, p: 18.3, c: 28.9, g: 42.2, group: "fat" },

  // ─── LÁCTEOS & QUEIJOS ───────────────────────────────────────────────────────
  { name: "Leite de vaca integral (líquido)",kcal: 61,  p: 3.1,  c: 4.6,  g: 3.2,  group: "dairy" },
  { name: "Leite de vaca desnatado (líquido)",kcal: 35, p: 3.4,  c: 4.9,  g: 0.2,  group: "dairy" },
  { name: "Leite em pó desnatado",           kcal: 362, p: 36.0, c: 52.0, g: 0.8,  group: "dairy" },
  { name: "Iogurte natural integral",        kcal: 68,  p: 3.7,  c: 4.9,  g: 3.7,  group: "dairy" },
  { name: "Iogurte natural desnatado",       kcal: 41,  p: 4.1,  c: 5.9,  g: 0.1,  group: "dairy" },
  { name: "Iogurte grego tradicional",       kcal: 135, p: 9.0,  c: 3.6,  g: 9.8,  group: "dairy" },
  { name: "Iogurte proteico (tipo YoPRO)",   kcal: 65,  p: 10.0, c: 5.0,  g: 0.5,  group: "dairy" },
  { name: "Queijo Muçarela",                 kcal: 300, p: 21.6, c: 2.4,  g: 23.0, group: "dairy", unitWeight: 30 },
  { name: "Queijo Prato",                    kcal: 358, p: 22.6, c: 1.6,  g: 29.3, group: "dairy", unitWeight: 30 },
  { name: "Queijo Minas Frescal",            kcal: 264, p: 17.4, c: 3.2,  g: 20.2, group: "dairy", unitWeight: 30 },
  { name: "Queijo Minas Padrão",             kcal: 350, p: 22.0, c: 2.0,  g: 28.0, group: "dairy", unitWeight: 30 },
  { name: "Queijo Coalho",                   kcal: 336, p: 22.0, c: 2.0,  g: 26.0, group: "dairy", unitWeight: 30 },
  { name: "Queijo Parmesão (ralado)",        kcal: 431, p: 38.0, c: 4.0,  g: 29.0, group: "dairy" },
  { name: "Queijo Cottage",                  kcal: 88,  p: 11.7, c: 2.5,  g: 4.0,  group: "dairy" },
  { name: "Ricota fresca",                   kcal: 135, p: 11.3, c: 3.2,  g: 8.5,  group: "dairy" },
  { name: "Requeijão cremoso tradicional",   kcal: 250, p: 7.5,  c: 3.0,  g: 23.5, group: "dairy", unitWeight: 30 },
  { name: "Requeijão light",                 kcal: 140, p: 8.0,  c: 4.0,  g: 10.5, group: "dairy", unitWeight: 30 },
  { name: "Cream cheese tradicional",        kcal: 342, p: 6.2,  c: 4.1,  g: 34.0, group: "dairy", unitWeight: 30 },
  { name: "Cream cheese light",              kcal: 200, p: 7.0,  c: 5.0,  g: 16.0, group: "dairy", unitWeight: 30 },
  { name: "Creme de leite (lata/caixa)",     kcal: 249, p: 2.7,  c: 3.7,  g: 25.5, group: "dairy" },

  // ─── FRUTAS ──────────────────────────────────────────────────────────────────
  { name: "Banana prata (crua)",             kcal: 89,  p: 1.3,  c: 23.8, g: 0.1, group: "fruit", unitWeight: 70 },
  { name: "Banana nanica (crua)",            kcal: 92,  p: 1.4,  c: 23.4, g: 0.1, group: "fruit", unitWeight: 80 },
  { name: "Banana da terra (crua)",          kcal: 122, p: 1.5,  c: 31.9, g: 0.2, group: "fruit", unitWeight: 90 },
  { name: "Maçã fuji (com casca)",           kcal: 56,  p: 0.3,  c: 15.2, g: 0.0, group: "fruit", unitWeight: 130 },
  { name: "Maçã gala (com casca)",           kcal: 52,  p: 0.3,  c: 13.7, g: 0.2, group: "fruit", unitWeight: 130 },
  { name: "Mamão papaia",                    kcal: 40,  p: 0.5,  c: 10.4, g: 0.1, group: "fruit" },
  { name: "Mamão formosa",                   kcal: 45,  p: 0.8,  c: 11.6, g: 0.1, group: "fruit" },
  { name: "Morango",                         kcal: 30,  p: 0.9,  c:  6.8, g: 0.3, group: "fruit" },
  { name: "Abacaxi",                         kcal: 48,  p: 0.9,  c: 12.3, g: 0.1, group: "fruit", unitWeight: 75 }, // fatia média
  { name: "Manga palmer / tommy",            kcal: 64,  p: 0.7,  c: 17.0, g: 0.3, group: "fruit" },
  { name: "Uva itália / rubi",               kcal: 68,  p: 0.6,  c: 17.3, g: 0.1, group: "fruit" },
  { name: "Uva thompson / sem semente",      kcal: 75,  p: 0.7,  c: 18.1, g: 0.2, group: "fruit" },
  { name: "Uva-passa (sem semente)",         kcal: 299, p: 3.1,  c: 79.2, g: 0.5, group: "fruit" },
  { name: "Suco de uva integral",            kcal: 58,  p: 0.0,  c: 14.7, g: 0.0, group: "fruit", unitWeight: 200 }, // 200ml = 1 copo
  { name: "Melancia",                        kcal: 30,  p: 0.6,  c:  7.5, g: 0.1, group: "fruit" },
  { name: "Melão",                           kcal: 34,  p: 0.8,  c:  8.1, g: 0.2, group: "fruit" },
  { name: "Laranja pera",                    kcal: 37,  p: 1.0,  c:  8.9, g: 0.1, group: "fruit", unitWeight: 140 },
  { name: "Limão tahiti",                    kcal: 22,  p: 0.9,  c:  7.3, g: 0.1, group: "fruit" },
  { name: "Kiwi",                            kcal: 61,  p: 1.1,  c: 14.6, g: 0.5, group: "fruit", unitWeight: 75 },
  { name: "Pera (com casca)",                kcal: 57,  p: 0.4,  c: 15.2, g: 0.1, group: "fruit", unitWeight: 130 },
  { name: "Goiaba",                          kcal: 54,  p: 2.5,  c: 14.3, g: 0.9, group: "fruit", unitWeight: 100 },
  { name: "Maracujá (polpa)",                kcal: 97,  p: 2.2,  c: 23.3, g: 0.7, group: "fruit" },

  // ─── VEGETAIS & SALADAS ──────────────────────────────────────────────────────
  { name: "Brócolis (cru)",                  kcal: 34,  p: 3.6,  c:  4.3, g: 0.4, group: "veg", cookFactor: 0.60 },
  { name: "Brócolis (cozido/vapor)",         kcal: 25,  p: 2.1,  c:  4.0, g: 0.4, group: "veg", valuesArCooked: true },
  { name: "Couve-flor (crua)",               kcal: 20,  p: 2.5,  c:  2.9, g: 0.3, group: "veg", cookFactor: 0.60 },
  { name: "Couve-flor (cozida)",             kcal: 23,  p: 1.8,  c:  4.1, g: 0.4, group: "veg", valuesArCooked: true },
  { name: "Espinafre (cru)",                 kcal: 22,  p: 2.9,  c:  1.3, g: 0.4, group: "veg", cookFactor: 0.30 },
  { name: "Espinafre (refogado)",            kcal: 16,  p: 2.4,  c:  1.7, g: 0.2, group: "veg", valuesArCooked: true },
  { name: "Cenoura (crua)",                  kcal: 34,  p: 1.3,  c:  7.7, g: 0.2, group: "veg", cookFactor: 0.80 },
  { name: "Cenoura (cozida)",                kcal: 41,  p: 0.9,  c:  9.1, g: 0.2, group: "veg", valuesArCooked: true },
  { name: "Abobrinha italiana (crua)",       kcal: 19,  p: 1.2,  c:  4.3, g: 0.3, group: "veg", cookFactor: 0.85 },
  { name: "Abobrinha italiana (cozida)",     kcal: 15,  p: 1.1,  c:  3.0, g: 0.2, group: "veg", valuesArCooked: true },
  { name: "Abóbora cabotian (crua)",         kcal: 40,  p: 1.4,  c:  9.2, g: 0.1, group: "veg", cookFactor: 0.85 },
  { name: "Abóbora cabotian (cozida)",       kcal: 34,  p: 1.0,  c:  7.6, g: 0.1, group: "veg", valuesArCooked: true },
  { name: "Alface americana",                kcal: 14,  p: 1.4,  c:  2.4, g: 0.2, group: "veg" },
  { name: "Alface crespa",                   kcal: 11,  p: 1.3,  c:  1.7, g: 0.2, group: "veg" },
  { name: "Rúcula",                          kcal: 25,  p: 2.6,  c:  3.6, g: 0.6, group: "veg" },
  { name: "Tomate salada",                   kcal: 15,  p: 1.1,  c:  3.1, g: 0.2, group: "veg" },
  { name: "Tomate cereja",                   kcal: 18,  p: 1.0,  c:  4.0, g: 0.2, group: "veg" },
  { name: "Pepino (cru com casca)",          kcal: 10,  p: 0.9,  c:  2.0, g: 0.1, group: "veg" },
  { name: "Chuchu (cru)",                    kcal: 20,  p: 0.9,  c:  4.5, g: 0.1, group: "veg", cookFactor: 0.80 },
  { name: "Chuchu (cozido)",                 kcal: 17,  p: 0.6,  c:  3.9, g: 0.1, group: "veg", valuesArCooked: true },
  { name: "Beterraba (crua)",                kcal: 43,  p: 1.6,  c:  9.6, g: 0.1, group: "veg", cookFactor: 0.80 },
  { name: "Beterraba (cozida)",              kcal: 32,  p: 1.3,  c:  7.2, g: 0.1, group: "veg", valuesArCooked: true },
  { name: "Berinjela (crua)",                kcal: 24,  p: 1.0,  c:  5.9, g: 0.2, group: "veg", cookFactor: 0.70 },
  { name: "Repolho branco (cru)",            kcal: 25,  p: 1.3,  c:  5.8, g: 0.1, group: "veg" },
  { name: "Cebola (crua)",                   kcal: 40,  p: 1.1,  c:  9.3, g: 0.1, group: "veg" },
  { name: "Pimentão (cru)",                  kcal: 20,  p: 0.9,  c:  4.6, g: 0.2, group: "veg" },
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
