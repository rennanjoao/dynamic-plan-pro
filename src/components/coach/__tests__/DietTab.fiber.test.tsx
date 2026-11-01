import { describe, expect, it } from "vitest";
import { calcDayMacros, calcItemMacros, parseWeightString, resolveFiberPer100, resolveQuantity } from "../macroCalc";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { TACO_FOODS } from "@/data/tacoFoods";
import { LEGACY_TO_ENRICHED_FIBER } from "@/data/fiberEquivalents";
import { LEGACY_TACO_FIBER } from "@/data/tacoFiberData";
import { INDUSTRIAL_FOODS, industrialByName } from "@/data/industrialFoods";

const SOPA = [{ label: "1 colher de sopa", grams: 10 }];

describe("fibra: nunca zero silencioso", () => {
  it("toda ponte legado → enriquecido aponta para um alimento que existe nas duas bases", () => {
    for (const [legacy, enriched] of Object.entries(LEGACY_TO_ENRICHED_FIBER)) {
      expect(TACO_FOODS.some((f) => f.name.toLowerCase() === legacy), legacy).toBe(true);
      expect(ENRICHED_FOODS.some((f) => f.name === enriched), enriched).toBe(true);
    }
  });

  it("a ponte só liga o MESMO alimento: kcal do par diverge no máximo 10%", () => {
    for (const [legacy, enriched] of Object.entries(LEGACY_TO_ENRICHED_FIBER)) {
      const a = TACO_FOODS.find((f) => f.name.toLowerCase() === legacy)!;
      const b = ENRICHED_FOODS.find((f) => f.name === enriched)!;
      expect(Math.abs(a.kcal - b.kcal) / b.kcal, `${legacy} ↔ ${enriched}`).toBeLessThanOrEqual(0.1);
    }
  });

  it("batata doce (crua) legada usa a fibra da COZIDA (os valores do legado são os da cozida), nunca a da crua", () => {
    const f = TACO_FOODS.find((x) => x.name === "Batata doce (crua)");
    expect(resolveFiberPer100(f)).toEqual({ value: 2.21, source: "taco" });
    expect(LEGACY_TACO_FIBER["batata doce (crua)"].taco).toBe("Batata, doce, cozida");
  });

  it("alimento legado com equivalente exato passa a contar fibra (arroz branco cru, 100 g)", () => {
    const m = calcItemMacros({ isTaco: true, baseName: "Arroz branco (cru)", rawWeight: 100 });
    expect(m.fiber).toBeCloseTo(1.639, 3);
    expect(m.fiberUnknown).toBe(0);
  });

  it("alimento sem dado de fibra é sinalizado, não tratado como zero", () => {
    const m = calcItemMacros({ isTaco: true, baseName: "Arroz parboilizado (cozido)", rawWeight: 100 });
    expect(m.fiber).toBe(0);
    expect(m.fiberUnknown).toBe(1);
  });

  it("carne, ovo e laticínio são zero real (sem alerta); soja e oleaginosas não", () => {
    expect(resolveFiberPer100({ name: "Frango peito s/ pele (grelhado)", group: "protein" })).toEqual({ value: 0, source: "zero" });
    expect(resolveFiberPer100({ name: "Queijo Minas Frescal", group: "dairy" }).source).toBe("zero");
    expect(resolveFiberPer100({ name: "Soja (crua)", group: "protein" }).source).toBe("missing");
    expect(resolveFiberPer100({ name: "Pasta de amendoim integral", group: "fat" }).source).toBe("missing");
    expect(resolveFiberPer100({ name: "Chia (sementes)", group: "fat", fiber: 34 })).toEqual({ value: 34, source: "table" });
  });

  it("soma do dia carrega fibra e a contagem de itens sem dado", () => {
    const meal = {
      options: [
        { kind: "carb", items: [{ isTaco: true, baseName: "Aveia em flocos", rawWeight: 50 }, { isTaco: true, baseName: "Arroz parboilizado (cozido)", rawWeight: 100 }] },
        { kind: "protein", items: [{ isTaco: true, baseName: "Ovo de galinha inteiro (cru)", rawWeight: 100 }] },
      ],
    };
    const day = calcDayMacros([meal]);
    expect(day.fiber).toBeCloseTo(9.13 / 2, 2);
    expect(day.fiberUnknown).toBe(1);
  });

  it("macros manuais aceitam fibra informada; sem fibra com kcal ficam sinalizados", () => {
    expect(calcItemMacros({ manualMacros: { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 4 } })).toMatchObject({ fiber: 4, fiberUnknown: 0 });
    expect(calcItemMacros({ manualMacros: { kcal: 100, protein: 1, carbs: 1, fat: 1 } })).toMatchObject({ fiber: 0, fiberUnknown: 1 });
  });

  it("medida caseira digitada sem rawWeight usa as porções do alimento no cálculo", () => {
    const m = calcItemMacros({ isTaco: true, baseName: "Atum em lata (em água/drenado)", weight: "1 lata" });
    expect(m.kcal).toBeGreaterThan(0);
  });
});

