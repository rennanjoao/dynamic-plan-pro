import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeName,
  parseGrams,
  formatQty,
  aggregateShoppingList,
  stripHtml,
  BUY_BOTH,
} from "../shoppingListAgg";

describe("normalizeName", () => {
  it("trim + lowercase", () => {
    expect(normalizeName("  Arroz Integral  ")).toBe("arroz integral");
  });
  it("preserva acentos (não normaliza unicode)", () => {
    expect(normalizeName(" Açaí ")).toBe("açaí");
    expect(normalizeName("AÇAÍ")).toBe("açaí");
  });
  it("remove HTML", () => {
    expect(normalizeName("<b>Frango</b>")).toBe("frango");
  });
  it("property: idempotente", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalizeName(normalizeName(s))).toBe(normalizeName(s));
      })
    );
  });
  it("property: case-insensitive (após lower) coincide", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        expect(normalizeName(s)).toBe(normalizeName(s.toUpperCase()));
      })
    );
  });
});

describe("parseGrams", () => {
  it("rawWeight tem prioridade", () => {
    expect(parseGrams({ rawWeight: 250, weight: "100g" })).toBe(250);
  });
  it("aceita g, kg, ml, l", () => {
    expect(parseGrams({ weight: "150g" })).toBe(150);
    expect(parseGrams({ weight: "1.5kg" })).toBe(1500);
    expect(parseGrams({ weight: "200ml" })).toBe(200);
    expect(parseGrams({ weight: "1L" })).toBe(1000);
  });
  it("aceita vírgula decimal pt-BR", () => {
    expect(parseGrams({ weight: "1,5kg" })).toBe(1500);
  });
  it("retorna 0 quando vazio/inválido", () => {
    expect(parseGrams({ weight: "" })).toBe(0);
    expect(parseGrams({})).toBe(0);
    expect(parseGrams(null)).toBe(0);
  });
});

describe("formatQty", () => {
  it("< 1000g em gramas", () => expect(formatQty(150)).toBe("150 g"));
  it("= 1000g em kg inteiro", () => expect(formatQty(1000)).toBe("1 kg"));
  it("> 1000g com 2 decimais", () => expect(formatQty(1500)).toBe("1.50 kg"));
  it("arredonda gramas", () => expect(formatQty(150.6)).toBe("151 g"));
});

