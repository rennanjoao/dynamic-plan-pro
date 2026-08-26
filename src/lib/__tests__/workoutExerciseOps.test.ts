import { describe, it, expect } from "vitest";
import {
  computeExerciseIndexRemap,
  remapDayOverrides,
  applyDayExercisesChange,
  buildExercisesWithLibraryAdditions,
} from "../workoutExerciseOps";
import { ProtocolPayloadSchema, PeriodizationSchema } from "../protocolSchema";

function ex(id: string, name: string, opts?: { isMobility?: boolean }) {
  return { __id: id, name, sets: "", reps: "", cadence: "", rest: "", notes: "", is_mobility: !!opts?.isMobility };
}

function payloadWith(exercises: ReturnType<typeof ex>[], overrides: Record<string, Record<string, any>>) {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 4, carbCycle: false },
    workouts: [{ key: "A", focus: "Peito", exercises }],
    periodization: PeriodizationSchema.parse({ enabled: true, overrides }),
  });
}

describe("computeExerciseIndexRemap", () => {
  it("mapeia índices estáveis quando nada muda", () => {
    const arr = [ex("1", "a"), ex("2", "b")];
    const map = computeExerciseIndexRemap(arr, arr);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBe(1);
  });

  it("desloca índices após inserção no início", () => {
    const oldArr = [ex("1", "a"), ex("2", "b")];
    const newArr = [ex("3", "new"), ex("1", "a"), ex("2", "b")];
    const map = computeExerciseIndexRemap(oldArr, newArr);
    expect(map.get(0)).toBe(1); // "1" era 0, agora é 1
    expect(map.get(1)).toBe(2); // "2" era 1, agora é 2
  });

  it("marca item removido como null", () => {
    const oldArr = [ex("1", "a"), ex("2", "b"), ex("3", "c")];
    const newArr = [ex("1", "a"), ex("3", "c")];
    const map = computeExerciseIndexRemap(oldArr, newArr);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBeNull(); // "2" removido
    expect(map.get(2)).toBe(1);
  });

  it("trata item sem __id como não rastreável (null)", () => {
    const oldArr = [{ name: "sem-id" } as any];
    const newArr = [{ name: "sem-id" } as any];
    const map = computeExerciseIndexRemap(oldArr, newArr);
    expect(map.get(0)).toBeNull();
  });
});

describe("remapDayOverrides", () => {
  it("remapeia apenas overrides do dia afetado, preservando os demais", () => {
    const periodization = PeriodizationSchema.parse({
      enabled: true,
      overrides: {
        "0": { A_0: { sets: "4" }, A_1: { sets: "3" }, B_0: { sets: "5" } },
      },
    });
    // "1" (índice 0) permanece; "2" (índice 1) some; novo item entra no índice 1
    const map = new Map<number, number | null>([[0, 0], [1, null]]);
    const next = remapDayOverrides(periodization, "A", map);
    expect(next.overrides!["0"]).toEqual({ A_0: { sets: "4" }, B_0: { sets: "5" } });
  });

  it("não mexe na referência quando o dia não tem overrides", () => {
    const periodization = PeriodizationSchema.parse({
      enabled: true,
      overrides: { "0": { B_0: { sets: "5" } } },
    });
    const map = new Map<number, number | null>([[0, 1]]);
    const next = remapDayOverrides(periodization, "A", map);
    expect(next).toBe(periodization);
  });

  it("desloca override para o novo índice após inserção no início", () => {
    const periodization = PeriodizationSchema.parse({
      enabled: true,
      overrides: { "0": { A_0: { sets: "4" } } },
    });
    const map = new Map<number, number | null>([[0, 1]]);
    const next = remapDayOverrides(periodization, "A", map);
    expect(next.overrides!["0"]).toEqual({ A_1: { sets: "4" } });
  });
});

