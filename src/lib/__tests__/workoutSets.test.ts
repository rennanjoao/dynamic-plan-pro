import { describe, expect, it } from "vitest";
import { countDoneSets, isNewRecord, nextSetIndex, planSetRemoval, type LocalSetData } from "../workoutSets";

const s = (weight: number, extra: Partial<LocalSetData> = {}): LocalSetData => ({ weight, reps: 8, done: true, ...extra });

describe("nextSetIndex / countDoneSets", () => {
  it("lista contínua: próxima = quantidade de séries feitas", () => {
    expect(nextSetIndex([s(30), s(30)])).toBe(2);
    expect(nextSetIndex([])).toBe(0);
    expect(countDoneSets([s(30), s(30)])).toBe(2);
  });

  it("buraco (null do localStorage ou slot vazio): preenche o buraco, não sobrescreve a série existente", () => {
    expect(nextSetIndex([s(30), null, s(32)])).toBe(1);
    // eslint-disable-next-line no-sparse-arrays
    expect(nextSetIndex([s(30), , s(32)] as LocalSetData[])).toBe(1);
    expect(countDoneSets([s(30), null, s(32)])).toBe(2);
  });

  it("série pulada conta como consumida", () => {
    expect(nextSetIndex([s(30), { weight: 0, reps: 0, done: true, skipped: true }])).toBe(2);
  });
});

describe("planSetRemoval", () => {
  it("última série: nada é renumerado, só trunca", () => {
    const plan = planSetRemoval([s(30), s(32), s(34)], 2);
    expect(plan.nextSets.map(x => x.weight)).toEqual([30, 32]);
    expect(plan.shifted).toEqual([]);
    expect(plan.keepCount).toBe(2);
    expect(plan.fromSetNumber).toBe(3);
  });

  it("série do meio: as de cima descem um número, com os dados originais", () => {
    const sets = [s(30, { executedAt: "t1" }), s(32, { executedAt: "t2" }), s(34, { executedAt: "t3" }), s(36, { executedAt: "t4" })];
    const plan = planSetRemoval(sets, 1);
    expect(plan.nextSets.map(x => x.weight)).toEqual([30, 34, 36]);
    expect(plan.fromSetNumber).toBe(2);
    expect(plan.shifted.map(x => [x.setNumber, x.data.weight, x.data.executedAt])).toEqual([[2, 34, "t3"], [3, 36, "t4"]]);
    expect(plan.keepCount).toBe(3);
  });

  it("primeira série: tudo desce", () => {
    const plan = planSetRemoval([s(30), s(32)], 0);
    expect(plan.fromSetNumber).toBe(1);
    expect(plan.shifted.map(x => [x.setNumber, x.data.weight])).toEqual([[1, 32]]);
    expect(plan.keepCount).toBe(1);
  });

  it("buraco antes da série removida: a renumeração começa no buraco", () => {
    const plan = planSetRemoval([s(30), null, s(34), s(36)], 2);
    expect(plan.nextSets.map(x => x.weight)).toEqual([30, 36]);
    expect(plan.fromSetNumber).toBe(2);
    expect(plan.shifted.map(x => [x.setNumber, x.data.weight])).toEqual([[2, 36]]);
    expect(plan.keepCount).toBe(2);
  });

  it("não altera o array de entrada", () => {
    const sets = [s(30), s(32), s(34)];
    planSetRemoval(sets, 1);
    expect(sets.map(x => x.weight)).toEqual([30, 32, 34]);
  });
});

describe("isNewRecord", () => {
  it("sem baseline não há recorde (primeiro treino ou histórico não carregado)", () => {
    expect(isNewRecord(20, undefined, 0)).toBe(false);
    expect(isNewRecord(20, null, 0)).toBe(false);
    expect(isNewRecord(20, 0, 0)).toBe(false);
  });

  it("precisa superar o melhor de sempre E o melhor da sessão", () => {
    expect(isNewRecord(42.5, 40, 0)).toBe(true);
    expect(isNewRecord(40, 40, 0)).toBe(false);
    expect(isNewRecord(41, 40, 42)).toBe(false);
    expect(isNewRecord(0, 40, 0)).toBe(false);
  });
});
