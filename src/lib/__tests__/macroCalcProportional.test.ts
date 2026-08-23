import { describe, it, expect } from "vitest";
import {
  suggestProportionalWeights,
  scaleOptionForMacroDelta,
  optionMacros,
} from "../macroCalc";

const arroz = (rawWeight: number) => ({
  name: "Arroz branco (cru)",
  baseName: "Arroz branco (cru)",
  weight: `${rawWeight}g`,
  rawWeight,
  isTaco: true,
});

const feijao = (rawWeight: number) => ({
  name: "Feijão carioca (cru)",
  baseName: "Feijão carioca (cru)",
  weight: `${rawWeight}g`,
  rawWeight,
  isTaco: true,
});

const mandioca = () => ({
  name: "Mandioca / Aipim (crua)",
  baseName: "Mandioca / Aipim (crua)",
  weight: "",
  rawWeight: 0,
  isTaco: true,
});

const brocolis = () => ({
  name: "Brócolis (cozido/vapor)",
  baseName: "Brócolis (cozido/vapor)",
  weight: "",
  rawWeight: 0,
  isTaco: true,
});

describe("suggestProportionalWeights", () => {
  it("distribui a Opção 2 (sem peso) proporcionalmente à Opção 1, batendo o carbo total", () => {
    const refOption = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const targetOption = { kind: "carb", title: "Opção 2", items: [mandioca(), brocolis()] };

    const result = suggestProportionalWeights(refOption, targetOption, "carb");
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.resolved)).toBe(true);

    // Arroz é 60% do peso da Op 1 (120/200) → mandioca (mapeada na mesma posição) deve
    // receber a maior fatia do alvo, batendo aproximadamente o total de carbo da Op 1.
    const refCarbs = optionMacros(refOption).carbs;
    const built = targetOption.items.map((it, i) => ({
      ...it,
      rawWeight: result.items.find((r) => r.index === i)!.grams,
    }));
    const gotCarbs = optionMacros({ ...targetOption, items: built }).carbs;
    expect(Math.abs(gotCarbs - refCarbs)).toBeLessThan(2); // tolerância de arredondamento (5g)

    // A maior gramagem deve ir para o item que herdou a maior proporção (mandioca, pos. 0)
    const mandiocaGrams = result.items[0].grams;
    const brocolisGrams = result.items[1].grams;
    expect(mandiocaGrams).toBeGreaterThan(brocolisGrams);
  });

  it("com 1 item só no alvo, ele herda 100% da proporção", () => {
    const refOption = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const targetOption = { kind: "carb", title: "Opção 3", items: [mandioca()] };

    const result = suggestProportionalWeights(refOption, targetOption, "carb");
    expect(result.ok).toBe(true);
    expect(result.items[0].resolved).toBe(true);
    expect(result.items[0].grams).toBeGreaterThan(0);
  });

  it("falha graciosamente se a Opção 1 não tiver peso definido", () => {
    const refOption = { kind: "carb", title: "Opção 1", items: [{ ...arroz(0), rawWeight: 0 }] };
    const targetOption = { kind: "carb", title: "Opção 2", items: [mandioca()] };
    const result = suggestProportionalWeights(refOption, targetOption, "carb");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("ignora itens não reconhecidos e renormaliza entre os resolvidos", () => {
    const refOption = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const unrecognized = { name: "Alimento sem TACO", baseName: "Alimento sem TACO", weight: "", rawWeight: 0, isTaco: false };
    const targetOption = { kind: "carb", title: "Opção 2", items: [mandioca(), unrecognized] };
    const result = suggestProportionalWeights(refOption, targetOption, "carb");
    expect(result.ok).toBe(true);
    expect(result.items[0].resolved).toBe(true);
    expect(result.items[1].resolved).toBe(false);
  });

  it("um item 'opcional' na Opção 1 não entra na proporção de referência (mesmo peso alto)", () => {
    const refWithOptional = {
      kind: "carb",
      title: "Opção 1",
      items: [arroz(120), feijao(80), { ...mandioca(), rawWeight: 500, weight: "500g", optional: true }],
    };
    const refWithout = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const targetOption1 = { kind: "carb", title: "Opção 2", items: [mandioca(), brocolis()] };
    const targetOption2 = { kind: "carb", title: "Opção 2", items: [mandioca(), brocolis()] };

    const withOptional = suggestProportionalWeights(refWithOptional, targetOption1, "carb");
    const without = suggestProportionalWeights(refWithout, targetOption2, "carb");

    expect(withOptional.ok).toBe(true);
    expect(without.ok).toBe(true);
    // O item opcional de 500g não deveria mudar a proporção 60/40 nem o alvo de carbo
    expect(withOptional.items[0].grams).toBe(without.items[0].grams);
    expect(withOptional.items[1].grams).toBe(without.items[1].grams);
    expect(withOptional.targetMacro).toBeCloseTo(without.targetMacro, 5);
  });

  it("um item 'opcional' no alvo não recebe peso sugerido", () => {
    const refOption = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const targetOption = { kind: "carb", title: "Opção 2", items: [mandioca(), { ...brocolis(), optional: true }] };
    const result = suggestProportionalWeights(refOption, targetOption, "carb");
    expect(result.ok).toBe(true);
    expect(result.items[0].resolved).toBe(true);
    expect(result.items[1].resolved).toBe(false); // opcional — fica de fora
    // A mandioca sozinha herda 100% da proporção (não fica presa aos 60% da Op1)
    const withoutOptionalTarget = { kind: "carb", title: "Opção 2", items: [mandioca()] };
    const soloResult = suggestProportionalWeights(refOption, withoutOptionalTarget, "carb");
    expect(result.items[0].grams).toBe(soloResult.items[0].grams);
  });
});

