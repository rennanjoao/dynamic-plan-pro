import { describe, expect, it } from "vitest";
import { buildProgression, formatSets, groupSetRowsIntoSessions, pickSetForPrefill, progressSummary, sessionsForWeek, type ProgressionRow } from "../loadProgression";

const row = (patch: Partial<ProgressionRow>): ProgressionRow => ({ session_id: "s1", exercise_name: "Supino", exercise_key: "supino", swapped_from_name: null, set_number: 1, weight_kg: 40, reps: 8, executed_at: "2026-09-20T10:00:00Z", periodization_week: 0, ...patch });

describe("loadProgression", () => {
  it("agrupa séries ordenadas e limita sessões", () => {
    const grouped = groupSetRowsIntoSessions([row({ session_id: "s2", set_number: 2 }), row({ session_id: "s2", set_number: 1 }), row({ session_id: "s1" })], 1);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sets.map(s => s.setNumber)).toEqual([1, 2]);
  });

  it("escolhe a mesma série, a anterior conhecida e vazio", () => {
    const sets = [{ setNumber: 1, weightKg: 30, reps: 8 }, { setNumber: 3, weightKg: 40, reps: 6 }];
    expect(pickSetForPrefill(sets, 3)?.weightKg).toBe(40);
    expect(pickSetForPrefill(sets, 2)?.weightKg).toBe(30);
    expect(pickSetForPrefill(sets, 4)?.weightKg).toBe(40);
    expect(pickSetForPrefill([], 1)).toBeNull();
  });

  it("mantém histórico global, removidos e tendência apenas na mesma semana", () => {
    const rows = [
      row({ session_id: "new", weight_kg: 45, executed_at: "2026-09-20T10:00:00Z", periodization_week: 0 }),
      row({ session_id: "other-week", weight_kg: 60, executed_at: "2026-09-15T10:00:00Z", periodization_week: 1 }),
      row({ session_id: "old", weight_kg: 40, executed_at: "2026-09-10T10:00:00Z", periodization_week: 0 }),
      row({ session_id: "removed", exercise_name: "Rosca", exercise_key: "rosca", weight_kg: 20 }),
      row({ session_id: "swap", exercise_name: "Crucifixo", swapped_from_name: "Supino", weight_kg: 99, executed_at: "2026-09-25T10:00:00Z" }),
      row({ session_id: "empty", exercise_name: "Remada", exercise_key: "remada", weight_kg: 0, reps: 0 }),
    ];
    const result = buildProgression({ rows, dayKeys: ["A", "B"], currentByDay: { A: [{ name: "Remada" }], B: [{ name: "Supino" }, { name: "Supino" }] } });
    expect(result.groups[1].exercises).toHaveLength(1);
    expect(result.groups[1].exercises[0].sessions.find(s => s.sessionId === "new")?.deltaKg).toBe(5);
    expect(result.groups[1].exercises[0].sessions.find(s => s.sessionId === "swap")?.trend).toBeNull();
    expect(result.removed.map(ex => ex.name)).toEqual(["Rosca"]);
  });

  it("filtra semana, resume sem trocas e formata séries", () => {
    const sessions = buildProgression({ rows: [row({ session_id: "n", weight_kg: 45 }), row({ session_id: "o", weight_kg: 40, executed_at: "2026-09-10T10:00:00Z" })], dayKeys: ["A"], currentByDay: { A: [{ name: "Supino" }] } }).groups[0].exercises[0].sessions;
    expect(sessionsForWeek(sessions, 1)).toEqual([]);
    expect(progressSummary(sessions)).toEqual({ fromKg: 40, toKg: 45, deltaKg: 5 });
    expect(formatSets([{ setNumber: 1, weightKg: 40, reps: 8 }, { setNumber: 2, weightKg: 0, reps: 12 }])).toBe("40kg×8 · 12 reps");
  });
});