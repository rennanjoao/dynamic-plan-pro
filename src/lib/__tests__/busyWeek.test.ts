import { describe, it, expect } from "vitest";
import {
  normalizeBusyForSave, sanitizeBusyRaw, busyContentCount, assertNoContentLoss,
  BUSY_KEY_PREFIX, busyCarbFor, busyFromProtocolWorkouts, busyToEditorPayload, busyTrainingDays, defaultBusyWeek, editorToBusyPayload, emptyBusyPayload, isAssignmentOutdated, isBusyKey, isBusyWeek,
  nextBusyWorkoutKey, normalizeBusyPayload, suggestBusyDayType, workoutKeyLabel,
} from "../busyWeek";
import {
  applyWorkoutInversion, invertExerciseOrder, makeInvertSetting, shouldInvert, timesDoneBeforeToday, trainedYesterday,
} from "../workoutInversion";
import { ProtocolPayloadSchema } from "../protocolSchema";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();
const TODAY = new Date(2026, 11, 10, 9); // qui 10/12/2026

const mob = (name: string) => ({ name, is_mobility: true, __id: name });
const ex = (name: string) => ({ name, __id: name });

describe("inversão da ordem", () => {
  it("mobilidade continua no começo e a força inverte", () => {
    const { exercises, indexMap } = invertExerciseOrder([ex("agacho"), mob("quadril"), ex("terra"), ex("remada")]);
    expect(exercises.map((e) => e.name)).toEqual(["quadril", "remada", "terra", "agacho"]);
    expect(indexMap.get(1)).toBe(0);
    expect(indexMap.get(0)).toBe(3);
  });

  it("dias seguidos: inverte só se treinou ontem", () => {
    const s = { mode: "consecutive" as const };
    expect(shouldInvert(s, "SC_A", { today: TODAY, sessions: [{ workout_key: "SC_B", started_at: at(2026, 12, 9) }] })).toBe(true);
    expect(shouldInvert(s, "SC_A", { today: TODAY, sessions: [{ workout_key: "SC_B", started_at: at(2026, 12, 8) }] })).toBe(false);
  });

  it("a cada treino: alterna pelas vezes que fez ESSE treino antes de hoje", () => {
    const s = { mode: "every" as const };
    const sessions = [
      { workout_key: "A", started_at: at(2026, 12, 1) },
      { workout_key: "A", started_at: at(2026, 12, 1, 18) }, // mesmo dia conta 1
      { workout_key: "B", started_at: at(2026, 12, 3) },
    ];
    expect(timesDoneBeforeToday(sessions, "A", TODAY)).toBe(1);
    expect(shouldInvert(s, "A", { today: TODAY, sessions })).toBe(true);
    // Sessão de hoje não vira a ordem no meio do treino.
    const withToday = [...sessions, { workout_key: "A", started_at: at(2026, 12, 10, 7) }];
    expect(shouldInvert(s, "A", { today: TODAY, sessions: withToday })).toBe(true);
    expect(shouldInvert(s, "B", { today: TODAY, sessions })).toBe(true);
    expect(shouldInvert(s, "C", { today: TODAY, sessions })).toBe(false);
  });

  it("semanal, quinzenal e mensal contam a partir de quando o coach ligou", () => {
    const ctx = (d: Date) => ({ today: d, sessions: [] });
    expect(shouldInvert({ mode: "weekly", since: "2026-12-01" }, "A", ctx(new Date(2026, 11, 7)))).toBe(false);
    expect(shouldInvert({ mode: "weekly", since: "2026-12-01" }, "A", ctx(new Date(2026, 11, 8)))).toBe(true);
    expect(shouldInvert({ mode: "biweekly", since: "2026-12-01" }, "A", ctx(new Date(2026, 11, 14)))).toBe(false);
    expect(shouldInvert({ mode: "biweekly", since: "2026-12-01" }, "A", ctx(new Date(2026, 11, 15)))).toBe(true);
    expect(shouldInvert({ mode: "monthly", since: "2026-12-01" }, "A", ctx(new Date(2026, 11, 31)))).toBe(false);
    expect(shouldInvert({ mode: "monthly", since: "2026-12-01" }, "A", ctx(new Date(2027, 0, 2)))).toBe(true);
    expect(shouldInvert(undefined, "A", ctx(TODAY))).toBe(false);
  });

  it("aplica só nos treinos configurados e remapeia overrides da periodização", () => {
    const workouts = [
      { key: "A", exercises: [ex("a1"), ex("a2"), ex("a3")], invert: { mode: "consecutive" as const } },
      { key: "B", exercises: [ex("b1"), ex("b2")] },
    ];
    const periodization = {
      enabled: true,
      overrides: {
        "0": { A_0: { reps: "5" }, A_2: { exerciseId: "a3", reps: "20" }, B_0: { reps: "8" } },
      },
    };
    const out = applyWorkoutInversion(workouts, periodization, {
      today: TODAY,
      sessions: [{ workout_key: "B", started_at: at(2026, 12, 9) }],
    });
    expect(out.invertedKeys).toEqual(["A"]);
    expect((out.workouts[0].exercises as Array<{ name: string }>).map((e) => e.name)).toEqual(["a3", "a2", "a1"]);
    expect(out.workouts[0].__inverted).toBe(true);
    expect(out.workouts[1].__inverted).toBeUndefined();
    const ov = out.periodization.overrides["0"] as Record<string, { reps?: string }>;
    expect(ov.A_2.reps).toBe("5"); // a1 foi para a posição 2
    expect(ov.A_0.reps).toBe("20"); // a3 foi para a posição 0
    expect(ov.B_0.reps).toBe("8");
  });

  it("treino só com 1 exercício de força não é marcado como invertido", () => {
    const out = applyWorkoutInversion(
      [{ key: "A", exercises: [mob("m1"), ex("a1")], invert: { mode: "weekly", since: "2026-12-01" } }],
      undefined,
      { today: new Date(2026, 11, 9), sessions: [] },
    );
    expect(out.invertedKeys).toEqual([]);
  });

  it("schema do protocolo guarda a configuração e ignora modo desconhecido", () => {
    const p = ProtocolPayloadSchema.parse({
      setup: {},
      workouts: [
        { key: "A", invert: { mode: "weekly", since: "2026-12-01" } },
        { key: "B", invert: { mode: "xyz" } },
      ],
    });
    expect(p.workouts[0].invert).toEqual({ mode: "weekly", since: "2026-12-01" });
    expect(p.workouts[1].invert?.mode).toBe("off");
    expect(makeInvertSetting("off")).toBeUndefined();
    expect(makeInvertSetting("every", TODAY)).toEqual({ mode: "every", since: "2026-12-10" });
  });

  it("treinou ontem", () => {
    expect(trainedYesterday([{ workout_key: "A", started_at: at(2026, 12, 9, 23) }], TODAY)).toBe(true);
    expect(trainedYesterday([], TODAY)).toBe(false);
  });
});

