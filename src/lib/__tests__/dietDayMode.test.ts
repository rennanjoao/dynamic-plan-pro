import { beforeEach, describe, expect, it } from "vitest";
import {
  availableDayAction, readCookedPref, readDayOverride, resolveDayPlan, writeCookedPref, writeDayOverride,
} from "@/lib/dietDayMode";

beforeEach(() => localStorage.clear());

describe("resolveDayPlan", () => {
  it("sem escolha da aluna, segue o planejado (nada é inferido)", () => {
    expect(resolveDayPlan({ plannedTraining: true, plannedCarb: "high", override: null }))
      .toEqual({ dayType: "training", carb: "high", adjusted: false });
    expect(resolveDayPlan({ plannedTraining: false, plannedCarb: "base", override: null }))
      .toEqual({ dayType: "rest", carb: "base", adjusted: false });
  });
  it("'Hoje não vou treinar' → refeições de descanso e carbo de dia off", () => {
    expect(resolveDayPlan({ plannedTraining: true, plannedCarb: "high", override: "rest" }))
      .toEqual({ dayType: "rest", carb: "off", adjusted: true });
  });
  it("'Hoje vou treinar' → só as refeições; carbo segue o planejado", () => {
    expect(resolveDayPlan({ plannedTraining: false, plannedCarb: "base", override: "training" }))
      .toEqual({ dayType: "training", carb: "base", adjusted: true });
  });
  it("escolha igual ao planejado não conta como ajuste", () => {
    expect(resolveDayPlan({ plannedTraining: true, plannedCarb: "high", override: "training" }).adjusted).toBe(false);
  });
});

describe("availableDayAction", () => {
  it("dia de treino com refeições em par → oferece 'não vou treinar'", () => {
    expect(availableDayAction({ plannedTraining: true, plannedCarb: "high", hasPairs: true, hasCarbCycle: false })).toBe("skip");
  });
  it("dia de treino sem pares mas com ciclo de carbo acima de off → oferece (o carbo cai)", () => {
    expect(availableDayAction({ plannedTraining: true, plannedCarb: "base", hasPairs: false, hasCarbCycle: true })).toBe("skip");
  });
  it("nada mudaria → não mostra botão", () => {
    expect(availableDayAction({ plannedTraining: true, plannedCarb: "off", hasPairs: false, hasCarbCycle: true })).toBeNull();
    expect(availableDayAction({ plannedTraining: false, plannedCarb: "base", hasPairs: false, hasCarbCycle: true })).toBeNull();
  });
  it("dia de descanso com pares → oferece 'vou treinar'", () => {
    expect(availableDayAction({ plannedTraining: false, plannedCarb: "base", hasPairs: true, hasCarbCycle: false })).toBe("train");
  });
});

describe("persistência", () => {
  it("escolha vale só para a data marcada", () => {
    writeDayOverride("u1", "2026-11-18", "rest");
    expect(readDayOverride("u1", "2026-11-18")).toBe("rest");
    expect(readDayOverride("u1", "2026-11-19")).toBeNull();
    expect(readDayOverride("u2", "2026-11-18")).toBeNull();
    writeDayOverride("u1", "2026-11-18", null);
    expect(readDayOverride("u1", "2026-11-18")).toBeNull();
  });
  it("lembra cru/cozido por aluna", () => {
    expect(readCookedPref("u1")).toBeNull();
    writeCookedPref("u1", true);
    expect(readCookedPref("u1")).toBe(true);
    writeCookedPref("u1", false);
    expect(readCookedPref("u1")).toBe(false);
  });
});
