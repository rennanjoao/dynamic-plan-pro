/**
 * macroCalcCookState.test.ts — o vínculo do importador respeita cru/cozido do TEXTO.
 * Antes: "Arroz cozido 150g" virava "Arroz branco (cru)" com 150 g CRUS (macros 2,7× maiores).
 */
import { describe, it, expect } from "vitest";
import { fuzzyFindTaco, resolveAlias } from "@/lib/macroCalc";
import { isCookedEntry } from "@/lib/cooking";

const link = (t: string) => fuzzyFindTaco(t)!;

describe("importador — texto cozido liga entrada cozida", () => {
  it.each([
    ["Arroz cozido", "Arroz branco (cozido)"],
    ["Arroz branco cozido", "Arroz branco (cozido)"],
    ["Arroz integral cozido", "Arroz integral (cozido)"],
    ["Feijão cozido", "Feijão carioca (cozido)"],
    ["Feijão preto cozido", "Feijão preto (cozido)"],
    ["Batata doce cozida", "Batata doce (cozida)"],
    ["Macarrão cozido", "Macarrão de trigo comum (cozido)"],
    ["Macarrão integral cozido", "Macarrão integral (cozido)"],
    ["Lentilha cozida", "Lentilha (cozida)"],
    ["Quinoa cozida", "Quinoa (cozida)"],
    ["Cenoura cozida", "Cenoura (cozida)"],
    ["Inhame cozido", "Inhame (cozido)"],
    ["Tilápia cozida", "Tilápia (grelhada/assada)"],
    ["Frango grelhado", "Frango peito s/ pele (grelhado)"],
  ])("%s → %s", (text, expected) => {
    const r = link(text);
    expect(r.taco.name).toBe(expected);
    expect(isCookedEntry(r.taco)).toBe(true);
    expect(r.stateMismatch).toBeUndefined();
  });
});

describe("importador — texto cru liga entrada crua", () => {
  it.each([
    ["Frango cru", "Frango peito s/ pele (cru)"],
    ["Patinho cru", "Patinho (cru)"],
    ["Brócolis cru", "Brócolis (cru)"],
    ["Banana crua", "Banana prata (crua)"],
  ])("%s → %s", (text, expected) => {
    expect(link(text).taco.name).toBe(expected);
  });
});

describe("importador — texto sem estado segue a regra 'coach prescreve cru'", () => {
  it.each([
    ["Arroz", "Arroz branco (cru)"],
    ["Arroz integral", "Arroz integral (cru)"],
    ["Frango cru", "Frango peito s/ pele (cru)"],
  ])("%s → %s", (text, expected) => {
    expect(link(text).taco.name).toBe(expected);
  });
});

describe("alias parcial vence o mais específico", () => {
  it("'arroz integral …' não cai em 'arroz' (arroz branco)", () => {
    expect(resolveAlias("arroz integral com legumes")).toBe("Arroz integral (cru)");
  });
});
