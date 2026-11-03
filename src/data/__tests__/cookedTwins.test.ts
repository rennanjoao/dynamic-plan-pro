/**
 * cookedTwins.test.ts — a regra de produto "cru e cozido só servem para o aluno pesar":
 * kcal, proteína, carboidrato, gordura E fibra são iguais seja o alimento prescrito cru ou cozido.
 */
import { describe, it, expect } from "vitest";
import { TACO_FOODS } from "@/data/tacoFoods";
import { COOKED_TWINS, applyCookedTwins, twinFactor } from "@/data/cookedTwins";
import { isCookedEntry } from "@/lib/cooking";
import { calcItemMacros } from "@/lib/macroCalc";

const byName = (n: string) => TACO_FOODS.find((f) => f.name === n)!;
const byKey = (k: string) => TACO_FOODS.find((f) => f.name.toLowerCase() === k)!;

// Cozidos que NÃO têm gêmeo cru de propósito (gordura no preparo, enlatado, sem cru no catálogo).
const NO_TWIN = new Set([
  "Mandioquinha / Chuchu (cozido)",
  "Ovo de galinha (frito s/ óleo)",
  "Espinafre (refogado)",
  "Atum em lata (em água/drenado)",
  "Atum em lata (em óleo/drenado)",
  "Sardinha em lata (óleo/drenada)",
  "Tapioca (goma hidratada/pronta)", // hidratação, não cozimento: a linha medida já bate com o fator 2,75
]);

describe("lista de gêmeos", () => {
  it("todo cozido e todo cru da lista existem no catálogo, com o estado certo", () => {
    for (const [cookedKey, rawName] of Object.entries(COOKED_TWINS)) {
      const cooked = byKey(cookedKey);
      const raw = byName(rawName);
      expect(cooked, `cozido: ${cookedKey}`).toBeTruthy();
      expect(raw, `cru: ${rawName}`).toBeTruthy();
      expect(isCookedEntry(cooked), `${cookedKey} deveria ser cozido`).toBe(true);
      expect(isCookedEntry(raw), `${rawName} deveria ser cru`).toBe(false);
      expect(cooked.group, cookedKey).toBe(raw.group);
    }
  });

  it("todo alimento cozido do catálogo tem gêmeo cru (ou está na lista de exceções)", () => {
    const orphans = TACO_FOODS.filter((f) => isCookedEntry(f) && !COOKED_TWINS[f.name.toLowerCase()] && !NO_TWIN.has(f.name));
    expect(orphans.map((f) => f.name)).toEqual([]);
  });

  it("alimento cozido novo sem gêmeo reprova aqui (cadastre em cookedTwins.ts)", () => {
    const fake = [{ name: "Teste (cozido)", kcal: 100, p: 1, c: 1, g: 1, group: "carb" as const, valuesArCooked: true }];
    expect(isCookedEntry(fake[0])).toBe(true);
    expect(applyCookedTwins(fake as any)[0].kcal).toBe(100); // sem gêmeo, nada muda
  });
});

describe("kcal e macros: cru × cozido dão o mesmo total", () => {
  it.each(Object.entries(COOKED_TWINS))("%s ≡ %s", (cookedKey, rawName) => {
    const cooked = byKey(cookedKey);
    const raw = byName(rawName);
    const cf = twinFactor(raw);
    for (const g of [50, 100, 180]) {
      const a = calcItemMacros({ isTaco: true, baseName: raw.name, rawWeight: g });
      const b = calcItemMacros({ isTaco: true, baseName: cooked.name, rawWeight: g * cf });
      expect(Math.abs(a.kcal - b.kcal), `kcal ${rawName} ${g} g`).toBeLessThanOrEqual(Math.max(0.01 * a.kcal, 1));
      expect(Math.abs(a.protein - b.protein), `proteína ${rawName}`).toBeLessThanOrEqual(Math.max(0.02 * a.protein, 0.3));
      expect(Math.abs(a.carbs - b.carbs), `carbo ${rawName}`).toBeLessThanOrEqual(Math.max(0.02 * a.carbs, 0.3));
      expect(Math.abs(a.fat - b.fat), `gordura ${rawName}`).toBeLessThanOrEqual(Math.max(0.02 * a.fat, 0.3));
    }
  });

  it("exemplos do coach: feijão cozido não perde 45% das kcal; arroz continua batendo", () => {
    const cruFeijao = calcItemMacros({ isTaco: true, baseName: "Feijão carioca (cru)", rawWeight: 60 });
    const cozFeijao = calcItemMacros({ isTaco: true, baseName: "Feijão carioca (cozido)", rawWeight: 60 * 2.4 });
    expect(Math.abs(cruFeijao.kcal - cozFeijao.kcal) / cruFeijao.kcal).toBeLessThanOrEqual(0.01);
    const cruArroz = calcItemMacros({ isTaco: true, baseName: "Arroz branco (cru)", rawWeight: 100 });
    const cozArroz = calcItemMacros({ isTaco: true, baseName: "Arroz branco (cozido)", rawWeight: 270 });
    expect(Math.abs(cruArroz.kcal - cozArroz.kcal) / cruArroz.kcal).toBeLessThanOrEqual(0.01);
  });

  it("a conversão não mexe no nome, no grupo nem nas flags do cozido", () => {
    const c = byName("Arroz branco (cozido)");
    expect(c.valuesArCooked).toBe(true);
    expect(c.group).toBe("carb");
    expect(c.cookFactor).toBeUndefined();
  });

  it("o cru nunca é alterado pela conversão", () => {
    const measured = applyCookedTwins(TACO_FOODS);
    for (const rawName of new Set(Object.values(COOKED_TWINS))) {
      const a = measured.find((f) => f.name === rawName)!;
      const b = byName(rawName);
      expect([a.kcal, a.p, a.c, a.g]).toEqual([b.kcal, b.p, b.c, b.g]);
    }
  });
});
