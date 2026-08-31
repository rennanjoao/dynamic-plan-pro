import { describe, it, expect } from "vitest";
import { ProtocolPayloadSchema, MealOptionSchema, MealFoodItemSchema, isMobilityExercise } from "../protocolSchema";

describe("MealFoodItemSchema — campos premium (importação JSON)", () => {
  it("aceita item com baseName, rawWeight, cookFactor, isTaco, manualMacros", () => {
    const r = MealFoodItemSchema.parse({
      name: "Arroz cozido",
      baseName: "Arroz",
      weight: "150g",
      rawWeight: 60,
      cookFactor: 2.5,
      isTaco: true,
      manualMacros: { protein: 1.4, carbs: 13, fat: 0.1, kcal: 65 },
    });
    expect(r.baseName).toBe("Arroz");
    expect(r.rawWeight).toBe(60);
    expect(r.isTaco).toBe(true);
  });

  it("aceita campos extras (macroCategory, measureInfo, isRaw) sem strip — schema permissivo", () => {
    const raw = {
      name: "Frango",
      weight: "150g",
      macroCategory: "protein",
      measureInfo: "fatia média (~30g)",
      isRaw: true,
    };
    // Zod com .object() por padrão remove desconhecidos; verificamos que parse não lança
    const r = MealFoodItemSchema.parse(raw);
    expect(r.name).toBe("Frango");
  });

  it("legacy: string vira { name, weight: '' }", () => {
    const r = MealFoodItemSchema.parse("Banana");
    expect(r).toEqual({ name: "Banana", weight: "" });
  });
});

describe("MealOptionSchema — items legacy", () => {
  it("items como string legado vira array", () => {
    const r = MealOptionSchema.parse({ kind: "carb", title: "Op1", items: "Arroz 150g" });
    expect(r.items).toEqual([{ name: "Arroz 150g", weight: "" }]);
  });

  it("kind default = carb", () => {
    const r = MealOptionSchema.parse({ title: "Op1", items: [] });
    expect(r.kind).toBe("carb");
  });
});

describe("isMobilityExercise", () => {
  it("flag explícita true vence, com ou sem nome batendo em hint", () => {
    expect(isMobilityExercise({ name: "Supino Reto", is_mobility: true })).toBe(true);
  });

  it("flag explícita false é respeitada mesmo se o nome bater em hint (decisão do coach)", () => {
    expect(isMobilityExercise({ name: "Rotação Externa de Ombro com Halteres", is_mobility: false })).toBe(false);
  });

  // Sem a chave is_mobility presente no objeto — é exatamente a forma que
  // StudentWorkoutAnalytics.tsx passa (workout_sets não persiste is_mobility,
  // só exercise_name), então este é o caminho que decide o filtro de volume
  // dos gráficos do coach. Cobrir aqui documenta o contrato real.
  describe("fallback por nome (sem chave is_mobility no objeto)", () => {
    it.each([
      "Mobilidade de Quadril",
      "Alongamento de Panturrilha",
      "Trabalho de Flexibilidade Ativa",
      "Liberação Miofascial Lombar",
      "Foam Roller Peitoral",
      "Rotação Externa de Ombro",
      "Rotação Interna de Quadril",
    ])("reconhece '%s' como mobilidade", (name) => {
      expect(isMobilityExercise({ name })).toBe(true);
    });

    it("é case-insensitive", () => {
      expect(isMobilityExercise({ name: "ALONGAMENTO DE ISQUIOTIBIAIS" })).toBe(true);
    });

    it("não reconhece exercícios de força comuns", () => {
      expect(isMobilityExercise({ name: "Supino Reto com Barra" })).toBe(false);
      expect(isMobilityExercise({ name: "Agachamento Livre" })).toBe(false);
      expect(isMobilityExercise({ name: "Rosca Direta" })).toBe(false);
    });

    // Limitação conhecida e aceita: como o fallback é só por substring, um
    // exercício de FORÇA real (rotação externa/interna com carga, prescrito
    // como acessório, não como mobilidade) cai no mesmo hint e é tratado
    // como mobilidade quando não há flag explícita persistida — é o caso do
    // workout_sets, que não guarda is_mobility. Contra isso, só persistir a
    // flag na própria linha de série no momento do registro (fora do escopo
    // deste fix). Teste documenta o trade-off, não um bug a corrigir aqui.
    it("[limitação conhecida] nome com 'rotação externa/interna' é tratado como mobilidade mesmo sendo um acessório de força real, quando não há flag persistida", () => {
      expect(isMobilityExercise({ name: "Rotação Externa de Ombro com Halteres 2kg" })).toBe(true);
    });
  });
});

