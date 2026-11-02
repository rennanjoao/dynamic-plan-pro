/**
 * fiberAndQuantity.test.ts — fibra: cobertura e coerência CRU × COZIDO.
 *
 * (Este arquivo estava com o conteúdo de src/data/fiberEquivalents.ts, sem nenhum teste.)
 *
 * Regra de produto: o total de fibra é o MESMO seja o alimento prescrito cru ou cozido
 *   fibra do cozido (por 100 g) = fibra do cru (por 100 g) ÷ cookFactor
 */
import { describe, it, expect } from "vitest";
import { TACO_FOODS } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { INDUSTRIAL_FOODS } from "@/data/industrialFoods";
import { LEGACY_FIBER_EXTRA } from "@/data/legacyFiberExtra";
import { LEGACY_TACO_FIBER } from "@/data/tacoFiberData";
import { calcItemMacros, resolveFiberPer100 } from "@/lib/macroCalc";

// Pendente conhecido (sem fonte confiável): preencher em legacyFiberExtra.ts quando houver o rótulo.
const PENDING = new Set(["Rap10 / Tortilha de trigo"]);

const food = (n: string) => TACO_FOODS.find((f) => f.name === n)!;

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
  const adjusted = Object.entries(LEGACY_FIBER_EXTRA).filter(([, e]) => e.kind === "ajustado");

  it("há cozidos ajustados (arroz, massas, feijão, lentilha, quinoa, grão-de-bico, cuscuz, tapioca)", () => {
    expect(adjusted.length).toBeGreaterThanOrEqual(13);
  });

  it.each(adjusted.map(([k]) => [k]))("%s = fibra do cru ÷ fator (tolerância 3%)", (key) => {
    const e = LEGACY_FIBER_EXTRA[key];
    const cooked = TACO_FOODS.find((f) => f.name.toLowerCase() === key)!;
    const raw = TACO_FOODS.find((f) => f.name.toLowerCase() === e.rawTwin)!;
    expect(cooked, key).toBeTruthy();
    expect(raw, String(e.rawTwin)).toBeTruthy();
    expect(raw.cookFactor, `${raw.name} precisa de cookFactor`).toBeGreaterThan(1);
    const rawFiber = resolveFiberPer100(raw).value;
    const expected = rawFiber / raw.cookFactor!;
    const got = resolveFiberPer100(cooked).value;
    expect(Math.abs(got - expected), `${cooked.name}: ${got} × ${expected.toFixed(3)}`).toBeLessThanOrEqual(Math.max(0.03 * expected, 0.006));
  });

  it("100 g crus e (100 × fator) g cozidos dão a MESMA fibra no cálculo do painel", () => {
    for (const [key, e] of adjusted) {
      const cooked = TACO_FOODS.find((f) => f.name.toLowerCase() === key)!;
      const raw = TACO_FOODS.find((f) => f.name.toLowerCase() === e.rawTwin)!;
      const fromRaw = calcItemMacros({ isTaco: true, baseName: raw.name, rawWeight: 100 }).fiber;
      const fromCooked = calcItemMacros({ isTaco: true, baseName: cooked.name, rawWeight: 100 * raw.cookFactor! }).fiber;
      expect(Math.abs(fromRaw - fromCooked), cooked.name).toBeLessThanOrEqual(Math.max(0.03 * fromRaw, 0.015));
    }
  });

  it("exemplo do coach: 200 g de arroz cozido NÃO vira 3,1 g de fibra (era 2,6× o cru)", () => {
    const m = calcItemMacros({ isTaco: true, baseName: "Arroz branco (cozido)", rawWeight: 200 });
    expect(m.fiber).toBeCloseTo(1.2, 1);
  });

  it("o valor medido do cozido fica guardado e é diferente do usado (rastreável)", () => {
    for (const [key, e] of adjusted) {
      if (e.measured === undefined) continue;
      expect(e.measured, key).toBeGreaterThan(0);
    }
    // onde a TACO tinha o número, ele é exatamente o `measured`
    for (const [key, e] of adjusted) {
      const t = LEGACY_TACO_FIBER[key];
      if (t) expect(e.measured, key).toBe(t.fiber);
    }
  });

  it("cru e cozido de legumes (fator 1) ficam na mesma ordem de grandeza (±50%)", () => {
    const pairs: Array<[string, string]> = [
      ["Brócolis (cru)", "Brócolis (cozido/vapor)"],
      ["Couve-flor (crua)", "Couve-flor (cozida)"],
      ["Cenoura (crua)", "Cenoura (cozida)"],
      ["Abobrinha italiana (crua)", "Abobrinha italiana (cozida)"],
      ["Abóbora cabotian (crua)", "Abóbora cabotian (cozida)"],
      ["Chuchu (cru)", "Chuchu (cozido)"],
    ];
    for (const [r, c] of pairs) {
      const fr = resolveFiberPer100(food(r)).value;
      const fc = resolveFiberPer100(food(c)).value;
      expect(food(r).cookFactor ?? 1, r).toBe(1);
      expect(fc / fr, `${r} × ${c}`).toBeGreaterThan(0.5);
      expect(fc / fr, `${r} × ${c}`).toBeLessThan(1.5);
    }
  });
});