describe("fibra: dados lidos da TACO 4ª edição (tacoFiberData)", () => {
  it("todo alimento mapeado existe na base legada", () => {
    const legacy = new Set([...TACO_FOODS, ...INDUSTRIAL_FOODS].map((f) => f.name.toLowerCase()));
    for (const key of Object.keys(LEGACY_TACO_FIBER)) expect(legacy.has(key), key).toBe(true);
  });

  it("valores válidos e fonte identificada em toda entrada", () => {
    for (const [key, e] of Object.entries(LEGACY_TACO_FIBER)) {
      expect(Number.isFinite(e.fiber) && e.fiber >= 0 && e.fiber < 60, key).toBe(true);
      expect(e.taco.length, key).toBeGreaterThan(3);
      expect(e.tacoKcal, key).toBeGreaterThan(0);
    }
  });

  it("guarda de estado: energia do legado compatível com a do item TACO (±30% ou ±15 kcal)", () => {
    for (const [key, e] of Object.entries(LEGACY_TACO_FIBER)) {
      const f = [...TACO_FOODS, ...INDUSTRIAL_FOODS].find((x) => x.name.toLowerCase() === key)!;
      const tol = Math.max(0.3 * e.tacoKcal, 15);
      expect(Math.abs(f.kcal - e.tacoKcal), `${key} ↔ ${e.taco}`).toBeLessThanOrEqual(tol);
    }
  });

  it("nenhuma entrada contradiz a fibra já cadastrada na base enriquecida (mesmo item TACO)", () => {
    for (const [key, e] of Object.entries(LEGACY_TACO_FIBER)) {
      const same = ENRICHED_FOODS.find((x) => x.name === e.taco);
      if (same) expect(e.fiber, key).toBeCloseTo(same.fiber, 1);
    }
  });

  it("valores de referência conferidos no PDF da TACO (g/100 g)", () => {
    const cases: Array<[string, number]> = [
      ["Arroz branco (cozido)", 1.56], ["Arroz integral (cozido)", 2.75], ["Feijão carioca (cozido)", 8.51],
      ["Feijão preto (cozido)", 8.4], ["Brócolis (cozido/vapor)", 3.42], ["Cenoura (crua)", 3.18],
      ["Goiaba", 6.22], ["Abacate (polpa)", 6.31], ["Banana prata (crua)", 2.04], ["Morango", 1.72],
      ["Batata inglesa (cozida)", 1.34], ["Mandioca / Aipim (cozida)", 1.56], ["Linhaça (sementes)", 33.5],
    ];
    for (const [name, fiber] of cases) {
      const f = TACO_FOODS.find((x) => x.name === name);
      expect(resolveFiberPer100(f), name).toEqual({ value: fiber, source: "taco" });
    }
  });

  it("industrializado sem fibra no cadastro (creme de arroz) usa a TACO; os de laticínio seguem zero real", () => {
    const m = calcItemMacros({ isIndustrial: true, baseName: "Creme de Arroz (genérico)", rawWeight: 100 });
    expect(m.fiber).toBeCloseTo(1.1, 1);
    expect(m.fiberUnknown).toBe(0);
    for (const f of INDUSTRIAL_FOODS) expect(resolveFiberPer100(f).source, f.name).not.toBe("missing");
  });

  it("açúcar e mel: TACO diz NA (não aplicável) → zero conhecido, sem alerta", () => {
    for (const name of ["Açúcar branco / refinado", "Açúcar mascavo", "Mel de abelha"]) {
      const m = calcItemMacros({ isTaco: true, baseName: name, rawWeight: 100 });
      expect(m.fiber, name).toBe(0);
      expect(m.fiberUnknown, name).toBe(0);
    }
  });

  it("fibra do dia agora conta o arroz e o feijão cozidos (caso do coach)", () => {
    const meal = { options: [{ kind: "carb", items: [{ isTaco: true, baseName: "Arroz branco (cozido)", rawWeight: 200 }, { isTaco: true, baseName: "Feijão carioca (cozido)", rawWeight: 100 }] }] };
    const day = calcDayMacros([meal]);
    expect(day.fiber).toBeCloseTo(1.56 * 2 + 8.51, 2);
    expect(day.fiberUnknown).toBe(0);
  });

  it("pendências restantes: só alimentos SEM equivalente na TACO (e nenhum de origem animal)", () => {
    const missing = TACO_FOODS.filter((f) => resolveFiberPer100(f).source === "missing");
    expect(missing.length).toBeLessThanOrEqual(32);
    for (const f of missing) expect(["protein", "dairy"].includes(f.group) && !/soja/i.test(f.name), f.name).toBe(false);
  });
});

