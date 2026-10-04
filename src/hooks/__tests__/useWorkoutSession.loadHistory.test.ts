import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkoutSession } from "../useWorkoutSession";

const queries: { filters: [string, unknown][]; neqs: [string, unknown][] }[] = [];
const from = vi.fn(() => {
  const state = { filters: [] as [string, unknown][], neqs: [] as [string, unknown][] };
  queries.push(state);
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { state.filters.push([key, value]); return builder; },
    neq: (key: string, value: unknown) => { state.neqs.push([key, value]); return builder; },
    order: () => builder,
    limit: async () => ({ data: [{ session_id: "old", set_number: 1, weight_kg: 30, reps: 8, perceived_effort: 2, executed_at: "2026-01-01", periodization_week: 1 }], error: null }),
  };
  return builder;
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...args: unknown[]) => from(...args) } }));

describe("getExerciseLoadHistory", () => {
  beforeEach(() => { queries.length = 0; from.mockClear(); });

  it("consulta cada exercício com usuário, semana e sessão explícitos", async () => {
    const { result } = renderHook(() => useWorkoutSession());
    const history = await result.current.getExerciseLoadHistory({ userId: "u1", exerciseNames: ["Supino", "Remada"], weekSlot: 1, excludeSessionId: "current", sessionsPerExercise: 1 });
    expect(from).toHaveBeenCalledTimes(2);
    expect(queries[0].filters).toEqual(expect.arrayContaining([["user_id", "u1"], ["exercise_key", "supino"], ["completed", true], ["skipped", false], ["periodization_week", 1]]));
    expect(queries[0].neqs).toContainEqual(["session_id", "current"]);
    expect(history.Supino).toHaveLength(1);
  });

  it("não filtra semana nem id local e não consulta sem usuário", async () => {
    const { result } = renderHook(() => useWorkoutSession());
    await result.current.getExerciseLoadHistory({ userId: "u1", exerciseNames: ["Supino"], weekSlot: null, excludeSessionId: "local_1" });
    expect(queries[0].filters.some(([key]) => key === "periodization_week")).toBe(false);
    expect(queries[0].neqs).toEqual([]);
    await result.current.getExerciseLoadHistory({ userId: "", exerciseNames: ["Supino"] });
    expect(from).toHaveBeenCalledTimes(1);
  });
});