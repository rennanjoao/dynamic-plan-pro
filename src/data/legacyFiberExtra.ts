/**
 * legacyFiberExtra.ts — fibra (g/100 g) de alimentos do catálogo LEGADO que a `tacoFiberData.ts`
 * não cobre, e AJUSTE dos cozidos para "bater com o cru".
 *
 * Prioridade em resolveFiberPer100(): fiber do próprio alimento → ESTE ARQUIVO → tacoFiberData.ts
 * → ponte para a TACO enriquecida → zero nutricional → "missing" (sem dado, nunca zero silencioso).
 *
 * REGRA DE OURO (decisão do coach): o total de fibra é o MESMO seja o alimento prescrito CRU ou COZIDO.
 *
 *     fibra do cozido (por 100 g)  =  fibra do cru (por 100 g)  ÷  cookFactor
 *
 * Exemplo: 100 g de arroz branco cru = 1,64 g de fibra. Ele rende 270 g de arroz cozido (fator 2,7),
 * logo 100 g de arroz cozido = 1,64 ÷ 2,7 = 0,61 g de fibra. Prescrever "100 g crus" ou "270 g cozidos"
 * dá o mesmo total. Antes, o cozido da TACO (1,56) fazia 270 g cozidos virarem 4,2 g (2,6× demais).
 *
 * Origem de cada valor (`kind`):
 *   "usda"     → USDA FoodData Central (alimento sem item na TACO ou com macros que são da USDA);
 *   "taco"     → item idêntico ou parecido da TACO 4ª ed. (ver `ref` e `note`);
 *   "ajustado" → cozido recalculado a partir do cru (`rawTwin` ÷ fator). O número MEDIDO na fonte
 *                fica em `measured`, para consulta e para voltar atrás se quiser.
 *
 * Se mudar o `cookFactor` de um alimento OU a fibra do cru, refaça o cozido correspondente:
 * o teste `fiberAndQuantity.test.ts` falha enquanto cru × fator ≠ cozido (tolerância 3%).
 *
 * Chave = nome do alimento legado em minúsculas.
 */
export type ExtraFiberKind = "usda" | "taco" | "ajustado";

export interface ExtraFiberEntry {
  /** g de fibra por 100 g do alimento, no estado do próprio cadastro (cru ou cozido). */
  fiber: number;
  kind: ExtraFiberKind;
  /** Fonte (ou, em "ajustado", a conta: fibra do cru ÷ fator). */
  ref: string;
  /** Só em "ajustado": nome legado (minúsculas) do cru de que o cozido deriva. */
  rawTwin?: string;
  /** Só em "ajustado": valor medido do cozido na fonte original (não é o usado). */
  measured?: number;
  note?: string;
}

export const LEGACY_FIBER_EXTRA: Record<string, ExtraFiberEntry> = {
  // ── Sem dado antes: referência USDA ou item parecido da TACO ───────────────────────────────
  "arroz parboilizado (cru)": { fiber: 1.8, kind: "usda", ref: "USDA FDC 169707 (arroz parboilizado, seco)" },
  "macarrão integral (cru)": { fiber: 9.2, kind: "usda", ref: "USDA FDC 169738 (macarrão integral, seco)" },
  "macarrão de arroz (cru)": { fiber: 1.6, kind: "usda", ref: "USDA FDC 169742 (macarrão de arroz, seco)" },
  "quinoa (crua)": { fiber: 7, kind: "usda", ref: "USDA FDC 168874 (quinoa crua)" },
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

  // ── Cozidos ajustados para bater com o cru (fibra do cru ÷ cookFactor) ─────────────────────
  "arroz branco (cozido)": { fiber: 0.61, kind: "ajustado", ref: "1,64 g (cru) ÷ 2,7", rawTwin: "arroz branco (cru)", measured: 1.56, note: "Medido na fonte (TACO): 1,56 g." },
  "arroz parboilizado (cozido)": { fiber: 0.64, kind: "ajustado", ref: "1,80 g (cru) ÷ 2,8", rawTwin: "arroz parboilizado (cru)", measured: 0.9, note: "Medido na fonte (USDA FDC 169708): 0,9 g." },
  "arroz integral (cozido)": { fiber: 1.72, kind: "ajustado", ref: "4,82 g (cru) ÷ 2,8", rawTwin: "arroz integral (cru)", measured: 2.75, note: "Medido na fonte (TACO): 2,75 g." },
  "macarrão de trigo comum (cozido)": { fiber: 1.17, kind: "ajustado", ref: "2,93 g (cru) ÷ 2,5", rawTwin: "macarrão de trigo comum (cru)", measured: 1.8, note: "Medido na fonte (USDA FDC 169737): 1,8 g." },
  "macarrão integral (cozido)": { fiber: 3.68, kind: "ajustado", ref: "9,20 g (cru) ÷ 2,5", rawTwin: "macarrão integral (cru)", measured: 3.9, note: "Medido na fonte (USDA FDC 2708353): 3,9 g." },
  "macarrão de arroz (cozido)": { fiber: 0.59, kind: "ajustado", ref: "1,60 g (cru) ÷ 2,7", rawTwin: "macarrão de arroz (cru)", measured: 1, note: "Medido na fonte (USDA FDC 168914): 1 g." },
  "feijão carioca (cozido)": { fiber: 7.68, kind: "ajustado", ref: "18,42 g (cru) ÷ 2,4", rawTwin: "feijão carioca (cru)", measured: 8.51, note: "Medido na fonte (TACO): 8,51 g." },
  "feijão preto (cozido)": { fiber: 9.1, kind: "ajustado", ref: "21,83 g (cru) ÷ 2,4", rawTwin: "feijão preto (cru)", measured: 8.4, note: "Medido na fonte (TACO): 8,4 g." },
  "lentilha (cozida)": { fiber: 5.65, kind: "ajustado", ref: "16,94 g (cru) ÷ 3", rawTwin: "lentilha (crua)", measured: 7.86, note: "Medido na fonte (TACO): 7,86 g." },
  "quinoa (cozida)": { fiber: 2.33, kind: "ajustado", ref: "7,00 g (cru) ÷ 3", rawTwin: "quinoa (crua)", measured: 2.8, note: "Medido na fonte (USDA FDC 168917): 2,8 g." },
  "grão-de-bico (cozido)": { fiber: 5.62, kind: "ajustado", ref: "12,36 g (cru) ÷ 2,2", rawTwin: "grão-de-bico (cru)", measured: 7.6, note: "Medido na fonte (USDA FDC 173757): 7,6 g." },
  "cuscuz de milho (preparado)": { fiber: 1.76, kind: "ajustado", ref: "5,29 g (cru) ÷ 3", rawTwin: "cuscuz de milho (flocos crus)", measured: 2.05, note: "Medido na fonte (TACO): 2,05 g." },
  "tapioca (goma hidratada/pronta)": { fiber: 0.1, kind: "ajustado", ref: "0,24 g (cru) ÷ 2,5", rawTwin: "tapioca (goma seca/polvilho)" },
};
