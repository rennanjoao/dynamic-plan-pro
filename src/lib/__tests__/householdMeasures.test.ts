import { describe, expect, it } from "vitest";
import { parseFoodQuantity, findFoodByName, parseWeightString } from "../macroCalc";
import { householdApprox, hasHouseholdWord } from "../householdMeasures";

const q = (food: string, text: string) => parseFoodQuantity(findFoodByName(food), text);

describe("medidas: peso da unidade só vale para 'unidade'", () => {
  it("'1 colher de sopa' / '1 xícara' não herdam o peso de 1 banana ou da 'unidade' do azeite", () => {
    expect(q("Banana prata (crua)", "1 unidade")).toMatchObject({ status: "ok", grams: 70 });
    expect(q("Banana prata (crua)", "1 colher de sopa")).toMatchObject({ status: "no-weight", grams: 0 });
    expect(q("Azeite de oliva extra virgem", "1 xícara")).toMatchObject({ status: "no-weight", grams: 0 });
  });

  it("a palavra do próprio alimento vale como unidade (1 ovo, 2 castanhas)", () => {
    expect(q("Ovo de galinha inteiro (cozido)", "2 ovos")).toMatchObject({ status: "ok", grams: 100 });
    expect(q("Castanha do Pará / Brasil", "3 castanhas")).toMatchObject({ status: "ok", grams: 12 });
  });

  it("pão de forma: fatia = peso já cadastrado; nomes duplicados têm as mesmas medidas", () => {
    expect(q("Pão de forma tradicional", "2 fatias")).toMatchObject({ status: "ok", grams: 50 });
    expect(q("Pão, trigo, forma, integral", "1 unidade")).toMatchObject({ status: "ok", grams: 25 });
    expect(q("Ovo, de galinha, inteiro, cru", "1 unidade")).toMatchObject({ status: "ok", grams: 50 });
  });
});

describe("medidas: ml pela densidade (FSANZ) e só para líquidos", () => {
  it("azeite 0,91 · mel 1,43 · leite 1,03", () => {
    expect(q("Azeite de oliva extra virgem", "10 ml").grams).toBe(9.1);
    expect(q("Mel de abelha", "15 ml").grams).toBe(21.5);
    expect(q("Leite de vaca integral (líquido)", "200 ml").grams).toBe(206);
    expect(q("Leite de vaca integral (líquido)", "1 l").grams).toBe(1030);
  });

  it("sólido em ml pede g ou medida caseira (antes contava 1 ml = 1 g)", () => {
    const r = q("Arroz branco (cru)", "100 ml");
    expect(r).toMatchObject({ status: "no-weight", grams: 0 });
    expect(r.hint).toMatch(/ml só vale para líquidos/);
  });

  it("sem alimento (texto solto) mantém o comportamento antigo", () => {
    expect(parseWeightString("200 ml")).toMatchObject({ status: "ok", grams: 200 });
  });
});

describe("medidas novas do IBGE são reconhecidas", () => {
  it("concha, escumadeira, colher de servir/arroz", () => {
    for (const t of ["1 concha", "2 escumadeiras", "1 colher de servir", "1 colher de arroz"]) {
      expect(parseWeightString(t, undefined, undefined).status, t).toBe("no-weight");
    }
    expect(parseWeightString("2 conchas", undefined, [{ label: "1 concha", grams: 80 }])).toMatchObject({ status: "ok", grams: 160 });
    expect(parseWeightString("1 colher de servir", undefined, [{ label: "1 colher de servir", grams: 45 }, { label: "1 colher de sopa", grams: 25 }]).grams).toBe(45);
  });
});

describe("'Mostrar medidas caseiras ao aluno'", () => {
  it("converte gramas na medida principal do alimento, arredondando em ½", () => {
    expect(householdApprox("Pão de forma tradicional", 50)).toBe("≈ 2 fatias");
    expect(householdApprox("Pão de forma tradicional", 62)).toBe("≈ 2 ½ fatias");
    expect(householdApprox("Banana prata (crua)", 70)).toBe("≈ 1 unidade");
    expect(householdApprox("Ovo de galinha inteiro (cru)", 150)).toBe("≈ 3 unidades");
  });

  it("sem medida cadastrada, ou fora de ½–15 medidas: não mostra nada", () => {
    expect(householdApprox("Arroz, tipo 1, cru", 100)).toBeNull();
    expect(householdApprox("Pão de forma tradicional", 5)).toBeNull();
    expect(householdApprox("Pão de forma tradicional", 1000)).toBeNull();
  });

  it("texto que já é medida caseira não ganha outra", () => {
    expect(hasHouseholdWord("2 fatias")).toBe(true);
    expect(hasHouseholdWord("120g")).toBe(false);
  });
});