describe("applyDayExercisesChange (integração)", () => {
  it("insere exercícios em massa e preserva overrides do exercício antigo apontando pro item certo", () => {
    const payload = payloadWith(
      [ex("1", "Supino"), ex("2", "Mobilidade quadril", { isMobility: true })],
      { "0": { A_0: { sets: "4 pesado" } } }, // override no Supino (índice 0)
    );
    const additions = [ex("new", "Remada")];
    const newExercises = buildExercisesWithLibraryAdditions(payload.workouts[0].exercises as any, additions);
    // esperado: [Supino, Remada, Mobilidade] — nova entrada antes da mobilidade
    expect(newExercises.map((e: any) => e.__id)).toEqual(["1", "new", "2"]);

    const next = applyDayExercisesChange(payload, 0, newExercises);
    // Supino continua no índice 0 → override permanece em A_0
    expect(next.periodization.overrides!["0"]).toEqual({ A_0: { sets: "4 pesado" } });
    expect(next.workouts[0].exercises.map((e: any) => e.__id)).toEqual(["1", "new", "2"]);
  });

  it("remapeia overrides quando a mobilidade original estava ANTES do exercício de força no array", () => {
    // array bruto intercalado: mobilidade no índice 0, força no índice 1
    const payload = payloadWith(
      [ex("mob", "Mobilidade", { isMobility: true }), ex("1", "Supino")],
      { "0": { A_1: { reps: "10" } } }, // override no Supino, que hoje está no índice 1
    );
    const additions = [ex("new", "Remada")];
    const newExercises = buildExercisesWithLibraryAdditions(payload.workouts[0].exercises as any, additions);
    // reconstrução: força primeiro → [Supino, Remada, Mobilidade]
    expect(newExercises.map((e: any) => e.__id)).toEqual(["1", "new", "mob"]);

    const next = applyDayExercisesChange(payload, 0, newExercises);
    // Supino era A_1, agora é índice 0 → A_0
    expect(next.periodization.overrides!["0"]).toEqual({ A_0: { reps: "10" } });
  });

  it("remove um exercício e descarta o override associado, preservando os demais", () => {
    const payload = payloadWith(
      [ex("1", "Supino"), ex("2", "Crucifixo"), ex("3", "Tríceps")],
      { "0": { A_0: { sets: "4" }, A_1: { sets: "3" }, A_2: { sets: "2" } } },
    );
    const newExercises = (payload.workouts[0].exercises as any[]).filter((e) => e.__id !== "2");
    const next = applyDayExercisesChange(payload, 0, newExercises);
    // Supino (0) continua A_0; Crucifixo (removido) some; Tríceps (era 2) vira A_1
    expect(next.periodization.overrides!["0"]).toEqual({ A_0: { sets: "4" }, A_1: { sets: "2" } });
  });

  it("reordena (swap) e migra o override junto com o exercício", () => {
    const payload = payloadWith(
      [ex("1", "Supino"), ex("2", "Crucifixo")],
      { "0": { A_0: { sets: "4" } } }, // override no Supino
    );
    const swapped = [payload.workouts[0].exercises[1], payload.workouts[0].exercises[0]];
    const next = applyDayExercisesChange(payload, 0, swapped as any);
    // Supino agora está no índice 1 → override deve seguir para A_1
    expect(next.periodization.overrides!["0"]).toEqual({ A_1: { sets: "4" } });
  });
});

describe("buildExercisesWithLibraryAdditions", () => {
  it("mantém ordem relativa dentro de cada grupo", () => {
    const exercises = [
      ex("s1", "Supino"),
      ex("m1", "Mobilidade 1", { isMobility: true }),
      ex("s2", "Remada"),
      ex("m2", "Mobilidade 2", { isMobility: true }),
    ];
    const additions = [ex("new1", "Novo 1"), ex("new2", "Novo 2")];
    const result = buildExercisesWithLibraryAdditions(exercises, additions);
    expect(result.map((e: any) => e.__id)).toEqual(["s1", "s2", "new1", "new2", "m1", "m2"]);
  });
});
