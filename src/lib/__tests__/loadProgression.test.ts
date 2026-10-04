import { describe, expect, it } from "vitest";
import { buildProgression, compareSets, formatSets, groupSetRowsIntoSessions, pickSetForPrefill, progressSummary, sessionsForWeek, type ProgressionRow } from "../loadProgression";

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

describe("progressão série a série", () => {
  const sets = (...v: [number, number][]) => v.map(([weightKg, reps], i) => ({ setNumber: i + 1, weightKg, reps }));

  it("compara cada série com a MESMA série do treino anterior (carga e depois reps)", () => {
    const cmp = compareSets(sets([40, 8], [40, 8], [40, 6], [40, 6]), sets([40, 8], [40, 7], [42.5, 6], [40, 6]));
    expect(cmp.perSet).toEqual({ 1: "same", 2: "up", 3: "down", 4: "same" });
    expect(cmp).toMatchObject({ improved: 1, regressed: 1, same: 2, compared: 4 });
  });

  it("mais carga evolui mesmo com menos reps; peso corporal compara só reps; série extra é 'new'", () => {
    expect(compareSets(sets([45, 5]), sets([40, 8])).perSet[1]).toBe("up");
    expect(compareSets(sets([0, 12]), sets([0, 10])).perSet[1]).toBe("up");
    const cmp = compareSets(sets([40, 8], [40, 8], [40, 8]), sets([40, 8], [40, 8]));
    expect(cmp.perSet[3]).toBe("new");
    expect(cmp.compared).toBe(2);
  });

  const rows = (id: string, at: string, wk: number, ...v: [number, number][]) =>
    v.map(([w, r], i) => row({ session_id: id, executed_at: at, periodization_week: wk, set_number: i + 1, weight_kg: w, reps: r }));
  const build = (r: ReturnType<typeof row>[]) => buildProgression({ rows: r, dayKeys: ["A"], currentByDay: { A: [{ name: "Supino" }] } }).groups[0].exercises[0].sessions;

  it("mesma maior carga, mais reps nas séries = sobe (o topo sozinho diria 'igual')", () => {
    const [latest] = build([...rows("new", "2026-09-20T10:00:00Z", 0, [40, 10], [40, 9], [40, 8]), ...rows("old", "2026-09-10T10:00:00Z", 0, [40, 8], [40, 8], [40, 6])]);
    expect(latest.deltaKg).toBe(0);
    expect(latest.trend).toBe("up");
    expect(latest).toMatchObject({ setsImproved: 3, setsCompared: 3, setsRegressed: 0 });
    expect(latest.setTrends).toEqual({ 1: "up", 2: "up", 3: "up" });
  });

  it("maior carga igual mas queda nas séries do meio = desce (o topo sozinho diria 'igual')", () => {
    const [latest] = build([...rows("new", "2026-09-20T10:00:00Z", 0, [40, 8], [32, 8], [30, 8]), ...rows("old", "2026-09-10T10:00:00Z", 0, [40, 8], [40, 8], [40, 8])]);
    expect(latest.deltaKg).toBe(0);
    expect(latest.trend).toBe("down");
    expect(latest.setsRegressed).toBe(2);
  });

  it("empate entre séries que sobem e que descem = igual", () => {
    const [latest] = build([...rows("new", "2026-09-20T10:00:00Z", 0, [42, 8], [38, 8]), ...rows("old", "2026-09-10T10:00:00Z", 0, [40, 8], [40, 8])]);
    expect(latest.trend).toBe("same");
  });

  it("fases diferentes no mesmo slot não são comparadas; fase ausente (registro antigo) é", () => {
    const withPhase = (r: ReturnType<typeof row>[], phase: string | null) => r.map(x => ({ ...x, periodization_key: phase }));
    const mixed = build([...withPhase(rows("new", "2026-09-20T10:00:00Z", 1, [40, 8]), "resistencia"), ...withPhase(rows("old", "2026-09-10T10:00:00Z", 1, [30, 8]), "tecnica")]);
    expect(mixed[0].trend).toBeNull();
    const legacy = build([...withPhase(rows("new", "2026-09-20T10:00:00Z", 1, [40, 8]), "tecnica"), ...withPhase(rows("old", "2026-09-10T10:00:00Z", 1, [30, 8]), null)]);
    expect(legacy[0].trend).toBe("up");
  });
});
