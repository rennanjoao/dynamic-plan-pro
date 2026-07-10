import { describe, it, expect } from "vitest";
import {
  detectProtocolChanges,
  summarizeProtocolChanges,
  type ProtocolChange,
} from "../protocolChangeDetector";

// Fábrica minimalista de payloads: 2 dias de treino, 1-2 refeições,
// 1-2 suplementos. Suficiente para as regras de negócio deste módulo.
function basePayload(): any {
  return {
    macros: { calories: 2500, protein: 180, carbs: 280, fat: 70, water: 3, goal: "hipertrofia" },
    showGuidelines: true,
    guidelines: { training: "Foco em progressão", diet: "" },
    workouts: [
      {
        key: "seg",
        focus: "Peito",
        exercises: [
          { name: "Supino Reto", sets: "4", reps: "8-10", rest: "90s", cadence: "2010", notes: "" },
          { name: "Crucifixo",   sets: "3", reps: "12",   rest: "60s", cadence: "2010", notes: "" },
        ],
      },
      {
        key: "ter",
        focus: "Costas",
        exercises: [
          { name: "Puxada Alta", sets: "4", reps: "10", rest: "90s", cadence: "2010", notes: "" },
        ],
      },
    ],
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        notes: "",
        hiddenKinds: [],
        options: [
          {
            kind: "carb",
            title: "Opção 1",
            items: [{ name: "Pão Integral", weight: "60g" }],
          },
          {
            kind: "carb",
            title: "Opção 2",
            items: [{ name: "Aveia", weight: "40g" }],
          },
        ],
      },
    ],
    supplements: [
      { name: "Whey", dose: "30g", timing: "pós-treino", notes: "" },
      { name: "Creatina", dose: "5g", timing: "manhã", notes: "" },
    ],
  };
}

