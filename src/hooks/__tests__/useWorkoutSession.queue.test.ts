/**
 * Gravação das séries — regressão da auditoria.
 * Usa um banco falso em memória (sessões + séries) com chave de rede ligada/desligada,
 * para provar o resultado FINAL no banco, não só as chamadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => {
  type Filter = { t: string; c: string; v: unknown };
  const state = {
    online: true,
    sessions: [] as any[],
    sets: [] as any[],
    nextId: 1,
    calls: [] as any[][],
    failOnce: null as string | null, // operação ("delete", "upsert"...) que falha UMA vez
  };
  const reset = () => { state.failOnce = null; state.online = true; state.sessions = []; state.sets = []; state.nextId = 1; state.calls = []; };

  const matches = (row: any, filters: Filter[]) => filters.every((f) => {
    if (f.t === "eq") return row[f.c] === f.v;
    if (f.t === "neq") return row[f.c] !== f.v;
    if (f.t === "gt") return row[f.c] > (f.v as number);
    if (f.t === "is") return f.v === null ? row[f.c] == null : row[f.c] === f.v;
    return true; // in / or / not: não restringem neste banco falso
  });

  const run = (q: any) => {
    if (!state.online) return { data: null, error: { message: "offline" } };
    if (state.failOnce && q.op === state.failOnce) { state.failOnce = null; return { data: null, error: { message: "falha pontual" } }; }
    const rows = q.table === "workout_sessions" ? state.sessions : q.table === "workout_sets" ? state.sets : [];
    if (q.table !== "workout_sessions" && q.table !== "workout_sets") return { data: null, error: null };

    if (q.op === "insert") {
      const row = { id: `S${state.nextId++}`, ...q.payload };
      state.sessions.push(row);
      return { data: q.single ? { id: row.id } : [{ id: row.id }], error: null };
    }
    if (q.op === "update") {
      rows.filter((r) => matches(r, q.filters)).forEach((r) => Object.assign(r, q.payload));
      return { data: null, error: null };
    }
    if (q.op === "upsert") {
      const p = q.payload;
      const existing = state.sets.find((r) => r.session_id === p.session_id && r.exercise_key === p.exercise_key && r.set_number === p.set_number);
      if (existing) Object.assign(existing, p); else state.sets.push({ ...p });
      return { data: null, error: null };
    }
    if (q.op === "delete") {
      const doomed = new Set(rows.filter((r) => matches(r, q.filters)));
      const keep = rows.filter((r) => !doomed.has(r));
      if (q.table === "workout_sets") state.sets = keep; else state.sessions = keep;
      return { data: null, error: null };
    }
    let out = rows.filter((r) => matches(r, q.filters)).map((r) => ({ ...r }));
    if (q.order) out.sort((a, b) => (q.order.asc ? 1 : -1) * ((a[q.order.col] > b[q.order.col]) ? 1 : (a[q.order.col] < b[q.order.col]) ? -1 : 0));
    if (q.limit != null) out = out.slice(0, q.limit);
    return { data: q.single ? (out[0] ?? null) : out, error: null };
  };

  const builder = (table: string) => {
    const q: any = { table, op: "select", payload: null, filters: [] as Filter[], single: false, order: null, limit: null };
    const b: any = {};
    const add = (t: string) => (c: string, v?: unknown) => { q.filters.push({ t, c, v }); return b; };
    b.select = () => b;
    b.eq = add("eq"); b.neq = add("neq"); b.gt = add("gt"); b.is = add("is"); b.in = add("in"); b.not = add("not");
    b.or = (expr: string) => { state.calls.push(["or", expr]); return b; };
    b.insert = (p: any) => { q.op = "insert"; q.payload = p; return b; };
    b.upsert = (p: any) => { q.op = "upsert"; q.payload = p; return b; };
    b.update = (p: any) => { q.op = "update"; q.payload = p; return b; };
    b.delete = () => { q.op = "delete"; return b; };
    b.order = (c: string, o?: { ascending?: boolean }) => { q.order = { col: c, asc: o?.ascending !== false }; return b; };
    b.limit = (n: number) => { q.limit = n; return b; };
    b.single = () => { q.single = true; return b; };
    b.maybeSingle = b.single;
    b.then = (resolve: (v: unknown) => unknown) => resolve(run(q));
    return b;
  };
  return { state, reset, builder };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => h.builder(t), functions: { invoke: vi.fn(async () => ({})) } },
}));

import { useWorkoutSession } from "../useWorkoutSession";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-03T10:00:00.000Z";

const set = (n: number, kg: number, extra: Record<string, unknown> = {}) => ({
  exerciseName: "Supino", setNumber: n, weightKg: kg, reps: 8, completed: true, periodizationKey: "peso", periodizationWeek: 0, ...extra,
});
const supino = () => h.state.sets.filter((r) => r.exercise_key === "supino").sort((a, b) => a.set_number - b.set_number).map((r) => [r.set_number, r.weight_kg]);

async function startOnline() {
  const hook = renderHook(() => useWorkoutSession());
  await act(async () => { await hook.result.current.startSession({ userId: "u1", workoutKey: "A", periodizationKey: "peso", periodizationWeek: 0 }); });
  return hook;
}

describe("gravação das séries", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); h.reset(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it("toque ANTES de a sessão existir fica na fila e sobe quando ela existe (nada some)", async () => {
    const hook = renderHook(() => useWorkoutSession());
    await act(async () => { await hook.result.current.registerSet(set(1, 30)); });
    expect(h.state.sets).toHaveLength(0);

    await act(async () => { await hook.result.current.startSession({ userId: "u1", workoutKey: "A", periodizationKey: "peso" }); });
    await waitFor(() => expect(h.state.sets).toHaveLength(1));
    expect(h.state.sets[0]).toMatchObject({ session_id: "S1", user_id: "u1", set_number: 1, weight_kg: 30 });
  });

  it("grava o horário REAL da série (executed_at), mesmo se subir depois", async () => {
    const hook = await startOnline();
    h.state.online = false;
    await act(async () => { await hook.result.current.registerSet(set(1, 30, { executedAt: T1 })).catch(() => {}); });
    h.state.online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.state.sets).toHaveLength(1));
    expect(h.state.sets[0].executed_at).toBe(T1);
  });

  it("remover a série do MEIO renumera no banco e a próxima não sobrescreve ninguém", async () => {
    const hook = await startOnline();
    for (const [n, kg] of [[1, 30], [2, 32], [3, 34]]) await act(async () => { await hook.result.current.registerSet(set(n, kg)); });
    expect(supino()).toEqual([[1, 30], [2, 32], [3, 34]]);

    await act(async () => {
      await hook.result.current.removeSet("Supino", { fromSetNumber: 2, keepCount: 2, shifted: [set(2, 34, { executedAt: T1 })] });
    });
    expect(supino()).toEqual([[1, 30], [2, 34]]);

    await act(async () => { await hook.result.current.registerSet(set(3, 36)); });
    expect(supino()).toEqual([[1, 30], [2, 34], [3, 36]]);
  });

  it("desfazer a última apaga só ela", async () => {
    const hook = await startOnline();
    for (const [n, kg] of [[1, 30], [2, 32]]) await act(async () => { await hook.result.current.registerSet(set(n, kg)); });
    await act(async () => { await hook.result.current.removeSet("Supino", { fromSetNumber: 2, keepCount: 1, shifted: [] }); });
    expect(supino()).toEqual([[1, 30]]);
  });

  it("remoção sem rede: avisa, guarda e conclui quando a conexão volta (sem ressuscitar série apagada)", async () => {
    const hook = await startOnline();
    for (const [n, kg] of [[1, 30], [2, 32], [3, 34]]) await act(async () => { await hook.result.current.registerSet(set(n, kg)); });

    h.state.online = false;
    let threw = false;
    await act(async () => {
      try { await hook.result.current.removeSet("Supino", { fromSetNumber: 2, keepCount: 2, shifted: [set(2, 34)] }); } catch { threw = true; }
    });
    expect(threw).toBe(true);
    expect(supino()).toEqual([[1, 30], [2, 32], [3, 34]]); // servidor ainda como estava

    h.state.online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(supino()).toEqual([[1, 30], [2, 34]]));
  });

  it("ordem preservada: série nova feita antes da remoção pendente subir NÃO é apagada por ela", async () => {
    const hook = await startOnline();
    for (const [n, kg] of [[1, 30], [2, 32], [3, 34]]) await act(async () => { await hook.result.current.registerSet(set(n, kg)); });

    h.state.online = false;
    await act(async () => { await hook.result.current.removeSet("Supino", { fromSetNumber: 2, keepCount: 2, shifted: [set(2, 34)] }).catch(() => {}); });
    await act(async () => { await hook.result.current.registerSet(set(3, 36)).catch(() => {}); });

    h.state.online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(supino()).toEqual([[1, 30], [2, 34], [3, 36]]));
  });

  it("falha PARCIAL: se a exclusão pendente falha, a série nova que veio depois espera — e no fim nada se perde", async () => {
    const hook = await startOnline();
    for (const [n, kg] of [[1, 30], [2, 32], [3, 34]]) await act(async () => { await hook.result.current.registerSet(set(n, kg)); });

    h.state.online = false;
    await act(async () => { await hook.result.current.removeSet("Supino", { fromSetNumber: 2, keepCount: 2, shifted: [set(2, 34)] }).catch(() => {}); });
    await act(async () => { await hook.result.current.registerSet(set(3, 36)).catch(() => {}); });

    // Rede volta, mas a exclusão falha uma vez: a série 3 nova NÃO pode passar na frente.
    h.state.online = true;
    h.state.failOnce = "delete";
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.state.failOnce).toBeNull());
    expect(supino().find(([n]) => n === 3)?.[1]).toBe(34); // ainda a antiga: a nova esperou

    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(supino()).toEqual([[1, 30], [2, 34], [3, 36]]));
  });

  it("treino iniciado SEM rede vira sessão real depois, com data original — e não contamina o treino seguinte", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T1));
    h.state.online = false;

    const offline = renderHook(() => useWorkoutSession());
    await act(async () => { await offline.result.current.startSession({ userId: "u1", workoutKey: "A", periodizationKey: "peso", periodizationWeek: 0 }); });
    const localId = offline.result.current.sessionId!;
    expect(localId.startsWith("local_")).toBe(true);
    expect(offline.result.current.hasLocalSession(localId)).toBe(true);

    for (const [n, kg] of [[1, 30], [2, 32]]) await act(async () => { await offline.result.current.registerSet(set(n, kg)); }); // sessão local: não lança
    await act(async () => { await offline.result.current.finishSession({}); });
    expect(h.state.sets).toHaveLength(0);
    offline.unmount();

    // Dois dias depois, com rede, o aluno abre o MESMO treino/fase.
    vi.setSystemTime(new Date(T2));
    h.state.online = true;
    const next = renderHook(() => useWorkoutSession());
    await act(async () => { await next.result.current.startSession({ userId: "u1", workoutKey: "A", periodizationKey: "peso", periodizationWeek: 0 }); });
    await waitFor(() => expect(h.state.sets).toHaveLength(2));

    const sessionOfNow = h.state.sessions.find((s) => s.started_at === T2);
    const sessionOfOffline = h.state.sessions.find((s) => s.started_at === T1);
    expect(sessionOfOffline).toBeTruthy();
    expect(sessionOfOffline.ended_at).toBe(T1);            // nasceu encerrada
    expect(h.state.sets.every((r) => r.session_id === sessionOfOffline.id)).toBe(true);
    expect(h.state.sets.every((r) => r.executed_at === T1)).toBe(true);
    expect(h.state.sets.some((r) => r.session_id === sessionOfNow.id)).toBe(false);
  });

  it("sessão offline em andamento: materializeLocalSession cria a real, troca o id na tela e envia as séries", async () => {
    h.state.online = false;
    const hook = renderHook(() => useWorkoutSession());
    await act(async () => { await hook.result.current.startSession({ userId: "u1", workoutKey: "A", periodizationKey: "peso" }); });
    const localId = hook.result.current.sessionId!;
    await act(async () => { await hook.result.current.registerSet(set(1, 30)); });

    h.state.online = true;
    let real: string | null = null;
    await act(async () => { real = await hook.result.current.materializeLocalSession(localId); });
    expect(real).toBe("S1");
    await waitFor(() => expect(hook.result.current.sessionId).toBe("S1"));
    await waitFor(() => expect(h.state.sets).toHaveLength(1));
    expect(h.state.sets[0].session_id).toBe("S1");

    // chamada repetida não cria outra sessão
    await act(async () => { await hook.result.current.materializeLocalSession(localId); });
    expect(h.state.sessions).toHaveLength(1);
  });

  it("encerramento que falhou é reenviado quando a rede volta", async () => {
    const hook = await startOnline();
    h.state.online = false;
    await act(async () => { await hook.result.current.finishSession({ generalFeeling: 3 }); });
    expect(localStorage.getItem("workout_finish_pending_S1")).toBeTruthy();
    expect(h.state.sessions[0].ended_at).toBeUndefined();

    h.state.online = true;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(h.state.sessions[0].ended_at).toBeTruthy());
    expect(h.state.sessions[0].general_feeling).toBe(3);
    expect(localStorage.getItem("workout_finish_pending_S1")).toBeNull();
  });
});

describe("leituras", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); h.reset(); });

  it("getExerciseBestWeights devolve a maior carga de cada exercício (qualquer fase), ignorando puladas", async () => {
    h.state.sets = [
      { user_id: "u1", exercise_key: "supino", weight_kg: 40, completed: true, skipped: false },
      { user_id: "u1", exercise_key: "supino", weight_kg: 55, completed: true, skipped: false, periodization_week: 3 },
      { user_id: "u1", exercise_key: "supino", weight_kg: 99, completed: false, skipped: true },
      { user_id: "u2", exercise_key: "supino", weight_kg: 120, completed: true, skipped: false },
    ];
    const { result } = renderHook(() => useWorkoutSession());
    const best = await result.current.getExerciseBestWeights({ userId: "u1", exerciseNames: ["Supino", "Remada"] });
    expect(best).toEqual({ Supino: 55 });
    expect(await result.current.getExerciseBestWeights({ userId: "", exerciseNames: ["Supino"] })).toEqual({});
  });

  it("getExerciseLoadHistory exige a mesma fase junto com o slot (aceitando registros antigos sem fase)", async () => {
    const { result } = renderHook(() => useWorkoutSession());
    await result.current.getExerciseLoadHistory({ userId: "u1", exerciseNames: ["Supino"], weekSlot: 1, periodizationKey: "tecnica" });
    expect(h.state.calls).toContainEqual(["or", "periodization_key.is.null,periodization_key.eq.tecnica"]);

    h.state.calls.length = 0;
    await result.current.getExerciseLoadHistory({ userId: "u1", exerciseNames: ["Supino"], weekSlot: null, periodizationKey: "tecnica" });
    await result.current.getExerciseLoadHistory({ userId: "u1", exerciseNames: ["Supino"], weekSlot: 1, periodizationKey: "x; drop" });
    expect(h.state.calls).toEqual([]);
  });
});
