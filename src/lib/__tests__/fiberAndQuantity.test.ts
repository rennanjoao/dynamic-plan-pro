/**
 * fiberAndQuantity.test.ts — fibra: cobertura dos catálogos e independência de cru × cozido.
 *
 * (Este arquivo estava com o conteúdo de src/data/fiberEquivalents.ts, sem nenhum teste.)
 *
 * Regra de produto: cru e cozido só servem para o aluno entender a pesagem. O total de fibra
 * (como o de kcal e macros) é o MESMO seja o alimento prescrito cru ou cozido:
 *   fibra do cozido (por 100 g) = fibra do cru (por 100 g) ÷ cookFactor
 */
import { describe, it, expect } from "vitest";
import { TACO_FOODS } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { INDUSTRIAL_FOODS } from "@/data/industrialFoods";
import { LEGACY_FIBER_EXTRA } from "@/data/legacyFiberExtra";
import { COOKED_TWINS } from "@/data/cookedTwins";
import { calcItemMacros, resolveFiberPer100 } from "@/lib/macroCalc";

// Pendente conhecido (sem fonte confiável): preencher em legacyFiberExtra.ts quando houver o rótulo.
const PENDING = new Set(["Rap10 / Tortilha de trigo"]);

describe("cobertura de fibra dos catálogos", () => {
  it.each([
    ["legado", TACO_FOODS],
    ["TACO enriquecida", ENRICHED_FOODS],
    ["industrializados", INDUSTRIAL_FOODS],
  ] as const)("%s: nenhum alimento sem dado de fibra (além do pendente)", (_l, list) => {
    const missing = (list as Array<{ name: string }>)
      .filter((f) => resolveFiberPer100(f).source === "missing" && !PENDING.has(f.name))
      .map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it("valores plausíveis (0–90 g/100 g; psyllium chega a 75)", () => {
    for (const f of [...TACO_FOODS, ...ENRICHED_FOODS]) {
      const v = resolveFiberPer100(f);
      if (v.source === "missing") continue;
      expect(v.value, f.name).toBeGreaterThanOrEqual(0);
      expect(v.value, f.name).toBeLessThanOrEqual(90);
    }
  });

  it("toda entrada de legacyFiberExtra aponta para um alimento que existe no legado", () => {
    const names = new Set(TACO_FOODS.map((f) => f.name.toLowerCase()));
    for (const key of Object.keys(LEGACY_FIBER_EXTRA)) expect(names.has(key), key).toBe(true);
  });
});

describe("cru × cozido: mesmo total de fibra", () => {
  const twins = Object.entries(COOKED_TWINS);

  it.each(twins)("%s: 100 g de cru e (100 × fator) g de cozido dão a mesma fibra", (cookedKey, rawName) => {
    const cooked = TACO_FOODS.find((f) => f.name.toLowerCase() === cookedKey)!;
    const raw = TACO_FOODS.find((f) => f.name === rawName)!;
    expect(cooked, cookedKey).toBeTruthy();
    expect(raw, rawName).toBeTruthy();
    const cf = raw.cookFactor ?? 1;
    const a = calcItemMacros({ isTaco: true, baseName: raw.name, rawWeight: 100 });
    const b = calcItemMacros({ isTaco: true, baseName: cooked.name, rawWeight: 100 * cf });
    expect(a.fiberUnknown, rawName).toBe(b.fiberUnknown);
    expect(Math.abs(a.fiber - b.fiber), `${rawName} × ${cooked.name}`).toBeLessThanOrEqual(Math.max(0.02 * a.fiber, 0.02));
  });

  it("exemplo do coach: 200 g de arroz cozido NÃO vira 3,1 g de fibra (era 2,6× o cru)", () => {
    const m = calcItemMacros({ isTaco: true, baseName: "Arroz branco (cozido)", rawWeight: 200 });
    expect(m.fiber).toBeCloseTo(1.2, 1);
  });

  it("prato cozido (200 g arroz + 100 g feijão) = mesmo prato em cru, em fibra", () => {
    const cozido = [
      calcItemMacros({ isTaco: true, baseName: "Arroz branco (cozido)", rawWeight: 200 }),
      calcItemMacros({ isTaco: true, baseName: "Feijão carioca (cozido)", rawWeight: 100 }),
    ].reduce((s, m) => s + m.fiber, 0);
    const cru = [
      calcItemMacros({ isTaco: true, baseName: "Arroz branco (cru)", rawWeight: 200 / 2.7 }),
      calcItemMacros({ isTaco: true, baseName: "Feijão carioca (cru)", rawWeight: 100 / 2.4 }),
    ].reduce((s, m) => s + m.fiber, 0);
    expect(Math.abs(cozido - cru) / cru).toBeLessThanOrEqual(0.02);
  });

  it("cozido cujo cru ainda não tem fibra herda 'sem dado' (nunca zero silencioso)", () => {
    expect(resolveFiberPer100({ name: "Rap10 / Tortilha de trigo", group: "carb" }).source).toBe("missing");
  });
});
