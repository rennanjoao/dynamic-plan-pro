import { describe, it, expect } from "vitest";
import { injectDietBlock } from "../dietTemplates";
import { ProtocolPayloadSchema, DietBlockPayloadSchema, buildBasePayload, makeEmptyMeal } from "../protocolSchema";

function basePayload(overrides: Record<string, unknown> = {}) {
  const setup = { split: "AB", mealsCount: 3, carbCycle: false };
  return ProtocolPayloadSchema.parse({
    ...buildBasePayload(setup as any),
    meals: [
      { ...makeEmptyMeal("Café da manhã"), notes: "Sem lactose", __id: "meal-orig-1" },
      { ...makeEmptyMeal("Almoço"), __id: "meal-orig-2" },
    ],
    ...overrides,
  });
}

const tplWithTwoMeals = DietBlockPayloadSchema.parse({
  scope: "diet",
  meals: [
    { ...makeEmptyMeal("Pré-treino"), notes: "30min antes do treino", __id: "meal-tpl-1" },
    { ...makeEmptyMeal("Pós-treino"), __id: "meal-tpl-2" },
  ],
});

describe("injectDietBlock", () => {
  it("substitui as refeições pelas do template", () => {
    const next = injectDietBlock(basePayload(), tplWithTwoMeals);
    expect(next.meals.map((m: any) => m.name)).toEqual(["Pré-treino", "Pós-treino"]);
  });

  it("preserva as observações (notes) de cada refeição do template", () => {
    const next = injectDietBlock(basePayload(), tplWithTwoMeals);
    expect((next.meals[0] as any).notes).toBe("30min antes do treino");
  });

  it("gera __id novo pra cada refeição injetada (não reaproveita o __id salvo no template)", () => {
    const next = injectDietBlock(basePayload(), tplWithTwoMeals);
    const ids = next.meals.map((m: any) => m.__id);
    expect(ids).not.toContain("meal-tpl-1");
    expect(ids).not.toContain("meal-tpl-2");
    expect(new Set(ids).size).toBe(2);
  });

  it("nunca toca em treino/macros/suplementos/periodização/diretrizes (só meals)", () => {
    const before = basePayload();
    const next = injectDietBlock(before, tplWithTwoMeals);
    expect((next as any).workouts).toEqual((before as any).workouts);
    expect((next as any).periodization).toEqual((before as any).periodization);
    expect((next as any).macros).toEqual((before as any).macros);
    expect((next as any).guidelines).toEqual((before as any).guidelines);
    expect((next as any).setup).toEqual((before as any).setup);
  });

  it("template sem refeições não altera o payload", () => {
    const empty = DietBlockPayloadSchema.parse({ scope: "diet", meals: [] });
    const before = basePayload();
    const next = injectDietBlock(before, empty);
    expect(next).toEqual(before);
  });
});