describe("scaleOptionForMacroDelta", () => {
  it("acrescenta gramagem proporcionalmente para bater +50g de carbo mantendo a proporção", () => {
    const option = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const before = optionMacros(option);

    const res = scaleOptionForMacroDelta(option, "carbs", 50);
    expect(res.ok).toBe(true);

    const newItems = option.items.map((it, i) => ({
      ...it,
      rawWeight: res.items.find((r) => r.index === i)!.grams,
    }));
    const after = optionMacros({ ...option, items: newItems });

    expect(after.carbs - before.carbs).toBeGreaterThan(40);
    expect(after.carbs - before.carbs).toBeLessThan(60);
    // Proporção de peso preservada (arroz continua ~60% do total)
    const totalWeight = newItems[0].rawWeight + newItems[1].rawWeight;
    expect(newItems[0].rawWeight / totalWeight).toBeCloseTo(0.6, 1);
  });

  it("aceita delta negativo (reduzir macro) sem gerar peso negativo", () => {
    const option = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };
    const res = scaleOptionForMacroDelta(option, "carbs", -1000);
    expect(res.ok).toBe(true);
    res.items.forEach((i) => expect(i.grams).toBeGreaterThanOrEqual(0));
  });

  it("falha graciosamente quando não há alimento reconhecido", () => {
    const option = { kind: "carb", title: "Opção 1", items: [{ name: "X", baseName: "X", weight: "", rawWeight: 0, isTaco: false }] };
    const res = scaleOptionForMacroDelta(option, "carbs", 50);
    expect(res.ok).toBe(false);
  });

  it("ignora item 'opcional' no rateio, mesmo com peso grande", () => {
    const withOptional = {
      kind: "carb",
      title: "Opção 1",
      items: [arroz(120), feijao(80), { ...mandioca(), rawWeight: 500, weight: "500g", optional: true }],
    };
    const without = { kind: "carb", title: "Opção 1", items: [arroz(120), feijao(80)] };

    const resWith = scaleOptionForMacroDelta(withOptional, "carbs", 50);
    const resWithout = scaleOptionForMacroDelta(without, "carbs", 50);
    expect(resWith.ok).toBe(true);
    expect(resWithout.ok).toBe(true);

    // Arroz e feijão devem receber exatamente o mesmo acréscimo nos dois casos
    expect(resWith.items[0].grams).toBe(resWithout.items[0].grams);
    expect(resWith.items[1].grams).toBe(resWithout.items[1].grams);
    // O item opcional nunca é tocado
    expect(resWith.items[2].resolved).toBe(false);
    expect(resWith.items[2].grams).toBe(500);
  });
});
