import { describe, it, expect } from "vitest";
import { injectPeriodizationBlock } from "../periodizationTemplates";
import { ProtocolPayloadSchema, PeriodizationBlockPayloadSchema, buildBasePayload } from "../protocolSchema";

function payloadWithWorkouts(overrides: Record<string, unknown> = {}) {
  const setup = { split: "AB", mealsCount: 3, carbCycle: false };
  return ProtocolPayloadSchema.parse({
    ...buildBasePayload(setup as any),
    workouts: [
      { key: "A", focus: "Peito/Tríceps", exercises: [
        { id: "e1", name: "Supino reto", sets: "4", reps: "8" },
        { id: "e2", name: "Crucifixo", sets: "3", reps: "12" },
      ] },
      { key: "B", focus: "Costas/Bíceps", exercises: [
        { id: "e3", name: "Remada curvada", sets: "4", reps: "10" },
      ] },
    ],
    periodization: { enabled: false, overrides: {} },
    ...overrides,
  });
}

describe("injectPeriodizationBlock", () => {
  it("aplica overrides cujo slot <dayKey>_<índice> existe no treino atual", () => {
    const tpl = PeriodizationBlockPayloadSchema.parse({
      scope: "periodization",
      periodization: { enabled: true, overrides: { semana2: { "A_0": { sets: "5" }, "A_1": { sets: "4" } } } },
    });
    const { payload: next, applied, skipped } = injectPeriodizationBlock(payloadWithWorkouts(), tpl);
    expect(applied).toBe(2);
    expect(skipped).toBe(0);
    expect(next.periodization?.overrides?.semana2?.["A_0"]).toEqual({ sets: "5" });
    expect(next.periodization?.overrides?.semana2?.["A_1"]).toEqual({ sets: "4" });
  });

  it("descarta (e conta em skipped) overrides cujo dia não existe no treino de destino", () => {
    const tpl = PeriodizationBlockPayloadSchema.parse({
      scope: "periodization",
      periodization: { enabled: true, overrides: { semana1: { "C_0": { sets: "5" } } } },
    });
    const { payload: next, applied, skipped } = injectPeriodizationBlock(payloadWithWorkouts(), tpl);
    expect(applied).toBe(0);
    expect(skipped).toBe(1);
    expect(next.periodization?.overrides?.semana1).toBeUndefined();
  });

  it("descarta (e conta em skipped) overrides cujo índice de exercício está fora do range do dia de destino", () => {
    // Dia "B" no destino só tem 1 exercício (índice 0) — override pro índice 3 não existe mais.
    const tpl = PeriodizationBlockPayloadSchema.parse({
      scope: "periodization",
      periodization: { enabled: true, overrides: { semana1: { "B_3": { sets: "5" }, "B_0": { sets: "3" } } } },
    });
    const { payload: next, applied, skipped } = injectPeriodizationBlock(payloadWithWorkouts(), tpl);
    expect(applied).toBe(1);
    expect(skipped).toBe(1);
    expect(next.periodization?.overrides?.semana1?.["B_0"]).toEqual({ sets: "3" });
    expect(next.periodization?.overrides?.semana1?.["B_3"]).toBeUndefined();
  });

  it("leva o esquema geral de semanas do template", () => {
    const customWeeks = [
      { label: "Adaptação", sets: "3", reps: "12", rest: "60", cadence: "2020" },
      { label: "Volume", sets: "4", reps: "10", rest: "60", cadence: "2020" },
      { label: "Intensidade", sets: "4", reps: "8", rest: "90", cadence: "3010" },
      { label: "Pico", sets: "5", reps: "6", rest: "120", cadence: "3010" },
    ];
    const tpl = PeriodizationBlockPayloadSchema.parse({
      scope: "periodization",
      periodization: { enabled: true, weeks: customWeeks, overrides: {} },
    });
    const { payload: next } = injectPeriodizationBlock(payloadWithWorkouts(), tpl);
    expect(next.periodization?.weeks?.[0]?.label).toBe("Adaptação");
    expect(next.periodization?.enabled).toBe(true);
  });

  it("nunca toca em treino/dieta/macros/suplementos/diretrizes (só periodization)", () => {
    const before = payloadWithWorkouts();
    const tpl = PeriodizationBlockPayloadSchema.parse({
      scope: "periodization",
      periodization: { enabled: true, overrides: { semana1: { "A_0": { sets: "5" } } } },
    });
    const { payload: next } = injectPeriodizationBlock(before, tpl);
    expect((next as any).workouts).toEqual((before as any).workouts);
    expect((next as any).meals).toEqual((before as any).meals);
    expect((next as any).macros).toEqual((before as any).macros);
    expect((next as any).guidelines).toEqual((before as any).guidelines);
    expect((next as any).setup).toEqual((before as any).setup);
  });
});

