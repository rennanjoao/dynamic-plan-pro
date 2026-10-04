import { describe, expect, it } from "vitest";
import { buildProgression, compareBest, describeChange, formatKg, formatSet, formatSets, groupSetRowsIntoSessions, heaviestLoad, pickBestSet, pickSetForPrefill, progressSummary, sessionsForWeek, type ProgressionRow } from "../loadProgression";

const row = (patch: Partial<ProgressionRow>): ProgressionRow => ({ session_id: "s1", exercise_name: "Supino", exercise_key: "supino", swapped_from_name: null, set_number: 1, weight_kg: 40, reps: 8, executed_at: "2026-09-20T10:00:00Z", periodization_week: 0, ...patch });
const sets = (...v: [number, number][]) => v.map(([weightKg, reps], i) => ({ setNumber: i + 1, weightKg, reps }));
const rows = (id: string, at: string, wk: number, ...v: [number, number][]) =>
  v.map(([w, r], i) => row({ session_id: id, executed_at: at, periodization_week: wk, set_number: i + 1, weight_kg: w, reps: r }));
const build = (r: ProgressionRow[]) => buildProgression({ rows: r, dayKeys: ["A"], currentByDay: { A: [{ name: "Supino" }] } }).groups[0].exercises[0].sessions;

describe("loadProgression", () => {
  it("agrupa séries ordenadas e limita sessões", () => {
    const grouped = groupSetRowsIntoSessions([row({ session_id: "s2", set_number: 2 }), row({ session_id: "s2", set_number: 1 }), row({ session_id: "s1" })], 1);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sets.map(s => s.setNumber)).toEqual([1, 2]);
  });

  it("escolhe a mesma série, a anterior conhecida e vazio", () => {
    const last = [{ setNumber: 1, weightKg: 30, reps: 8 }, { setNumber: 3, weightKg: 40, reps: 6 }];
    expect(pickSetForPrefill(last, 3)?.weightKg).toBe(40);
    expect(pickSetForPrefill(last, 2)?.weightKg).toBe(30);
    expect(pickSetForPrefill(last, 4)?.weightKg).toBe(40);
    expect(pickSetForPrefill([], 1)).toBeNull();
  });

  it("mantém histórico global, removidos e comparação apenas na mesma semana", () => {
    const data = [
      row({ session_id: "new", weight_kg: 45, executed_at: "2026-09-20T10:00:00Z", periodization_week: 0 }),
      row({ session_id: "other-week", weight_kg: 60, executed_at: "2026-09-15T10:00:00Z", periodization_week: 1 }),
      row({ session_id: "old", weight_kg: 40, executed_at: "2026-09-10T10:00:00Z", periodization_week: 0 }),
      row({ session_id: "removed", exercise_name: "Rosca", exercise_key: "rosca", weight_kg: 20 }),
      row({ session_id: "swap", exercise_name: "Crucifixo", swapped_from_name: "Supino", weight_kg: 99, executed_at: "2026-09-25T10:00:00Z" }),
      row({ session_id: "empty", exercise_name: "Remada", exercise_key: "remada", weight_kg: 0, reps: 0 }),
    ];
    const result = buildProgression({ rows: data, dayKeys: ["A", "B"], currentByDay: { A: [{ name: "Remada" }], B: [{ name: "Supino" }, { name: "Supino" }] } });
    expect(result.groups[1].exercises).toHaveLength(1);
    const sessions = result.groups[1].exercises[0].sessions;
    expect(sessions.find(s => s.sessionId === "new")?.change).toMatchObject({ kind: "up", basis: "kg", deltaKg: 5 });
    expect(sessions.find(s => s.sessionId === "new")?.comparedWith?.executedAt).toBe("2026-09-10T10:00:00Z");
    expect(sessions.find(s => s.sessionId === "other-week")?.change).toBeNull();
    expect(sessions.find(s => s.sessionId === "swap")?.change).toBeNull();
    expect(result.removed.map(ex => ex.name)).toEqual(["Rosca"]);
  });

  it("filtra semana, resume sem trocas e formata séries", () => {
    const sessions = build([row({ session_id: "n", weight_kg: 45 }), row({ session_id: "o", weight_kg: 40, executed_at: "2026-09-10T10:00:00Z" })]);
    expect(sessionsForWeek(sessions, 1)).toEqual([]);
    expect(progressSummary(sessions)).toEqual({ fromKg: 40, toKg: 45, deltaKg: 5 });
    expect(formatSets([{ setNumber: 1, weightKg: 40, reps: 8 }, { setNumber: 2, weightKg: 0, reps: 12 }])).toBe("40 kg × 8 · 12 reps");
  });
});