describe("aggregateShoppingList", () => {
  const mkMeal = (opts: any[]) => ({ options: opts });

  it("agrega mesmo nome mesmo kind", () => {
    const meals = [
      mkMeal([{ kind: "carb", items: [{ name: "Arroz", weight: "150g" }] }]),
      mkMeal([{ kind: "carb", items: [{ name: "Arroz", weight: "0.25kg" }] }]),
    ];
    const out = aggregateShoppingList(meals);
    expect(out).toHaveLength(1);
    expect(out[0].gramsPerDay).toBe(400);
  });

  it("merge case-insensitive e com espaços/acentos", () => {
    const meals = [
      mkMeal([{ kind: "carb", items: [{ name: " AÇAÍ ", weight: "100g" }] }]),
      mkMeal([{ kind: "carb", items: [{ name: "açaí", weight: "50g" }] }]),
    ];
    const out = aggregateShoppingList(meals);
    expect(out).toHaveLength(1);
    expect(out[0].gramsPerDay).toBe(150);
  });

  it("não colide nomes parecidos", () => {
    const meals = [
      mkMeal([{ kind: "carb", items: [{ name: "Arroz", weight: "100g" }] }]),
      mkMeal([{ kind: "carb", items: [{ name: "Arroz integral", weight: "200g" }] }]),
    ];
    const out = aggregateShoppingList(meals);
    expect(out).toHaveLength(2);
  });

  it("respeita rawWeight (TACO) sobre weight textual", () => {
    const meals = [
      mkMeal([{ kind: "protein", items: [{ baseName: "Frango", rawWeight: 600, weight: "ignorado" }] }]),
      mkMeal([{ kind: "protein", items: [{ name: "frango", weight: "400g" }] }]),
    ];
    const out = aggregateShoppingList(meals);
    expect(out).toHaveLength(1);
    expect(out[0].gramsPerDay).toBe(1000);
    expect(formatQty(out[0].gramsPerDay)).toBe("1 kg");
  });

  it("ignora itens sem peso", () => {
    const meals = [
      mkMeal([{ kind: "fat", items: [{ name: "Castanhas", weight: "" }] }]),
    ];
    expect(aggregateShoppingList(meals)).toHaveLength(0);
  });

  it("respeita seleção de opção por mealIdx:kind", () => {
    const meals = [
      mkMeal([
        { kind: "carb", items: [{ name: "Arroz", weight: "100g" }] },
        { kind: "carb", items: [{ name: "Batata", weight: "200g" }] },
      ]),
    ];
    const a = aggregateShoppingList(meals, { "0:carb": 0 });
    const b = aggregateShoppingList(meals, { "0:carb": 1 });
    expect(a[0].name).toBe("Arroz");
    expect(b[0].name).toBe("Batata");
  });

  describe("BUY_BOTH (Comprar as duas)", () => {
    it("soma os itens de TODAS as opções quando selecionado", () => {
      const meals = [
        mkMeal([
          { kind: "protein", items: [{ name: "Frango", weight: "200g" }] },
          { kind: "protein", items: [{ name: "Patinho", weight: "150g" }] },
        ]),
      ];
      const out = aggregateShoppingList(meals, { "0:protein": BUY_BOTH });
      const names = out.map((i) => i.name).sort();
      expect(names).toEqual(["Frango", "Patinho"]);
      expect(out.find((i) => i.name === "Frango")!.gramsPerDay).toBe(200);
      expect(out.find((i) => i.name === "Patinho")!.gramsPerDay).toBe(150);
    });

    it("multiplica corretamente pelo período (days)", () => {
      const meals = [
        mkMeal([
          { kind: "protein", items: [{ name: "Frango", weight: "200g" }] },
          { kind: "protein", items: [{ name: "Patinho", weight: "100g" }] },
        ]),
      ];
      const out = aggregateShoppingList({
        meals,
        selectedOptions: { "0:protein": BUY_BOTH },
        days: 7,
      });
      const frango = out.find((i) => i.name === "Frango")!;
      const patinho = out.find((i) => i.name === "Patinho")!;
      expect(frango.total).toBe(200 * 7);
      expect(patinho.total).toBe(100 * 7);
    });

    it("ignora opções com items vazios sem quebrar", () => {
      const meals = [
        mkMeal([
          { kind: "protein", items: [{ name: "Frango", weight: "200g" }] },
          { kind: "protein", items: [] },
          { kind: "protein", items: [{ name: "Patinho", weight: "150g" }] },
        ]),
      ];
      const out = aggregateShoppingList(meals, { "0:protein": BUY_BOTH });
      expect(out).toHaveLength(2);
      expect(out.find((i) => i.name === "Frango")!.gramsPerDay).toBe(200);
      expect(out.find((i) => i.name === "Patinho")!.gramsPerDay).toBe(150);
    });

    it("agrega corretamente quando o mesmo item aparece nas duas opções", () => {
      const meals = [
        mkMeal([
          { kind: "carb", items: [{ name: "Arroz", weight: "100g" }] },
          { kind: "carb", items: [{ name: "Arroz", weight: "50g" }] },
        ]),
      ];
      const out = aggregateShoppingList(meals, { "0:carb": BUY_BOTH });
      expect(out).toHaveLength(1);
      expect(out[0].gramsPerDay).toBe(150);
    });
  });

  it("cache do avgCarbMultiplier: chamadas repetidas retornam o mesmo valor", () => {
    const meals = [
      mkMeal([{ kind: "carb", items: [{ name: "Arroz", weight: "100g" }] }]),
    ];
    const carbCycle = { mon: "high", tue: "off", wed: "normal", thu: "high", fri: "off", sat: "normal", sun: "normal" };
    const a = aggregateShoppingList({ meals, days: 7, carbCycle });
    const b = aggregateShoppingList({ meals, days: 7, carbCycle });
    expect(a[0].total).toBe(b[0].total);
  });

  it("property: total agregado = soma de todos os pesos parseados (mesmo kind)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 10 }),
        (weights) => {
          const meals = weights.map((w) =>
            mkMeal([{ kind: "carb", items: [{ name: "Arroz", weight: `${w}g` }] }])
          );
          const out = aggregateShoppingList(meals);
          expect(out[0].gramsPerDay).toBe(weights.reduce((a, b) => a + b, 0));
        }
      )
    );
  });

  it("formatQty em quantidades > 1000g (kg)", () => {
    expect(formatQty(1234)).toBe("1.23 kg");
    expect(formatQty(10000)).toBe("10 kg");
  });

  it("stripHtml remove tags e &nbsp;", () => {
    expect(stripHtml("<i>Café</i>&nbsp;da&nbsp;manhã")).toBe("Café da manhã");
  });
});