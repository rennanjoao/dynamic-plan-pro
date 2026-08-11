import { describe, it, expect } from "vitest";
import { classifyExerciseByName, type MuscleGroup } from "@/lib/muscleGroupClassifier";
import { classifyWeeklyVolume, VOLUME_LANDMARKS } from "@/lib/volumeLandmarks";

/**
 * Espelha a lógica do candidato "volume_mrv" do edge function
 * supabase/functions/workout-alert-engine/index.ts.
 */
function groupsOverMrv(sets: { exercise_name: string }[]) {
  const tally = new Map<MuscleGroup, number>();
  for (const s of sets) {
    const cls = classifyExerciseByName(s.exercise_name);
    if (!cls.primary) continue;
    tally.set(cls.primary, (tally.get(cls.primary) ?? 0) + 1);
    for (const sec of cls.secondary) tally.set(sec, (tally.get(sec) ?? 0) + 0.5);
  }
  return Array.from(tally.entries())
    .map(([group, raw]) => ({ group, series: Math.round(raw * 10) / 10 }))
    .filter((r) => classifyWeeklyVolume(r.group, r.series) === "acima_mrv")
    .sort((a, b) => b.series - a.series);
}

describe("alerta de volume acima do MRV", () => {
  it("não gera alerta com volume dentro da faixa", () => {
    const sets = Array.from({ length: 5 }, () => ({ exercise_name: "Supino reto com barra" }));
    expect(groupsOverMrv(sets)).toEqual([]);
  });

  it("gera alerta quando o grupo ultrapassa o MRV", () => {
    const n = VOLUME_LANDMARKS.peito.mrv + 5;
    const sets = Array.from({ length: n }, () => ({ exercise_name: "Supino reto com barra" }));
    const over = groupsOverMrv(sets);
    expect(over.some((r) => r.group === "peito")).toBe(true);
    expect(over[0].series).toBeGreaterThan(VOLUME_LANDMARKS[over[0].group].mrv);
  });

  it("nunca reporta grupos abaixo do MEV", () => {
    const sets = [{ exercise_name: "Rosca direta" }];
    expect(groupsOverMrv(sets)).toEqual([]);
  });
});