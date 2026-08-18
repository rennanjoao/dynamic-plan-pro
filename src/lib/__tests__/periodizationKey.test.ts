import { describe, it, expect } from "vitest";
import {
  buildPeriodizationKey,
  selectHistoryForPeriodization,
  workoutDraftStorageKey,
  workoutStateStorageKey,
} from "../periodizationKey";

type Row = { exercise: string; weight: number; periodization_key: string | null };

const HISTORY: Row[] = [
  { exercise: "supino", weight: 100, periodization_key: "peso" },
  { exercise: "supino", weight: 70,  periodization_key: "tecnica" },
  { exercise: "supino", weight: 40,  periodization_key: "deload" },
  { exercise: "supino", weight: 88,  periodization_key: null },
  { exercise: "remada", weight: 60,  periodization_key: "tecnica" },
];

describe("buildPeriodizationKey", () => {
  it("classifica força, técnica e resistência pela faixa de reps", () => {
    expect(buildPeriodizationKey({ enabled: true, reps: "5 a 8 reps" })).toBe("peso");
    expect(buildPeriodizationKey({ enabled: true, reps: "10 a 12 reps" })).toBe("tecnica");
    expect(buildPeriodizationKey({ enabled: true, reps: "15 a 20 reps" })).toBe("resistencia");
  });

  it("reconhece deload por flag ou pelo rótulo da semana", () => {
    expect(buildPeriodizationKey({ enabled: true, reps: "10 a 12 reps", isDeload: true })).toBe("deload");
    expect(buildPeriodizationKey({ enabled: true, reps: "10 a 12 reps", label: "Semana 4 — Deload" })).toBe("deload");
  });

  it("devolve null (legado) quando a periodização está desligada", () => {
    expect(buildPeriodizationKey({ enabled: false, reps: "5 a 8 reps" })).toBeNull();
  });
});

describe("selectHistoryForPeriodization", () => {
  it("1) não mistura o histórico do mesmo exercício entre periodizações", () => {
    expect(selectHistoryForPeriodization(HISTORY, "peso").map((r) => r.weight)).toEqual([100]);
    expect(selectHistoryForPeriodization(HISTORY, "tecnica").map((r) => r.weight)).toEqual([70, 60]);
    expect(selectHistoryForPeriodization(HISTORY, "deload").map((r) => r.weight)).toEqual([40]);
  });

  it("2) a carga correta é isolada por exercício dentro da periodização", () => {
    const tecnica = selectHistoryForPeriodization(HISTORY, "tecnica");
    expect(tecnica.find((r) => r.exercise === "remada")?.weight).toBe(60);
    expect(tecnica.find((r) => r.exercise === "supino")?.weight).toBe(70);
  });

  it("3) fica vazio na primeira sessão daquela periodização", () => {
    expect(selectHistoryForPeriodization(HISTORY, "resistencia")).toEqual([]);
  });

  it("5) sessões antigas sem periodização não contaminam periodizações identificadas", () => {
    const peso = selectHistoryForPeriodization(HISTORY, "peso");
    expect(peso.some((r) => r.periodization_key === null)).toBe(false);
    // e o balde legado só devolve o próprio histórico legado
    expect(selectHistoryForPeriodization(HISTORY, null).map((r) => r.weight)).toEqual([88]);
  });
});

describe("chaves de localStorage (fluxo offline)", () => {
  it("4) usa a mesma separação por usuário, treino e periodização", () => {
    expect(workoutStateStorageKey("u1", "A", "peso")).toBe("workout_session_u1_A_peso");
    expect(workoutStateStorageKey("u1", "A", "deload")).toBe("workout_session_u1_A_deload");
    expect(workoutStateStorageKey("u1", "A", "peso")).not.toBe(workoutStateStorageKey("u1", "A", "tecnica"));
    expect(workoutDraftStorageKey("u1", "A", null)).toBe("workout_session_draft_u1_A_legacy");
    expect(workoutDraftStorageKey("u2", "A", "peso")).not.toBe(workoutDraftStorageKey("u1", "A", "peso"));
  });
});
