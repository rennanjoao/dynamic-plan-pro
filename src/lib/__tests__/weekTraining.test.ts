import { describe, expect, it } from "vitest";
import { trainingDaysFromWeek } from "../weekTraining";

const workouts = [{ key: "A" }, { key: "B" }, { key: "C" }];

describe("dias de treino contados da semana do Treino", () => {
  it("conta só dias com treino que existe (descanso e vazio não contam)", () => {
    expect(trainingDaysFromWeek({ seg: "A", ter: "B", qua: "REST", qui: "C", sex: "A", sab: "REST" }, workouts)).toBe(4);
  });

  it("treino que não existe mais (órfão) não conta", () => {
    expect(trainingDaysFromWeek({ seg: "A", ter: "D" }, workouts)).toBe(1);
  });

  it("semana ainda não montada → null (usa o número salvo)", () => {
    expect(trainingDaysFromWeek({}, workouts)).toBeNull();
    expect(trainingDaysFromWeek(undefined, workouts)).toBeNull();
  });

  it("semana montada só com descanso → 0 (não cai no número salvo)", () => {
    expect(trainingDaysFromWeek({ seg: "REST", ter: "REST" }, workouts)).toBe(0);
  });
});