describe("Semana Corrida", () => {
  it("plano novo: 2 treinos com chaves SC_ e inversão em dias seguidos", () => {
    const p = emptyBusyPayload("upper_lower");
    expect(p.workouts.map((w) => w.key)).toEqual(["SC_A", "SC_B"]);
    expect(p.workouts[0].focus).toMatch(/Upper/);
    expect(p.workouts.every((w) => w.invert?.mode === "consecutive")).toBe(true);
    expect(p.periodization.enabled).toBe(false);
    expect(p.dietRule).toEqual({ training: "base", rest: "off" });
  });

  it("normaliza chaves vindas de modelo de treino (A/B/C) e leva os overrides junto", () => {
    const p = normalizeBusyPayload({
      workouts: [{ key: "A", exercises: [] }, { key: "B", exercises: [] }, { key: "C", exercises: [] }],
      periodization: { enabled: true, overrides: { "1": { B_0: { reps: "12" } } } },
    });
    expect(p.workouts.map((w) => w.key)).toEqual(["SC_A", "SC_B", "SC_C"]);
    expect((p.periodization.overrides["1"] as Record<string, { reps?: string }>).SC_B_0.reps).toBe("12");
    expect(isBusyKey("SC_A")).toBe(true);
    expect(isBusyKey("A")).toBe(false);
    expect(BUSY_KEY_PREFIX).toBe("SC_");
  });

  it("rotação A → B → C → A, e o treino começado hoje continua sendo o de hoje", () => {
    const keys = ["SC_A", "SC_B", "SC_C"];
    expect(nextBusyWorkoutKey(keys, [], TODAY)).toBe("SC_A");
    expect(nextBusyWorkoutKey(keys, [{ workout_key: "SC_A", started_at: at(2026, 12, 8) }, { workout_key: "A", started_at: at(2026, 12, 9) }], TODAY)).toBe("SC_B");
    expect(nextBusyWorkoutKey(keys, [{ workout_key: "SC_C", started_at: at(2026, 12, 8) }], TODAY)).toBe("SC_A");
    expect(nextBusyWorkoutKey(keys, [
      { workout_key: "SC_A", started_at: at(2026, 12, 8) },
      { workout_key: "SC_B", started_at: at(2026, 12, 10, 7) },
    ], TODAY)).toBe("SC_B");
  });

  it("tipo do dia sugerido: treinou ontem → descanso; treinou hoje → treino", () => {
    expect(suggestBusyDayType([], TODAY)).toBe("training");
    expect(suggestBusyDayType([{ workout_key: "SC_A", started_at: at(2026, 12, 9) }], TODAY)).toBe("rest");
    expect(suggestBusyDayType([
      { workout_key: "SC_A", started_at: at(2026, 12, 9) },
      { workout_key: "SC_B", started_at: at(2026, 12, 10, 7) },
    ], TODAY)).toBe("training");
    expect(busyCarbFor({ training: "high", rest: "off" }, "training")).toBe("high");
    expect(busyCarbFor({ training: "high", rest: "off" }, "rest")).toBe("off");
  });

  it("rótulos e semana em que usou a Semana Corrida", () => {
    expect(workoutKeyLabel("SC_B")).toBe("Semana corrida B");
    expect(workoutKeyLabel("A")).toBe("Treino A");
    const monday = new Date(2026, 11, 7);
    expect(isBusyWeek([{ workout_key: "SC_A", started_at: at(2026, 12, 9) }], monday)).toBe(true);
    expect(isBusyWeek([{ workout_key: "A", started_at: at(2026, 12, 9) }], monday)).toBe(false);
  });

  it("cópia da aluna desatualizada em relação à biblioteca", () => {
    const a = { plan_id: "p", plan_synced_at: "2026-12-01T10:00:00Z", customized: false, enabled: true };
    expect(isAssignmentOutdated(a, "2026-12-02T10:00:00Z")).toBe(true);
    expect(isAssignmentOutdated(a, "2026-12-01T10:00:00Z")).toBe(false);
    expect(isAssignmentOutdated({ ...a, plan_id: null }, "2026-12-02T10:00:00Z")).toBe(false);
  });
});

