import { describe, expect, it } from "vitest";
import { calcDayMacros, calcItemMacros, parseWeightString } from "../macroCalc";

describe("parseWeightString", () => {
  it("aceita vírgula e preserva ml sem alterar a quantidade", () => {
    expect(parseWeightString("250,5 ml")).toMatchObject({ value: 250.5, grams: 250.5, unit: "ml", original: "250,5 ml", convertible: true });
  });

  it("converte unidade somente quando existe peso cadastrado", () => {
    expect(parseWeightString("2 fatias", 30)).toMatchObject({ grams: 60, isUnit: true, convertible: true });
    expect(parseWeightString("2 fatias")).toMatchObject({ grams: 0, isUnit: true, convertible: false });
  });

  it("converte kg e litro sem fallback arbitrário", () => {
    expect(parseWeightString("1,5 kg").grams).toBe(1500);
    expect(parseWeightString("1.25 l").grams).toBe(1250);
  });

  it("não trata unidade desconhecida como gramas", () => {
    expect(parseWeightString("2 conchas")).toMatchObject({ grams: 0, unit: "unknown", convertible: false });
    expect(parseWeightString("75")).toMatchObject({ grams: 75, convertible: true });
  });

  it("calcula fibras por 100 g da nova base e soma no dia, com legado em zero", async () => {
    const { ENRICHED_FOODS } = await import("@/data/enrichedFoods");
    expect(ENRICHED_FOODS).toHaveLength(83);
    expect(ENRICHED_FOODS.every((food) => Number.isFinite(food.fiber))).toBe(true);
    const food = ENRICHED_FOODS.find((entry) => entry.name === "Goiaba, vermelha, com casca, crua")!;
    const item = { isTaco: true, baseName: food.name, rawWeight: 100 };
    expect(calcItemMacros(item).fiber).toBeCloseTo(food.fiber, 8);
    expect(calcDayMacros([{ options: [{ kind: "carb", items: [item] }] }]).fiber).toBeCloseTo(food.fiber, 8);
  });
});

describe("precisão dos macros", () => {
  it("preserva macros manuais fracionados sem arredondar cada item", () => {
    const item = { manualMacros: { kcal: 1.234, protein: 0.111, carbs: 0.222, fat: 0.033 } };
    expect(calcItemMacros(item)).toMatchObject(item.manualMacros);
    expect(calcItemMacros(item).fiber).toBe(0);
    const meal = { options: [{ kind: "other", items: [item, item, item] }] };
    const total = calcDayMacros([meal]);
    expect(total.kcal).toBeCloseTo(3.702, 10);
    expect(total.protein).toBeCloseTo(0.333, 10);
  });
});
describe("digitação flexível de peso na prescrição", () => {
  it.each(["100g", "100 g", "100G", "100 G", "100 gramas", "100"])("%s = 100 g", (txt) => {
    expect(parseWeightString(txt)).toMatchObject({ grams: 100, convertible: true });
  });
  it("medidas caseiras usam a porção cadastrada", () => {
    const portions = [{ label: "1 lata drenada", grams: 120 }, { label: "1/2 lata", grams: 60 }];
    expect(parseWeightString("1 lata", undefined, portions).grams).toBe(120);
    expect(parseWeightString("2 latas", undefined, portions).grams).toBe(240);
    expect(parseWeightString("1 scoop", undefined, [{ label: "1 scoop", grams: 30 }]).grams).toBe(30);
    expect(parseWeightString("2 unidades", 50).grams).toBe(100);
  });
});