// Deep clone JSON-safe (payloads são POJOs)
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("detectProtocolChanges", () => {
  it("payloads idênticos → array vazio", () => {
    const p = basePayload();
    expect(detectProtocolChanges(clone(p), clone(p))).toEqual([]);
  });

  it("troca de 1 exercício pelo nome → item alta 'substituído'", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises[1] = {
      name: "Peck Deck", sets: "3", reps: "12", rest: "60s", cadence: "2010", notes: "",
    };
    const res = detectProtocolChanges(prev, next);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      category: "treino",
      importance: "alta",
      label: "Crucifixo foi substituído por Peck Deck",
    });
    expect(res[0].target_anchor).toContain("workout-seg-exercise-peck-deck");
  });

  it("exercício adicionado sem remoção → item media 'adicionado'", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises.push({
      name: "Cross Over", sets: "3", reps: "15", rest: "60s", cadence: "2010", notes: "",
    });
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "treino",
        importance: "media",
        label: "Novo exercício adicionado: Cross Over",
      }),
    ]);
  });

  it("exercício removido sem adição → item media 'removido'", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises.pop();
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "treino",
        importance: "media",
        label: "Crucifixo foi removido do treino",
      }),
    ]);
  });

  it("apenas reordenar exercícios do dia → nada", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises.reverse();
    expect(detectProtocolChanges(prev, next)).toEqual([]);
  });

  it("dia de treino novo → 1 item alta", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts.push({
      key: "qua",
      focus: "Pernas",
      exercises: [{ name: "Agachamento", sets: "4", reps: "8" }],
    });
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "treino",
        importance: "alta",
        label: "Um novo dia de treino foi adicionado: Pernas",
      }),
    ]);
  });

  it("dia de treino removido → 1 item alta", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts.pop();
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "treino",
        importance: "alta",
        label: "O treino de Costas foi removido",
      }),
    ]);
  });

  it("sets/reps/rest/cadence mudando juntos no mesmo exercício → 1 item só", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises[0] = {
      ...next.workouts[0].exercises[0],
      sets: "5",
      reps: "6",
      rest: "120s",
      cadence: "3010",
    };
    const res = detectProtocolChanges(prev, next);
    expect(res).toHaveLength(1);
    expect(res[0].category).toBe("treino");
    expect(res[0].importance).toBe("baixa");
    expect(res[0].label).toContain("Supino Reto");
  });

  it("notes adicionada em exercício existente → 'nova observação'", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.workouts[0].exercises[0].notes = "Aumentar 2kg";
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "treino",
        importance: "baixa",
        label: "Nova observação em Supino Reto",
      }),
    ]);
  });

  it("refeição nova → 1 item", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.meals.push({ name: "Ceia", time: "22:00", notes: "", hiddenKinds: [], options: [] });
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "dieta",
        importance: "alta",
        label: "Uma nova refeição foi adicionada: Ceia",
        target_anchor: "meal-ceia",
      }),
    ]);
  });

  it("refeição removida → 1 item", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.meals = [];
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "dieta",
        importance: "alta",
        label: "A refeição Café da manhã foi removida do seu plano",
      }),
    ]);
  });

  it("item de comida adicionado na Opção 2 → anchor referencia a Opção 2, não a 1", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.meals[0].options[1].items.push({ name: "Tapioca", weight: "50g" });
    const res = detectProtocolChanges(prev, next);
    expect(res).toHaveLength(1);
    expect(res[0].label).toBe("Tapioca foi adicionado na refeição Café da manhã");
    expect(res[0].target_anchor).toContain("carb-opcao-2");
    expect(res[0].target_anchor).not.toContain("opcao-1");
  });

  it("weight de item de comida mudando → 'quantidade ajustada'", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.meals[0].options[0].items[0].weight = "80g";
    const res = detectProtocolChanges(prev, next);
    expect(res).toEqual([
      expect.objectContaining({
        category: "dieta",
        importance: "baixa",
        label: "A quantidade de Pão Integral na refeição Café da manhã foi ajustada",
      }),
    ]);
  });

  it("hiddenKinds ganhando um valor → 1 item; perdendo um valor → nada", () => {
    const prev = basePayload();
    const next1 = clone(prev);
    next1.meals[0].hiddenKinds = ["carb"];
    expect(detectProtocolChanges(prev, next1)).toEqual([
      expect.objectContaining({
        category: "dieta",
        importance: "media",
        label: expect.stringContaining("deixou de estar disponível"),
      }),
    ]);
    const prev2 = basePayload();
    prev2.meals[0].hiddenKinds = ["carb"];
    const next2 = clone(prev2);
    next2.meals[0].hiddenKinds = [];
    expect(detectProtocolChanges(prev2, next2)).toEqual([]);
  });

  it("suplemento novo/removido/com dose alterada", () => {
    const prev = basePayload();

    const nextAdded = clone(prev);
    nextAdded.supplements.push({ name: "Ômega 3", dose: "2g", timing: "manhã", notes: "" });
    expect(detectProtocolChanges(prev, nextAdded)).toEqual([
      expect.objectContaining({ category: "suplemento", importance: "alta", label: "Novo suplemento adicionado: Ômega 3" }),
    ]);

    const nextRemoved = clone(prev);
    nextRemoved.supplements.pop();
    expect(detectProtocolChanges(prev, nextRemoved)).toEqual([
      expect.objectContaining({ category: "suplemento", importance: "media", label: "Creatina foi removido dos suplementos" }),
    ]);

    const nextDose = clone(prev);
    nextDose.supplements[0].dose = "40g";
    expect(detectProtocolChanges(prev, nextDose)).toEqual([
      expect.objectContaining({ category: "suplemento", importance: "baixa", label: "Whey teve dose ou horário ajustado" }),
    ]);
  });

  it("calories + protein mudando juntos → 1 item; goal → item separado", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.macros.calories = 2700;
    next.macros.protein = 200;
    const res = detectProtocolChanges(prev, next);
    expect(res).toHaveLength(1);
    expect(res[0].label).toBe("Suas metas de calorias e macros foram ajustadas");

    const next2 = clone(prev);
    next2.macros.calories = 2700;
    next2.macros.protein = 200;
    next2.macros.goal = "emagrecimento";
    const res2 = detectProtocolChanges(prev, next2);
    expect(res2).toHaveLength(2);
    expect(res2.map((c) => c.label)).toEqual(
      expect.arrayContaining([
        "Suas metas de calorias e macros foram ajustadas",
        "Seu objetivo foi atualizado",
      ]),
    );
  });

  it("guidelines.training mudando → 1 item; guidelines.diet sozinho → nada", () => {
    const prev = basePayload();
    const next = clone(prev);
    next.guidelines.training = "Nova periodização";
    expect(detectProtocolChanges(prev, next)).toEqual([
      expect.objectContaining({ category: "diretriz", label: "A diretriz de treino foi atualizada" }),
    ]);

    const next2 = clone(prev);
    next2.guidelines.diet = "Aumentar hidratação";
    expect(detectProtocolChanges(prev, next2)).toEqual([]);
  });

  it("showGuidelines false→true com texto de treino → 1 item; true→false → nada", () => {
    const prev = basePayload();
    prev.showGuidelines = false;
    const next = clone(prev);
    next.showGuidelines = true;
    expect(detectProtocolChanges(prev, next)).toEqual([
      expect.objectContaining({ label: "Novas diretrizes de treino foram liberadas para você" }),
    ]);

    const prev2 = basePayload();
    prev2.showGuidelines = true;
    const next2 = clone(prev2);
    next2.showGuidelines = false;
    expect(detectProtocolChanges(prev2, next2)).toEqual([]);
  });
});

describe("summarizeProtocolChanges", () => {
  const makeChange = (i: number): ProtocolChange => ({
    category: "treino",
    importance: "media",
    label: `Mudança ${i}`,
    target_tab: "treino",
    target_anchor: null,
  });

  it("array vazio → array vazio", () => {
    expect(summarizeProtocolChanges({ wasInactive: false, changes: [] })).toEqual([]);
  });

  it("wasInactive=true → colapsa para 1 item 'liberado'", () => {
    const many = Array.from({ length: 5 }, (_, i) => makeChange(i));
    const res = summarizeProtocolChanges({ wasInactive: true, changes: many });
    expect(res).toEqual([
      expect.objectContaining({
        category: "geral",
        importance: "alta",
        label: "Seu protocolo foi liberado pelo seu coach",
      }),
    ]);
  });

  it("mais de 8 mudanças reais → colapsa em 1 item 'totalmente atualizado'", () => {
    const nine = Array.from({ length: 9 }, (_, i) => makeChange(i));
    const res = summarizeProtocolChanges({ wasInactive: false, changes: nine });
    expect(res).toEqual([
      expect.objectContaining({
        category: "geral",
        importance: "alta",
        label: "Seu protocolo foi totalmente atualizado pelo seu coach",
      }),
    ]);
  });

  it("até 8 mudanças e não estava inativo → passa direto", () => {
    const eight = Array.from({ length: 8 }, (_, i) => makeChange(i));
    expect(summarizeProtocolChanges({ wasInactive: false, changes: eight })).toEqual(eight);
  });
});