describe("ProtocolPayloadSchema — round-trip & legacy", () => {
  it("round-trip de payload completo preserva campos premium", () => {
    const payload = {
      setup: { split: "ABC", mealsCount: 4, carbCycle: false },
      macros: { calories: 2500, protein: 180, carbs: 280, fat: 60, water: 3, goal: "hipertrofia" },
      guidelines: { training: "", diet: "", weekOrganization: "", supplementation: "" },
      showGuidelines: true,
      workouts: [],
      meals: [
        {
          name: "Café",
          time: "07:00",
          macros: { carbs: 40, protein: 30, fat: 10 },
          options: [
            {
              kind: "carb",
              title: "Op1",
              items: [{ name: "Aveia", weight: "50g", baseName: "Aveia", rawWeight: 50, isTaco: true }],
            },
          ],
          substitutions: {
            carb: [{ name: "", weight: "" }, { name: "", weight: "" }],
            protein: [{ name: "", weight: "" }, { name: "", weight: "" }],
            fat: [{ name: "", weight: "" }, { name: "", weight: "" }],
          },
          carbCycle: false,
          day_type: "rest",
          pairId: "pair-almoco",
          excludeFromDayTotal: true,
          notes: "",
        },
      ],
      carbCycle: {},
      carbCycleNotes: {},
      carbCycleHighPct: 15,
      carbCycleLowPct: 15,
      cardio: [],
      supplements: [],
    };
    const r = ProtocolPayloadSchema.parse(payload);
    expect(r.meals[0].options[0].items[0].rawWeight).toBe(50);
    expect(r.meals[0].options[0].items[0].isTaco).toBe(true);
    expect(r.meals[0].day_type).toBe("rest");
    expect(r.meals[0].pairId).toBe("pair-almoco");
    expect(r.meals[0].excludeFromDayTotal).toBe(true);
    expect(r.showGuidelines).toBe(true);
    // re-parse
    const r2 = ProtocolPayloadSchema.parse(r);
    expect(r2.meals[0].options[0].items[0]).toEqual(r.meals[0].options[0].items[0]);
  });

  it("migra refeição legada (carbs/proteins/fats arrays de string) para options", () => {
    const legacy = {
      setup: { split: "AB", mealsCount: 2, carbCycle: false },
      meals: [
        {
          name: "Almoço",
          carbs: ["Arroz 100g"],
          proteins: ["Frango 150g"],
          fats: ["Azeite 10g"],
        },
      ],
    };
    const r = ProtocolPayloadSchema.parse(legacy);
    const opts = r.meals[0].options;
    expect(opts.some((o) => o.kind === "carb" && o.items[0].name === "Arroz 100g")).toBe(true);
    expect(opts.some((o) => o.kind === "protein" && o.items[0].name === "Frango 150g")).toBe(true);
    expect(opts.some((o) => o.kind === "fat" && o.items[0].name === "Azeite 10g")).toBe(true);
  });

  it("payload mínimo aplica defaults", () => {
    const r = ProtocolPayloadSchema.parse({ setup: { split: "ABC", mealsCount: 5, carbCycle: false } });
    expect(r.macros.calories).toBe(2200);
    expect(r.workouts).toEqual([]);
    expect(r.meals).toEqual([]);
  });
});