describe("quantidade: unidade/medida reconhecida enquanto digita", () => {
  it.each(["2 uni", "2 un", "2 unid", "2 unidades", "2 unidade"])("%s → unidade com peso unitário", (txt) => {
    expect(parseWeightString(txt, 50)).toMatchObject({ grams: 100, status: "ok", label: "unidade" });
  });
  it.each(["1 colh", "1 colher", "1 coelh", "1 coelher", "1 col", "1 cs", "1 colher de sopa", "1 colh sopa"])("%s → colher de sopa", (txt) => {
    expect(parseWeightString(txt, undefined, SOPA)).toMatchObject({ grams: 10, status: "ok", label: "colher de sopa" });
  });
  it("colher de chá nunca herda o peso da colher de sopa", () => {
    expect(parseWeightString("1 colher de chá", 13, SOPA)).toMatchObject({ grams: 0, status: "no-weight", convertible: false });
    expect(parseWeightString("1 cc", undefined, SOPA).convertible).toBe(false);
  });
  it("prefixos de fatia, grama e quilo", () => {
    expect(parseWeightString("3 fat", 25).grams).toBe(75);
    expect(parseWeightString("120 gr").grams).toBe(120);
    expect(parseWeightString("0,2 kil").grams).toBe(200);
  });
  it("texto não reconhecido é avisado, nunca vira gramas", () => {
    expect(parseWeightString("2 xyz")).toMatchObject({ grams: 0, status: "unknown" });
    expect(parseWeightString("")).toMatchObject({ status: "empty" });
  });
  it("medida sem peso cadastrado avisa em vez de inventar", () => {
    expect(parseWeightString("2 fatias")).toMatchObject({ grams: 0, status: "no-weight", isUnit: true });
  });
  it("plurais e pontuação: colheres, porções, (sopa)", () => {
    expect(parseWeightString("2 colheres", undefined, SOPA)).toMatchObject({ grams: 20, status: "ok", label: "colher de sopa" });
    expect(parseWeightString("2 colheres de sopa", undefined, SOPA).grams).toBe(20);
    expect(parseWeightString("1 colher (sopa)", undefined, SOPA).grams).toBe(10);
    expect(parseWeightString("2 porções", 40)).toMatchObject({ grams: 80, status: "ok" });
    expect(parseWeightString("1/2 colher", undefined, SOPA).grams).toBe(5);
    expect(parseWeightString("meia colher", undefined, SOPA).grams).toBe(5);
  });

  it("medida cadastrada fora da lista fixa continua valendo (como no parser anterior)", () => {
    const concha = [{ label: "1 concha média", grams: 90 }];
    expect(parseWeightString("2 conchas", undefined, concha)).toMatchObject({ grams: 180, status: "ok" });
    expect(parseWeightString("1 conch", undefined, concha).grams).toBe(90);
    expect(parseWeightString("2 conchas")).toMatchObject({ grams: 0, convertible: false });
  });

  it("texto padronizado para a visão do aluno (canonicalText)", () => {
    expect(parseWeightString("2 uni", 50).canonicalText).toBe("2 unidades");
    expect(parseWeightString("1 uni", 50).canonicalText).toBe("1 unidade");
    expect(parseWeightString("1 colh", undefined, SOPA).canonicalText).toBe("1 colher de sopa");
    expect(parseWeightString("3 fat", 25).canonicalText).toBe("3 fatias");
    expect(parseWeightString("1,5 coelh", undefined, SOPA).canonicalText).toBe("1,5 colheres de sopa");
    expect(parseWeightString("2 unidades", 50).canonicalText).toBe("2 unidades");
    expect(parseWeightString("150g").canonicalText).toBeUndefined();
    expect(parseWeightString("2 fatias").canonicalText).toBeUndefined();
  });

  it("industrializado: resolveQuantity usa o cadastro dele; sem medida cadastrada avisa em vez de inventar", () => {
    const item = { isIndustrial: true, baseName: "Requeijão Light Tirolez" };
    expect(resolveQuantity(item, "30g")).toMatchObject({ grams: 30, status: "ok" });
    expect(resolveQuantity(item, "2 colh")).toMatchObject({ grams: 0, status: "no-weight" });
    expect(industrialByName("Requeijão Light Tirolez")).toBeDefined();
  });

  it("industrializado lácteo conta fibra zero real, sem alerta", () => {
    const m = calcItemMacros({ isIndustrial: true, baseName: "Requeijão Light Tirolez", rawWeight: 30 });
    expect(m.kcal).toBeGreaterThan(0);
    expect(m.fiber).toBe(0);
    expect(m.fiberUnknown).toBe(0);
  });
});