describe("série mais pesada", () => {
  it("escolhe a maior carga; com carga igual, a de mais reps", () => {
    expect(pickBestSet(sets([4, 4], [7, 4], [9, 4], [11, 4], [11, 5]))).toMatchObject({ weightKg: 11, reps: 5 });
    expect(pickBestSet([])).toBeNull();
  });

  it("ignora tentativa com 0 reps, a menos que seja a única", () => {
    expect(pickBestSet(sets([20, 0], [15, 8]))).toMatchObject({ weightKg: 15, reps: 8 });
    expect(pickBestSet(sets([20, 0]))).toMatchObject({ weightKg: 20, reps: 0 });
  });
});

describe("comparação (uma regra só: série mais pesada)", () => {
  it("mais carga evolui, mesmo com menos reps", () => {
    expect(compareBest({ setNumber: 1, weightKg: 45, reps: 5 }, { setNumber: 1, weightKg: 40, reps: 8 })).toMatchObject({ kind: "up", basis: "kg", deltaKg: 5, deltaReps: -3 });
  });

  it("menos carga cai", () => {
    expect(compareBest({ setNumber: 1, weightKg: 35, reps: 10 }, { setNumber: 1, weightKg: 40, reps: 8 })).toMatchObject({ kind: "down", basis: "kg", deltaKg: -5 });
  });

  it("mesma carga: mais reps evolui, menos reps cai, igual mantém (e peso corporal compara reps)", () => {
    expect(compareBest({ setNumber: 1, weightKg: 40, reps: 10 }, { setNumber: 1, weightKg: 40, reps: 8 })).toMatchObject({ kind: "up", basis: "reps", deltaKg: 0, deltaReps: 2 });
    expect(compareBest({ setNumber: 1, weightKg: 40, reps: 6 }, { setNumber: 1, weightKg: 40, reps: 8 })).toMatchObject({ kind: "down", basis: "reps" });
    expect(compareBest({ setNumber: 1, weightKg: 40, reps: 8 }, { setNumber: 1, weightKg: 40, reps: 8 })).toMatchObject({ kind: "same", basis: "none" });
    expect(compareBest({ setNumber: 1, weightKg: 0, reps: 12 }, { setNumber: 1, weightKg: 0, reps: 10 })).toMatchObject({ kind: "up", basis: "reps" });
  });

  it("ruído de ponto flutuante não vira diferença", () => {
    expect(compareBest({ setNumber: 1, weightKg: 0.1 + 0.2, reps: 8 }, { setNumber: 1, weightKg: 0.3, reps: 8 }).kind).toBe("same");
  });

  it("caso do print: aquecimento e séries extras não geram 'caiu' — o selo e os kg concordam", () => {
    const day = "2026-10-02T";
    const [latest, middle, oldest] = build([
      ...rows("s1", `${day}12:00:00Z`, 0, [4, 4], [7, 4], [9, 4], [11, 4], [11, 4]),
      ...rows("s2", `${day}11:00:00Z`, 0, [5, 2], [9, 4]),
      ...rows("s3", `${day}10:00:00Z`, 0, [6, 3], [6, 4], [7, 4], [3, 3]),
    ]);
    expect(latest.change).toMatchObject({ kind: "up", deltaKg: 2 });
    expect(middle.change).toMatchObject({ kind: "up", deltaKg: 2 });
    expect(oldest.change).toBeNull();
    expect(describeChange(latest.change!).badge).toBe("Evoluiu +2 kg");
    expect(progressSummary([latest, middle, oldest])).toEqual({ fromKg: 7, toKg: 11, deltaKg: 4 });
  });

  it("série fraca no meio não muda o resultado (só a mais pesada conta)", () => {
    const [latest] = build([...rows("new", "2026-09-20T10:00:00Z", 0, [40, 8], [32, 8], [30, 8]), ...rows("old", "2026-09-10T10:00:00Z", 0, [40, 8], [40, 8], [40, 8])]);
    expect(latest.change?.kind).toBe("same");
  });

  it("fases diferentes no mesmo slot não são comparadas; fase ausente (registro antigo) é", () => {
    const withPhase = (r: ProgressionRow[], phase: string | null) => r.map(x => ({ ...x, periodization_key: phase }));
    const mixed = build([...withPhase(rows("new", "2026-09-20T10:00:00Z", 1, [40, 8]), "resistencia"), ...withPhase(rows("old", "2026-09-10T10:00:00Z", 1, [30, 8]), "tecnica")]);
    expect(mixed[0].change).toBeNull();
    const legacy = build([...withPhase(rows("new", "2026-09-20T10:00:00Z", 1, [40, 8]), "tecnica"), ...withPhase(rows("old", "2026-09-10T10:00:00Z", 1, [30, 8]), null)]);
    expect(legacy[0].change?.kind).toBe("up");
  });

  it("sem periodização (semana nula) compara com o treino anterior", () => {
    const noWeek = (r: ProgressionRow[]) => r.map(x => ({ ...x, periodization_week: null }));
    const [latest] = build([...noWeek(rows("new", "2026-09-20T10:00:00Z", 0, [42, 8])), ...noWeek(rows("old", "2026-09-10T10:00:00Z", 0, [40, 8]))]);
    expect(latest.change).toMatchObject({ kind: "up", deltaKg: 2 });
  });
});