describe("Semana Corrida — faixa da semana (dias + carbo) igual ao treino atual", () => {
  it("semana padrão: treino seg/qua/sex alternando, descanso nos outros", () => {
    const w = defaultBusyWeek(["SC_A", "SC_B"]);
    expect(w.weekDays).toEqual({ seg: "SC_A", ter: "REST", qua: "SC_B", qui: "REST", sex: "SC_A", sab: "REST", dom: "REST" });
    expect(w.carbCycle.seg).toBe("base");
    expect(w.carbCycle.ter).toBe("off");
    expect(defaultBusyWeek(["SC_A", "SC_B", "SC_C"]).weekDays.sex).toBe("SC_C");
  });

  it("plano antigo sem faixa: monta a semana a partir da regra antiga de carbo", () => {
    const p = normalizeBusyPayload({ workouts: [{ key: "SC_A" }, { key: "SC_B" }], dietRule: { training: "high", rest: "off" } });
    expect(p.weekDays.seg).toBe("SC_A");
    expect(p.carbCycle.seg).toBe("high");
    expect(p.carbCycle.dom).toBe("off");
    expect(busyTrainingDays(p)).toBe(3);
    expect(p.sessionsPerWeek).toBe(3);
  });

  it("dias apontando para treino renomeado ou removido são corrigidos", () => {
    const p = normalizeBusyPayload({
      workouts: [{ key: "A" }, { key: "B" }],
      weekDays: { seg: "A", ter: "B", qua: "Z", qui: "REST" },
      carbCycle: { seg: "high", ter: "xyz" },
    });
    expect(p.weekDays).toEqual({ seg: "SC_A", ter: "SC_B", qui: "REST" });
    expect(p.carbCycle).toEqual({ seg: "high", ter: "base" });
    expect(busyTrainingDays(p)).toBe(2);
  });

  it("o editor do protocolo leva e traz dias, carbo e observação do descanso", () => {
    const plan = normalizeBusyPayload({ workouts: [{ key: "SC_A" }], weekDays: { seg: "SC_A", ter: "REST" }, carbCycle: { seg: "high", ter: "off" }, restNotes: "caminhada" });
    const editor = busyToEditorPayload(plan, ProtocolPayloadSchema.parse({ setup: {} }));
    expect(editor.weekDays).toEqual({ seg: "SC_A", ter: "REST" });
    const back = editorToBusyPayload({ ...editor, carbCycle: { ...editor.carbCycle, ter: "base" } }, plan);
    expect(back.carbCycle.ter).toBe("base");
    expect(back.restNotes).toBe("caminhada");
  });

  it("copiar do treino atual: mesmos exercícios, chaves SC_ e inverter em dias seguidos", () => {
    const p = busyFromProtocolWorkouts([{ key: "A", focus: "Pernas", exercises: [{ name: "Leg press" }] }] as never);
    expect(p.workouts[0].key).toBe("SC_A");
    expect(p.workouts[0].invert?.mode).toBe("consecutive");
    expect(p.weekDays.seg).toBe("SC_A");
  });
});


