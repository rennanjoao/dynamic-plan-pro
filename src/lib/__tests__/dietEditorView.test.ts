import { describe, expect, it } from "vitest";
import { isBlankOption, isDefaultOptionTitle, mealFoodsPreview, visibleOptionIndexes } from "../dietEditorView";
import { makeEmptyMeal, buildBasePayload } from "../protocolSchema";

describe("Dieta enxuta — regras de exibição", () => {
  it("título padrão não conta como conteúdo", () => {
    expect(isDefaultOptionTitle("Opção 2")).toBe(true);
    expect(isDefaultOptionTitle("opcao 3")).toBe(true);
    expect(isDefaultOptionTitle("")).toBe(true);
    expect(isDefaultOptionTitle("versão off-season")).toBe(false);
  });

  it("opção vazia = sem alimento, quantidade, substituição, observação e título próprio", () => {
    expect(isBlankOption({ kind: "carb", title: "Opção 2", items: [{ name: "", weight: "" }] })).toBe(true);
    expect(isBlankOption({ kind: "carb", title: "Opção 2", items: [{ name: "Arroz", weight: "" }] })).toBe(false);
    expect(isBlankOption({ kind: "carb", title: "Opção 2", items: [{ name: "", weight: "100g" }] })).toBe(false);
    expect(isBlankOption({ kind: "carb", title: "Opção 2", notes: "só no treino", items: [] })).toBe(false);
    expect(isBlankOption({ kind: "carb", title: "Off-season", items: [] })).toBe(false);
    expect(isBlankOption({ kind: "carb", title: "Opção 2", items: [{ name: "", substitution: { name: "Batata" } }] })).toBe(false);
  });

  it("Opção 1 aparece sempre; Opção 2 vazia só quando o coach pede", () => {
    const opts = [
      { kind: "carb", title: "Opção 1", items: [{ name: "" }] },
      { kind: "carb", title: "Opção 2", items: [{ name: "" }] },
      { kind: "carb", title: "Opção 3", items: [{ name: "Batata" }] },
    ];
    expect(visibleOptionIndexes(opts, () => false)).toEqual([0, 2]);
    expect(visibleOptionIndexes(opts, (i) => i === 1)).toEqual([0, 1, 2]);
  });

  it("linha-resumo lista a Opção 1 de cada grupo visível, com a quantidade digitada", () => {
    const meal = {
      hiddenKinds: ["fat"],
      options: [
        { kind: "carb", items: [{ name: "Arroz", weight: "120g" }, { name: "Feijão", weight: "" }] },
        { kind: "carb", items: [{ name: "Batata", weight: "180g" }] },
        { kind: "protein", items: [{ baseName: "Frango grelhado", name: "x", weight: "150g" }] },
        { kind: "fat", items: [{ name: "Azeite", weight: "10ml" }] },
      ],
    };
    expect(mealFoodsPreview(meal)).toEqual(["Arroz 120g", "Feijão", "Frango grelhado 150g"]);
  });

  it("Gerar Base e refeição nova não criam mais a Opção 2 vazia (decisão 3b)", () => {
    const meal = makeEmptyMeal("Café");
    expect(meal.options.map((o) => `${o.kind}:${o.title}`)).toEqual(["carb:Opção 1", "protein:Opção 1", "fat:Opção 1"]);
    const base = buildBasePayload({ split: "ABC", mealsCount: 5, carbCycle: false });
    expect(base.meals).toHaveLength(5);
    for (const m of base.meals) expect(m.options).toHaveLength(3);
  });
});