describe("maior carga já registrada", () => {
  it("pega a maior carga ignorando exercício trocado; em empate, a mais recente", () => {
    const sessions = build([
      ...rows("a", "2026-09-20T10:00:00Z", 0, [40, 8]),
      ...rows("b", "2026-09-10T10:00:00Z", 1, [40, 8]),
      row({ session_id: "swap", exercise_name: "Crucifixo", swapped_from_name: "Supino", weight_kg: 99, executed_at: "2026-09-25T10:00:00Z" }),
    ]);
    expect(heaviestLoad(sessions)).toEqual({ weightKg: 40, executedAt: "2026-09-20T10:00:00Z" });
    expect(heaviestLoad([])).toBeNull();
  });
});

describe("textos em linguagem simples", () => {
  const change = (cur: [number, number], prev: [number, number]) => compareBest({ setNumber: 1, weightKg: cur[0], reps: cur[1] }, { setNumber: 1, weightKg: prev[0], reps: prev[1] });

  it("formata kg em português e a série como carga × repetições", () => {
    expect(formatKg(2.5)).toBe("2,5 kg");
    expect(formatKg(11)).toBe("11 kg");
    expect(formatSet({ setNumber: 1, weightKg: 11, reps: 4 })).toBe("11 kg × 4");
    expect(formatSet({ setNumber: 1, weightKg: 0, reps: 1 })).toBe("1 rep");
  });

  it("carga maior: selo e frase dizem a mesma coisa", () => {
    expect(describeChange(change([11, 4], [9, 4]))).toEqual({ tone: "up", badge: "Evoluiu +2 kg", sentence: "Você aumentou a carga: 9 kg → 11 kg (+2 kg)." });
  });

  it("carga menor", () => {
    expect(describeChange(change([7, 4], [9, 4]))).toEqual({ tone: "down", badge: "Carga menor −2 kg", sentence: "Você usou menos carga: 9 kg → 7 kg (−2 kg)." });
  });

  it("mesma carga com mais ou menos repetições", () => {
    expect(describeChange(change([40, 10], [40, 8]))).toEqual({ tone: "up", badge: "Evoluiu +2 reps", sentence: "Mesma carga (40 kg), mais repetições: 8 → 10 (+2)." });
    expect(describeChange(change([40, 7], [40, 8]))).toEqual({ tone: "down", badge: "Menos reps −1", sentence: "Mesma carga (40 kg), menos repetições: 8 → 7 (−1)." });
  });

  it("igual e peso corporal", () => {
    expect(describeChange(change([40, 8], [40, 8]))).toEqual({ tone: "same", badge: "Manteve", sentence: "Igual à última vez: 40 kg × 8." });
    expect(describeChange(change([0, 12], [0, 10])).sentence).toBe("Mais repetições: 10 → 12 (+2).");
    expect(describeChange(change([0, 8], [0, 10])).sentence).toBe("Menos repetições: 10 → 8 (−2).");
  });
});
