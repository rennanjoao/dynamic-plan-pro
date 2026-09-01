import { describe, it, expect } from "vitest";
import { injectWorkoutBlock } from "../workoutTemplates";
import { ProtocolPayloadSchema, WorkoutBlockPayloadSchema, buildBasePayload } from "../protocolSchema";

function basePayload(overrides: Record<string, unknown> = {}) {
  const setup = { split: "AB", mealsCount: 3, carbCycle: false };
  return ProtocolPayloadSchema.parse({
    ...buildBasePayload(setup as any),
    workouts: [
      { key: "A", focus: "Peito/Tríceps", exercises: [{ id: "e1", name: "Supino reto", sets: "4", reps: "8" }] },
      { key: "B", focus: "Costas/Bíceps", exercises: [{ id: "e2", name: "Remada curvada", sets: "4", reps: "10" }] },
    ],
    periodization: {
      enabled: true,
      overrides: {
        semana2: { "A_0": { sets: "5" }, "B_0": { sets: "3" } },
      },
    },
    ...overrides,
  });
}

const tplWithTwoDays = WorkoutBlockPayloadSchema.parse({
  scope: "workouts",
  workouts: [
    { key: "A", focus: "Peito", exercises: [{ id: "n1", name: "Supino inclinado", sets: "3", reps: "10" }] },
    { key: "B", focus: "Costas", exercises: [{ id: "n2", name: "Puxada frontal", sets: "3", reps: "10" }] },
  ],
});

const tplWithOnlyDayA = WorkoutBlockPayloadSchema.parse({
  scope: "workouts",
  workouts: [
    { key: "A", focus: "Peito", exercises: [{ id: "n1", name: "Supino inclinado", sets: "3", reps: "10" }] },
  ],
});

describe("injectWorkoutBlock", () => {
  it("substitui os dias de treino pelos do template", () => {
    const next = injectWorkoutBlock(basePayload(), tplWithTwoDays, "filled");
    expect(next.workouts.map((d) => d.exercises[0].name)).toEqual(["Supino inclinado", "Puxada frontal"]);
  });

  it("nunca toca em dieta/macros/suplementos/diretrizes (só workouts e periodization)", () => {
    const before = basePayload();
    const next = injectWorkoutBlock(before, tplWithTwoDays, "filled");
    expect((next as any).diet).toEqual((before as any).diet);
    expect((next as any).meals).toEqual((before as any).meals);
    expect((next as any).guidelines).toEqual((before as any).guidelines);
    expect((next as any).setup).toEqual((before as any).setup);
  });

  it("limpa overrides de periodização dos dias substituídos", () => {
    const next = injectWorkoutBlock(basePayload(), tplWithTwoDays, "filled");
    expect(next.periodization?.overrides?.semana2?.["A_0"]).toBeUndefined();
    expect(next.periodization?.overrides?.semana2?.["B_0"]).toBeUndefined();
  });

  it("dia não substituído mantém seus overrides intactos", () => {
    const next = injectWorkoutBlock(basePayload(), tplWithOnlyDayA, "filled");
    expect(next.periodization?.overrides?.semana2?.["B_0"]).toEqual({ sets: "3" });
    expect(next.periodization?.overrides?.semana2?.["A_0"]).toBeUndefined();
  });

  it("template com periodização própria substitui a periodização por inteiro", () => {
    const tplComPeriodizacao = WorkoutBlockPayloadSchema.parse({
      scope: "workouts",
      workouts: tplWithTwoDays.workouts,
      periodization: { enabled: true, overrides: { semana1: { "A_0": { notes: "leve" } } } },
    });
    const next = injectWorkoutBlock(basePayload(), tplComPeriodizacao, "filled");
    expect(next.periodization?.overrides).toEqual({ semana1: { "A_0": { notes: "leve" } } });
  });

  it('modo "empty" aplica só a estrutura, sem exercícios', () => {
    const next = injectWorkoutBlock(basePayload(), tplWithTwoDays, "empty");
    expect(next.workouts.every((d) => d.exercises.length === 0)).toBe(true);
    expect(next.workouts.map((d) => d.focus)).toEqual(["Peito", "Costas"]);
  });

  it("template sem dias não altera o payload", () => {
    const empty = WorkoutBlockPayloadSchema.parse({ scope: "workouts", workouts: [] });
    const before = basePayload();
    const next = injectWorkoutBlock(before, empty, "filled");
    expect(next).toEqual(before);
  });

  it("dayKey com underscore não vaza para o dia errado", () => {
    const withUnderscoreKey = ProtocolPayloadSchema.parse({
      ...buildBasePayload({ split: "AB", mealsCount: 3, carbCycle: false } as any),
      workouts: [
        { key: "Perna_A", focus: "Quadríceps", exercises: [{ id: "e1", name: "Agachamento", sets: "4", reps: "8" }] },
        { key: "Perna_A2", focus: "Posterior", exercises: [{ id: "e2", name: "Stiff", sets: "4", reps: "10" }] },
      ],
      periodization: {
        enabled: true,
        overrides: {
          semana2: { "Perna_A_0": { sets: "5" }, "Perna_A2_0": { sets: "3" } },
        },
      },
    });
    const tpl = WorkoutBlockPayloadSchema.parse({
      scope: "workouts",
      workouts: [{ key: "Perna_A", focus: "Quadríceps", exercises: [{ id: "n1", name: "Leg press", sets: "3", reps: "12" }] }],
    });
    const next = injectWorkoutBlock(withUnderscoreKey, tpl, "filled");
    expect(next.periodization?.overrides?.semana2?.["Perna_A_0"]).toBeUndefined();
    expect(next.periodization?.overrides?.semana2?.["Perna_A2_0"]).toEqual({ sets: "3" });
  });
});
