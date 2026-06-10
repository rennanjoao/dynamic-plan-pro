import { describe, it, expect } from "vitest";
import { validatePeriodization, resolveExerciseForWeek } from "../periodizationValidation";
import { ProtocolPayloadSchema, PeriodizationSchema } from "../protocolSchema";

function basePayload(overrides: Partial<any> = {}) {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 4, carbCycle: false },
    workouts: [
      { key: "A", focus: "Peito", exercises: [
        { name: "Supino", sets: "4", reps: "8-10", rest: "90s", cadence: "2-0-1", notes: "" },
      ] },
    ],
    periodization: { enabled: true, ...overrides },
  });
}

describe("validatePeriodization", () => {
  it("aceita defaults da periodização", () => {
    const r = validatePeriodization(basePayload());
    expect(r.ok).toBe(true);
  });

  it("detecta séries fora da faixa", () => {
    const p = basePayload({
      weeks: PeriodizationSchema.parse({}).weeks.map((w, i) =>
        i === 0 ? { ...w, sets: "99" } : w
      ),
    });
    const r = validatePeriodization(p);
    expect(r.ok).toBe(false);
    expect(r.weekErrors.some((e) => e.field === "sets")).toBe(true);
  });

  it("detecta faixa de reps invertida", () => {
    const p = basePayload({
      weeks: PeriodizationSchema.parse({}).weeks.map((w, i) =>
        i === 1 ? { ...w, reps: "12 a 5" } : w
      ),
    });
    const r = validatePeriodization(p);
    expect(r.ok).toBe(false);
    expect(r.weekErrors.find((e) => e.weekIndex === 1)?.field).toBe("reps");
  });

  it("descanso em minutos é aceito (1-2 min)", () => {
    const p = basePayload({
      weeks: PeriodizationSchema.parse({}).weeks.map((w, i) =>
        i === 0 ? { ...w, rest: "1-2 min" } : w
      ),
    });
    expect(validatePeriodization(p).ok).toBe(true);
  });

  it("override inválido é capturado", () => {
    const p = basePayload({
      overrides: { "0": { "A_0": { sets: "abc" } } },
    });
    const r = validatePeriodization(p);
    expect(r.ok).toBe(false);
    expect(r.overrideErrors[0]?.field).toBe("sets");
  });

  it("desabilitada não valida", () => {
    const p = basePayload({ enabled: false, weeks: PeriodizationSchema.parse({}).weeks.map(w => ({ ...w, sets: "999" })) });
    expect(validatePeriodization(p).ok).toBe(true);
  });
});

describe("resolveExerciseForWeek", () => {
  it("aplica override por cima do exercício base", () => {
    const p = basePayload({
      overrides: { "2": { "A_0": { name: "Hack", reps: "10-12" } } },
    });
    const r = resolveExerciseForWeek(p, 2, "A", 0)!;
    expect(r.name).toBe("Hack");
    expect(r.reps).toBe("10-12");
    expect(r.overridden).toBe(true);
  });

  it("usa meta da semana como fallback quando base não tem campo", () => {
    const p = ProtocolPayloadSchema.parse({
      setup: { split: "ABC", mealsCount: 4, carbCycle: false },
      workouts: [{ key: "A", focus: "", exercises: [{ name: "Agachamento", sets: "", reps: "", rest: "", cadence: "", notes: "" }] }],
      periodization: { enabled: true },
    });
    const r = resolveExerciseForWeek(p, 0, "A", 0)!;
    expect(r.sets).toBe(p.periodization.weeks[0].sets);
    expect(r.overridden).toBe(false);
  });
});

describe("JSON roundtrip da periodização", () => {
  it("valida payload completo após serialização", () => {
    const p = basePayload({
      weeks: PeriodizationSchema.parse({}).weeks.map((w, i) => ({ ...w, label: `Semana ${i + 1} custom` })),
      overrides: { "0": { "A_0": { name: "Supino inclinado", reps: "6-8" } } },
    });
    const json = JSON.parse(JSON.stringify(p));
    const re = ProtocolPayloadSchema.safeParse(json);
    expect(re.success).toBe(true);
    if (re.success) {
      expect(re.data.periodization.weeks[0].label).toBe("Semana 1 custom");
      expect(re.data.periodization.overrides["0"]["A_0"].name).toBe("Supino inclinado");
    }
  });
});