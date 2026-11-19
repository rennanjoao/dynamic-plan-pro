import { describe, expect, it } from "vitest";
import { supplementsForToday, takesToday } from "@/lib/supplementsToday";

const supps = [
  { name: "Creatina", dose: "5 g", timing: "Pós-treino" },
  { name: "Vitamina D", dose: "2000 UI", timing: "Manhã", mealRef: "Café da manhã" },
  { name: "Manipulado X", dose: "1 cápsula", timing: "Noite", weeklyFrequency: ["seg", "qua", "sex"] },
  { name: "Magnésio", dose: "300 mg", timing: "Antes de dormir" },
  { name: "Ômega 3", dose: "2 caps", timing: "" },
  { name: "", dose: "x" },
];
const combos = [{ name: "Combo noite", timing: "Antes de dormir", supplementIndexes: [3] }];

describe("suplementos de hoje", () => {
  it("manipulado só nos dias marcados; sem dias = todo dia", () => {
    expect(takesToday(supps[2], "seg")).toBe(true);
    expect(takesToday(supps[2], "ter")).toBe(false);
    expect(takesToday(supps[0], "ter")).toBe(true);
  });

  it("ordena pelo horário do dia e coloca 'sem horário' no fim", () => {
    const g = supplementsForToday(supps, combos, "seg");
    expect(g.map((x) => x.timing)).toEqual(["Manhã", "Pós-treino", "Noite", "Antes de dormir", "Sem horário"]);
  });

  it("item do combo aparece dentro do combo, não solto", () => {
    const g = supplementsForToday(supps, combos, "ter");
    const night = g.filter((x) => x.timing === "Antes de dormir");
    expect(night).toHaveLength(1);
    expect(night[0].comboName).toBe("Combo noite");
    expect(night[0].items.map((i) => i.name)).toEqual(["Magnésio"]);
  });

  it("terça: sem o manipulado de seg/qua/sex", () => {
    const names = supplementsForToday(supps, combos, "ter").flatMap((x) => x.items.map((i) => i.name));
    expect(names).not.toContain("Manipulado X");
    expect(names).toEqual(expect.arrayContaining(["Creatina", "Vitamina D", "Magnésio", "Ômega 3"]));
  });

  it("mantém dose e refeição", () => {
    const manha = supplementsForToday(supps, combos, "ter").find((x) => x.timing === "Manhã")!;
    expect(manha.items[0]).toEqual({ name: "Vitamina D", dose: "2000 UI", mealRef: "Café da manhã" });
  });

  it("sem suplementos não quebra", () => {
    expect(supplementsForToday(undefined, undefined, "seg")).toEqual([]);
  });
});
