/**
 * foodDensity.ts — densidade (g por ml) dos alimentos LÍQUIDOS do catálogo.
 *
 * Só estes aceitam "ml"/"l" na quantidade: 10 ml de azeite = 9,1 g, 15 ml de mel = 21,5 g.
 * Antes o app contava 1 ml = 1 g para qualquer alimento. Alimento fora desta lista (sólido)
 * recebe o aviso "ml só vale para líquidos" e o coach usa g ou uma medida caseira.
 *
 * FONTE: Food Standards Australia New Zealand (FSANZ), Nutrition Panel Calculator —
 * "Specific gravities" (gravidade específica ≈ g/ml):
 * https://www.foodstandards.gov.au/business/labelling/nutrition-panel-calculator/specific-gravities
 *  - Oil, olive, pure 0.91 · Oil, various / blend of vegetable oils 0.92
 *  - Honey 1.43
 *  - Milk, fluid, regular fat 1.03 · Milk, fluid, reduced fat or skim 1.04
 *  - Yoghurt, various 1.04 · Cream, regular 1.01 · Coconut, milk 1.01
 *  - Juice, fruit or vegetable, various 1.05
 *
 * chave = nome EXATO do alimento no catálogo (tacoFoods / enrichedFoods / industrialFoods).
 */
export const FOOD_DENSITY_G_PER_ML: Record<string, number> = {
  "Azeite de oliva extra virgem": 0.91,
  "Azeite, de oliva, extra virgem": 0.91,
  "Óleo, de soja": 0.92,
  "Óleo de coco": 0.92,
  "Mel de abelha": 1.43,
  "Leite de vaca integral (líquido)": 1.03,
  "Leite de vaca desnatado (líquido)": 1.04,
  "Iogurte, natural": 1.04,
  "Iogurte natural integral": 1.04,
  "Iogurte natural desnatado": 1.04,
  "Iogurte grego tradicional": 1.04,
  "Iogurte proteico (tipo YoPRO)": 1.04,
  "Creme de leite (lata/caixa)": 1.01,
  "Leite de coco (garrafinha)": 1.01,
  "Suco de uva integral": 1.05,
  "Suco de laranja pera (integral)": 1.05,
};
