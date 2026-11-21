import { describe, expect, it } from "vitest";
import {
  exceptionValue, findOverride, resolveExerciseInWeek, resolveRx, setExceptionAllWeeks,
} from "../prescriptionResolve";

const weeks = [
  { sets: "4 a 5", reps: "5 a 8", rest: "2 min", cadence: "lenta" },
  { sets: "3 a 4", reps: "10 a 12", rest: "90s", cadence: "1-2" },
  { sets: "3 a 4", reps: "10 a 12", rest: "60s", cadence: "1-2" },
  { sets: "2 a 4", reps: "15 a 20", rest: "45s", cadence: "1" },
];
const ex = { __id: "e1", name: "Agachamento", sets: "3", reps: "8-12", rest: "90s", cadence: "3010", gifKey: "agacho" };

describe("regra única de prescrição", () => {
  it("sem periodização: vale o exercício", () => {
    expect(resolveRx(ex, { periodizationOn: false, week: weeks[0] })).toEqual({ sets: "3", reps: "8-12", cadence: "3010", rest: "90s" });
  });

  it("com periodização: a semana manda sobre o valor do exercício", () => {
    const r = resolveExerciseInWeek(ex, { enabled: true, weeks }, 1, "A", 1);
    expect(r).toMatchObject({ sets: "3 a 4", reps: "10 a 12", rest: "90s", cadence: "1-2", overridden: false });
  });

  it("semana vazia num campo: usa o exercício só nesse campo", () => {
    const r = resolveExerciseInWeek(ex, { enabled: true, weeks: [{ sets: "5" }] }, 0, "A", 0);
    expect(r).toMatchObject({ sets: "5", reps: "8-12", cadence: "3010" });
  });

  it("exceção da semana ganha de tudo e a troca de exercício leva nome e tira o gif antigo", () => {
    const per = { enabled: true, weeks, overrides: { "2": { A_1: { exerciseId: "e1", reps: "6", name: "Hack" } } } };
    const r = resolveExerciseInWeek(ex, per, 2, "A", 1);
    expect(r).toMatchObject({ reps: "6", sets: "3 a 4", name: "Hack", overridden: true });
    expect(r.gifKey).toBeUndefined();
    expect(resolveExerciseInWeek(ex, per, 1, "A", 1).name).toBe("Agachamento");
  });

  it("exceção achada pelo exerciseId mesmo fora da posição; órfã é ignorada", () => {
    const per = { enabled: true, weeks, overrides: { "0": { A_0: { exerciseId: "outro", sets: "9" }, A_7: { exerciseId: "e1", sets: "6" } } } };
    expect(findOverride(per, 0, "A", 0, "e1")?.sets).toBe("6");
    expect(findOverride(per, 0, "A", 0, "zzz")).toBeUndefined();
  });

  it("legado sem exerciseId: acha pela posição contando a mobilidade", () => {
    const per = { enabled: true, weeks, overrides: { "0": { A_2: { sets: "7" } } } };
    expect(resolveExerciseInWeek({ name: "Remada" }, per, 0, "A", 2).sets).toBe("7");
  });
});

describe("exceção em todas as semanas (campo do exercício com periodização ligada)", () => {
  it("grava nas 4 semanas, lê de volta e apaga deixando tudo limpo", () => {
    let per = { enabled: true, weeks } as Parameters<typeof setExceptionAllWeeks>[0];
    per = setExceptionAllWeeks(per, "A", 1, "e1", "reps", "12");
    for (let w = 0; w < 4; w++) expect(findOverride(per, w, "A", 1, "e1")).toMatchObject({ exerciseId: "e1", reps: "12" });
    expect(exceptionValue(per, "A", 1, "e1", "reps")).toEqual({ value: "12", mixed: false });
    expect(resolveExerciseInWeek(ex, per, 3, "A", 1).reps).toBe("12");
    per = setExceptionAllWeeks(per, "A", 1, "e1", "reps", "");
    expect(per.overrides).toEqual({});
  });

  it("mantém trocas da semana já existentes e avisa quando varia entre semanas", () => {
    let per = { enabled: true, weeks, overrides: { "1": { A_1: { exerciseId: "e1", name: "Hack", reps: "8" } } } } as Parameters<typeof setExceptionAllWeeks>[0];
    expect(exceptionValue(per, "A", 1, "e1", "reps")).toEqual({ value: "", mixed: true });
    per = setExceptionAllWeeks(per, "A", 1, "e1", "sets", "3");
    expect(findOverride(per, 1, "A", 1, "e1")).toMatchObject({ name: "Hack", reps: "8", sets: "3" });
    per = setExceptionAllWeeks(per, "A", 1, "e1", "sets", "");
    expect(findOverride(per, 1, "A", 1, "e1")).toMatchObject({ name: "Hack", reps: "8" });
    expect(findOverride(per, 0, "A", 1, "e1")).toBeUndefined();
  });
});