describe("Semana Corrida — nunca some (bug Mayane 21/11/2026)", () => {
  const raw = (exercise: Record<string, unknown>) => ({
    workouts: [
      { key: "SC_A", focus: "Glúteo", exercises: [{ __id: "e1", name: "Agachamento", sets: "3", reps: "10" }, exercise] },
      { key: "SC_B", focus: "Costas", exercises: [{ __id: "e3", name: "Remada", sets: "3", reps: "12" }] },
    ],
    periodization: { enabled: false },
  });

  it.each([
    ["gifKey null", { __id: "e2", name: "Stiff", gifKey: null }],
    ["séries como número", { __id: "e2", name: "Stiff", sets: 4, reps: 10 }],
    ["obs null", { __id: "e2", name: "Stiff", notes: null }],
    ["alternativas null", { __id: "e2", name: "Stiff", allowed_substitutes: null }],
    ["__id null", { __id: null, name: "Stiff" }],
  ])("campo fora do formato (%s) não apaga o plano", (_label, bad) => {
    const p = normalizeBusyPayload(raw(bad));
    expect(p.workouts).toHaveLength(2);
    expect(p.workouts[0].exercises.map((e) => e.name)).toEqual(["Agachamento", "Stiff"]);
    expect(() => normalizeBusyForSave(raw(bad))).not.toThrow();
  });

  it("números viram texto (séries 4 → '4')", () => {
    const p = normalizeBusyPayload(raw({ name: "Stiff", sets: 4, reps: 10 }));
    expect(p.workouts[0].exercises[1]).toMatchObject({ sets: "4", reps: "10" });
  });

  it("periodização com exceção malformada não derruba o resto", () => {
    const p = normalizeBusyPayload({
      ...raw({ name: "Stiff" }),
      periodization: { enabled: true, overrides: { "0": { SC_A_0: { exerciseId: "e1", reps: 12, sets: null } }, "1": "lixo" } },
    });
    expect(p.workouts).toHaveLength(2);
    expect(p.periodization.enabled).toBe(true);
    expect(p.periodization.overrides["0"].SC_A_0).toEqual({ exerciseId: "e1", reps: "12" });
  });

  it("salvar recusa se ainda assim fosse perder exercício (erro na tela, nada gravado)", () => {
    const bad = raw({ name: { texto: "Stiff" } });
    expect(busyContentCount(bad).exercises).toBe(2); // o objeto não conta como nome
    const withNamedObject = { workouts: [{ key: "SC_A", exercises: [{ name: "Agachamento" }, { name: "Stiff" }] }] };
    expect(() => normalizeBusyForSave(withNamedObject)).not.toThrow();
    // Inversão com data em formato errado também não derruba o treino.
    const broken = { workouts: [{ key: "SC_A", exercises: [{ name: "Agachamento" }] }, { key: "SC_B", exercises: [{ name: "Remada" }], invert: { mode: "weekly", since: 123 } }] };
    expect(sanitizeBusyRaw(broken).workouts).toHaveLength(2);
    expect(normalizeBusyForSave(broken).workouts).toHaveLength(2);
    // A trava: se algo ainda se perdesse, o salvar dá erro em vez de gravar.
    expect(() => assertNoContentLoss({ workouts: 2, exercises: 5 }, { workouts: 0, exercises: 0 })).toThrow(/Não salvei/);
    expect(() => assertNoContentLoss({ workouts: 2, exercises: 5 }, { workouts: 2, exercises: 5 })).not.toThrow();
  });
});
