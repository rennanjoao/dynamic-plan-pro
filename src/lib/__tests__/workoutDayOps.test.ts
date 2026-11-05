import { describe, it, expect } from "vitest";
import { duplicateWorkoutDay, nextWorkoutKey } from "../workoutDayOps";
import { ProtocolPayloadSchema, PeriodizationSchema } from "../protocolSchema";
import { findExerciseOverride } from "../periodizationValidation";

function ex(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { __id: id, name, sets: "4", reps: "8-12", cadence: "3010", rest: "60s", notes: "", is_mobility: false, ...extra };
}

function build(
  overrides: Record<string, Record<string, Record<string, unknown>>> = {},
  cardio: Array<Record<string, unknown>> = [],
) {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 4, carbCycle: false },
    workouts: [
      { key: "A", focus: "Peito", exercises: [ex("a1", "Supino"), ex("a2", "Crucifixo", { allowed_substitutes: ["x"] }), ex("a3", "Mobilidade", { is_mobility: true })] },
      { key: "B", focus: "Costas", exercises: [ex("b1", "Remada")] },
    ],
    weekDays: { seg: "A", qua: "B" },
    periodization: PeriodizationSchema.parse({ enabled: true, overrides }),
    cardio,
  });
}

describe("nextWorkoutKey", () => {
  it("pega a primeira letra livre", () => {
    expect(nextWorkoutKey([{ key: "A" }, { key: "B" }])).toBe("C");
    expect(nextWorkoutKey([{ key: "B" }])).toBe("A");
  });
  it("nunca devolve REST", () => {
    expect(nextWorkoutKey([])).toBe("A");
  });
});

describe("duplicateWorkoutDay", () => {
  it("devolve null para índice inexistente", () => {
    expect(duplicateWorkoutDay(build(), 9)).toBeNull();
  });

  it("acrescenta a cópia no fim, com key nova e o mesmo foco", () => {
    const base = build();
    const r = duplicateWorkoutDay(base, 0)!;
    expect(r.newKey).toBe("C");
    expect(r.newIndex).toBe(2);
    expect(r.payload.workouts.map((w) => w.key)).toEqual(["A", "B", "C"]);
    expect(r.payload.workouts[2].focus).toBe("Peito");
    // os treinos originais não mudam de posição (letras exibidas estáveis)
    expect(r.payload.workouts[0]).toBe(base.workouts[0]);
    expect(r.payload.workouts[1]).toBe(base.workouts[1]);
  });

  it("copia exercícios (inclusive mobilidade) com __id novos e conteúdo igual", () => {
    const base = build();
    const r = duplicateWorkoutDay(base, 0)!;
    const copy = r.payload.workouts[2].exercises;
    expect(copy.map((e) => e.name)).toEqual(["Supino", "Crucifixo", "Mobilidade"]);
    expect(copy[2].is_mobility).toBe(true);
    const originalIds = new Set(base.workouts[0].exercises.map((e) => e.__id));
    copy.forEach((e) => {
      expect(e.__id).toBeTruthy();
      expect(originalIds.has(e.__id)).toBe(false);
    });
    expect(new Set(copy.map((e) => e.__id)).size).toBe(3);
  });

  it("não compartilha referências com o original (editar a cópia não altera A)", () => {
    const base = build();
    const r = duplicateWorkoutDay(base, 0)!;
    r.payload.workouts[2].exercises[1].allowed_substitutes!.push("y");
    expect(base.workouts[0].exercises[1].allowed_substitutes).toEqual(["x"]);
  });

  it("não vincula a cópia a nenhum dia da semana", () => {
    const r = duplicateWorkoutDay(build(), 0)!;
    expect(r.payload.weekDays).toEqual({ seg: "A", qua: "B" });
  });

  it("replica overrides de periodização por exerciseId para os exercícios novos", () => {
    const base = build({
      "1": {
        A_0: { exerciseId: "a1", sets: "3", reps: "12" },
        // override legado (sem exerciseId), posicional
        A_1: { sets: "2" },
      },
      "2": { B_0: { exerciseId: "b1", sets: "5" } },
    });
    const r = duplicateWorkoutDay(base, 0)!;
    const p = r.payload;
    const c0 = findExerciseOverride(p, 1, "C", 0);
    const c1 = findExerciseOverride(p, 1, "C", 1);
    expect(c0).toMatchObject({ sets: "3", reps: "12", exerciseId: p.workouts[2].exercises[0].__id });
    expect(c1).toMatchObject({ sets: "2", exerciseId: p.workouts[2].exercises[1].__id });
    // originais intactos e sem vazamento entre exercícios
    expect(findExerciseOverride(p, 1, "A", 0)).toMatchObject({ sets: "3", exerciseId: "a1" });
    expect(findExerciseOverride(p, 2, "B", 0)).toMatchObject({ sets: "5", exerciseId: "b1" });
    expect(findExerciseOverride(p, 2, "C", 0)).toBeUndefined();
  });

  it("mantém a mesma referência de periodização quando não há overrides", () => {
    const base = build();
    const r = duplicateWorkoutDay(base, 1)!;
    expect(r.payload.periodization).toBe(base.periodization);
  });

  it("copia só os aeróbicos vinculados ao treino duplicado", () => {
    const base = build({}, [
      { type: "LISS", duration: "30 min", intensity: "Leve", workoutKey: "A", associationType: "workout", notes: "" },
      { type: "HIIT", duration: "15 min", intensity: "Alta", workoutKey: "B", associationType: "workout", notes: "" },
      { type: "Caminhada", duration: "40 min", intensity: "Leve", workoutKey: "", associationType: "workout", notes: "geral" },
    ]);
    const r = duplicateWorkoutDay(base, 0)!;
    const cardio = r.payload.cardio ?? [];
    expect(cardio).toHaveLength(4);
    expect(cardio[3]).toMatchObject({ type: "LISS", workoutKey: "C", associationType: "workout" });
    expect(cardio.filter((c) => c.workoutKey === "A")).toHaveLength(1);
  });
});
