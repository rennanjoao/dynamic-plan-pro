import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWorkoutSession } from "../useWorkoutSession";

const calls: Array<[string, string, unknown]> = [];
const rows = [
  { exercise_key: "supino", weight_kg: 30, reps: 8, executed_at: "2026-10-02", perceived_effort: 1 },
  { exercise_key: "remada", weight_kg: 20, reps: 10, executed_at: "2026-10-01", perceived_effort: 2 },
  { exercise_key: "supino", weight_kg: 25, reps: 8, executed_at: "2026-09-30", perceived_effort: 1 },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => {
    const chain = {
      select: () => chain,
      insert: () => chain,
      eq: (column: string, value: unknown) => { calls.push([table, column, value]); return chain; },
      is: (column: string, value: unknown) => { calls.push([table, `is:${column}`, value]); return chain; },
      in: () => chain,
      order: () => Object.assign(chain, { then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }) }),
      limit: (n: number) => { calls.push([table, "limit", n]); return Promise.resolve({ data: rows, error: null }); },
      single: () => Promise.resolve({ data: { id: "session-1" }, error: null }),
    };
    return chain;
  } },
}));

describe("histórico de cargas por fase", () => {
  beforeEach(() => { calls.length = 0; localStorage.clear(); });

  async function ready() {
    const hook = renderHook(() => useWorkoutSession());
    await act(async () => { await hook.result.current.startSession({ userId: "student-1", workoutKey: "A" }); });
    calls.length = 0;
    return hook;
  }

  it.each(["peso", "deload"])("filtra singular e batch pela fase %s no banco", async (phase) => {
    const hook = await ready();
    await act(async () => { await hook.result.current.getExerciseHistory("Supino", phase, 2); });
    expect(calls).toContainEqual(["workout_sets", "periodization_key", phase]);
    expect(calls).toContainEqual(["workout_sets", "limit", 2]);
    calls.length = 0;
    await act(async () => { await hook.result.current.getExerciseHistoryBatch(["Supino", "Remada"], phase, 1); });
    expect(calls).toContainEqual(["workout_sets", "periodization_key", phase]);
    hook.unmount();
  });

  it("sem fase não filtra e mantém o limite por exercício", async () => {
    const hook = await ready();
    await act(async () => { await hook.result.current.getExerciseHistory("Supino", null); });
    expect(calls.some(([, column]) => column.includes("periodization_key"))).toBe(false);
    calls.length = 0;
    let history: Awaited<ReturnType<typeof hook.result.current.getExerciseHistoryBatch>> = {};
    await act(async () => { history = await hook.result.current.getExerciseHistoryBatch(["Supino", "Remada"], null, 1); });
    expect(calls.some(([, column]) => column.includes("periodization_key"))).toBe(false);
    expect(history.Supino).toHaveLength(1);
    expect(history.Remada).toHaveLength(1);
    hook.unmount();
  });
});