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
});
