/**
 * legacyFiberExtra.ts — fibra (g/100 g) de alimentos do catálogo LEGADO que a `tacoFiberData.ts`
 * não cobre (não existe item idêntico na TACO).
 *
 * Prioridade em resolveFiberPer100(): fiber do próprio alimento → cozido com gêmeo cru
 * (cookedTwins.ts: fibra do cru ÷ fator) → ESTE ARQUIVO → tacoFiberData.ts → ponte para a TACO
 * enriquecida → zero nutricional → "missing" (sem dado, nunca zero silencioso).
 *
 * Origem de cada valor (`kind`):
 *   "usda" → USDA FoodData Central (alimento sem item na TACO, ou com macros que são da USDA);
 *   "taco" → item parecido da TACO 4ª ed. (ver `ref` e `note`).
 *
 * Os valores dos CRUS daqui alimentam os cozidos correspondentes (arroz parboilizado, macarrões,
 * quinoa, cuscuz, tapioca): a fibra do cozido é sempre a do cru ÷ fator.
 *
 * Chave = nome do alimento legado em minúsculas.
 */
export type ExtraFiberKind = "usda" | "taco";

export interface ExtraFiberEntry {
  /** g de fibra por 100 g do alimento, no estado do próprio cadastro. */
  fiber: number;
  kind: ExtraFiberKind;
  /** Fonte do valor. */
  ref: string;
  note?: string;
}

export const LEGACY_FIBER_EXTRA: Record<string, ExtraFiberEntry> = {
  "arroz parboilizado (cru)": { fiber: 1.8, kind: "usda", ref: "USDA FDC 169707 (arroz parboilizado, seco)" },
  "macarrão integral (cru)": { fiber: 9.2, kind: "usda", ref: "USDA FDC 169738 (macarrão integral, seco)" },
  "macarrão de arroz (cru)": { fiber: 1.6, kind: "usda", ref: "USDA FDC 169742 (macarrão de arroz, seco)" },
  "quinoa (crua)": { fiber: 7, kind: "usda", ref: "USDA FDC 168874 (quinoa crua)" },
  "tapioca (goma hidratada/pronta)": { fiber: 0.09, kind: "taco", ref: "TACO: Polvilho, doce (0,24 g) × 130/358 kcal", note: "Hidratação da goma seca: a fibra acompanha o peso (fator 2,75)." },
  "tapioca (goma seca/polvilho)": { fiber: 0.24, kind: "taco", ref: "TACO: Polvilho, doce" },
  "cuscuz de milho (flocos crus)": { fiber: 5.29, kind: "taco", ref: "TACO: Cereais, milho, flocos, com sal", note: "Flocão de milho; a TACO não tem o flocão sem sal com a mesma fibra." },
  "farelo de aveia": { fiber: 15.4, kind: "usda", ref: "USDA FDC 168872 (farelo de aveia cru)", note: "Valor do farelo puro; rótulo de marca pode variar." },
  "ervilha (crua)": { fiber: 25.5, kind: "usda", ref: "USDA SR (ervilha seca partida, 341 kcal)", note: "Os macros do legado são desta mesma amostra da USDA." },
  "soja (crua)": { fiber: 9.3, kind: "usda", ref: "USDA FDC 174270 (soja, grão maduro cru)" },
  "proteína de soja isolada": { fiber: 0, kind: "usda", ref: "USDA FDC 174276 (proteína isolada de soja)" },
  "pasta de amendoim integral": { fiber: 5.7, kind: "usda", ref: "USDA FDC 174294 (pasta de amendoim, 588 kcal)" },
  "amêndoa (crua)": { fiber: 11.64, kind: "taco", ref: "TACO: Amêndoa, torrada, salgada", note: "A TACO não tem amêndoa crua; a torra pouco muda a fibra." },
  "coco ralado (seco s/ açúcar)": { fiber: 16.3, kind: "usda", ref: "USDA FDC 170170 (coco seco sem açúcar)" },
  "maçã gala (com casca)": { fiber: 2.4, kind: "usda", ref: "USDA FDC 171688 (maçã com casca)", note: "Os macros do legado (52 kcal) são os da maçã USDA, não os da TACO." },
  "uva thompson / sem semente": { fiber: 0.92, kind: "taco", ref: "TACO: Uva, Itália, crua", note: "Variedade parecida; a TACO não tem a thompson." },
  "uva-passa (sem semente)": { fiber: 3.7, kind: "usda", ref: "USDA SR (uva-passa sem semente)" },
  "suco de uva integral": { fiber: 0.23, kind: "taco", ref: "TACO: Uva, suco concentrado, envasado" },
  "maracujá (polpa)": { fiber: 1.14, kind: "taco", ref: "TACO: Maracujá, cru" },
  "espinafre (refogado)": { fiber: 2.52, kind: "taco", ref: "TACO: Espinafre, Nova Zelândia, refogado", note: "A TACO refogou com óleo (67 kcal); o legado tem só 16 kcal. A fibra é da mesma ordem." },
  "tomate cereja": { fiber: 1.17, kind: "taco", ref: "TACO: Tomate, com semente, cru", note: "Cereja e tomate com semente têm fibra parecida." },
  "pimentão (cru)": { fiber: 2.56, kind: "taco", ref: "TACO: Pimentão, verde, cru", note: "O legado (20 kcal) é o pimentão verde." },
  "mandioquinha / chuchu (cozido)": { fiber: 1.04, kind: "taco", ref: "TACO: Chuchu, cozido", note: "O nome mistura mandioquinha e chuchu; os macros do legado (24 kcal) são de chuchu." },
  "inhame (cozido)": { fiber: 4.1, kind: "usda", ref: "USDA FDC 170071 (inhame)", note: "Os macros do legado (118 kcal) são os do inhame USDA." },
  "pão de forma tradicional": { fiber: 2.48, kind: "taco", ref: "TACO: Pão, glúten, forma", note: "Pão de forma branco; os macros do legado coincidem com o integral, mas a fibra do integral (6,9) não serve." },
};
