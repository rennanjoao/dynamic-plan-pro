/**
 * cooking.test.ts — protege a regra de produto:
 * o coach prescreve CRU; o aluno pode ver COZIDO; isso não pode alterar a pesagem.
 */
import { describe, it, expect } from "vitest";
import {
  cookInfo,
  cookMultiplier,
  convertGrams,
  displayFoodName,
  fallbackCookFactor,
  hasCookedMarker,
  hasRawMarker,
  isCookedEntry,
} from "@/lib/cooking";

describe("cookInfo — catálogo", () => {
  it("alimento cru com fator converte", () => {
    const i = cookInfo("Arroz branco (cru)");
    expect(i.state).toBe("raw");
    expect(i.factor).toBe(2.7);
  });

  it("alimento já cozido NUNCA converte (valuesArCooked)", () => {
    for (const n of ["Arroz branco (cozido)", "Frango peito s/ pele (grelhado)", "Feijão carioca (cozido)", "Cuscuz de milho (preparado)"]) {
      const i = cookInfo(n);
      expect(i.state, n).toBe("cooked");
      expect(i.factor, n).toBe(1);
    }
  });

  it("fruta, folha, aveia e pão: fator 1, nada a converter", () => {
    for (const n of ["Banana prata (crua)", "Aveia em flocos", "Pão francês", "Brócolis (cru)", "Espinafre (cru)", "Cenoura (crua)"]) {
      expect(cookInfo(n).factor, n).toBe(1);
    }
  });

  it("nomes do catálogo enriquecido também resolvem", () => {
    expect(cookInfo("Arroz, tipo 1, cru").factor).toBe(2.7);
    expect(cookInfo("Frango, peito, sem pele, cru").factor).toBe(0.7);
    expect(cookInfo("Brócolis, cru").factor).toBe(1);
  });

  it("é case-insensitive e ignora HTML", () => {
    expect(cookInfo("  ARROZ BRANCO (CRU) ").factor).toBe(2.7);
    expect(cookInfo("<b>Arroz branco (cru)</b>").factor).toBe(2.7);
  });
});

describe("cookInfo — itens digitados à mão (sem vínculo)", () => {
  it("nome que já diz cozido/grelhado NÃO é convertido de novo", () => {
    for (const n of ["Arroz cozido", "Arroz branco cozido", "Frango grelhado", "Batata cozida", "Macarrão cozido", "Feijão cozido", "Tilápia grelhada", "Inhame cozido", "Carne moída refogada"]) {
      const i = cookInfo(n);
      expect(i.state, n).toBe("cooked");
      expect(i.factor, n).toBe(1);
    }
  });

  it("nome sem estado cai no fallback por família (coach prescreve cru)", () => {
    expect(cookInfo("Arroz").factor).toBe(2.7);
    expect(cookInfo("Frango").factor).toBe(0.7);
    expect(cookInfo("Macarrão").factor).toBe(2.5);
  });

  it("batata, mandioca e inhame: peso cru é o contabilizado — nada a converter", () => {
    for (const n of ["Batata inglesa (crua)", "Batata doce (crua)", "Mandioca / Aipim (crua)", "Inhame (cru)", "Batata, inglesa, crua", "Mandioca, crua"]) {
      expect(cookInfo(n).factor, n).toBe(1);
      expect(displayFoodName(n, true), n).toBe(n);
    }
    expect(fallbackCookFactor("Batata")).toBe(1);
    expect(fallbackCookFactor("Mandioca")).toBe(1);
  });

  it("peito de peru frio / frios não convertem", () => {
    expect(fallbackCookFactor("Peito de peru")).toBe(1);
    expect(fallbackCookFactor("Presunto")).toBe(1);
    expect(fallbackCookFactor("Atum em lata")).toBe(1);
  });

  it("fallback usa os MESMOS números do catálogo", () => {
    const pairs: Array<[string, string]> = [
      ["Arroz branco", "Arroz branco (cru)"],
      ["Arroz integral", "Arroz integral (cru)"],
      ["Arroz parboilizado", "Arroz parboilizado (cru)"],
      ["Macarrão de arroz", "Macarrão de arroz (cru)"],
      ["Macarrão", "Macarrão de trigo comum (cru)"],
      ["Feijão carioca", "Feijão carioca (cru)"],
      ["Feijão preto", "Feijão preto (cru)"],
      ["Lentilha", "Lentilha (crua)"],
      ["Grão de bico", "Grão-de-bico (cru)"],
      ["Quinoa", "Quinoa (crua)"],
      ["Frango peito", "Frango peito s/ pele (cru)"],
      ["Salmão", "Salmão s/ pele (cru)"],
      ["Batata doce", "Batata doce (crua)"],
    ];
    for (const [typed, cat] of pairs) {
      expect(fallbackCookFactor(typed), `${typed} ↔ ${cat}`).toBe(cookInfo(cat).factor);
    }
  });
});

describe("marcadores de estado", () => {
  it("detecta cru e cozido", () => {
    expect(hasRawMarker("Arroz (cru)")).toBe(true);
    expect(hasRawMarker("Banana (crua)")).toBe(true);
    expect(hasRawMarker("Cruz")).toBe(false);
    expect(hasCookedMarker("Frango (grelhado)")).toBe(true);
    expect(hasCookedMarker("Brócolis (cozido/vapor)")).toBe(true);
    expect(hasCookedMarker("Arroz (cru)")).toBe(false);
  });
  it("isCookedEntry respeita a flag e o nome", () => {
    expect(isCookedEntry({ name: "X", valuesArCooked: true })).toBe(true);
    expect(isCookedEntry({ name: "Frango (grelhado)" })).toBe(true);
    expect(isCookedEntry({ name: "Frango (cru)" })).toBe(false);
  });
});

describe("tela do aluno — peso e nome andam juntos", () => {
  it("modo Cru: nome e peso exatamente como o coach prescreveu", () => {
    expect(displayFoodName("Arroz branco (cru)", false)).toBe("Arroz branco (cru)");
    expect(cookMultiplier("Arroz branco (cru)", false)).toBe(1);
  });

  it("modo Cozido: peso convertido E nome trocado para cozido (nunca '(cru)' com peso cozido)", () => {
    expect(cookMultiplier("Arroz branco (cru)", true)).toBe(2.7);
    expect(convertGrams(100, 2.7)).toBe(270);
    expect(displayFoodName("Arroz branco (cru)", true)).toBe("Arroz branco (cozido)");
    expect(displayFoodName("Arroz, tipo 1, cru", true)).toBe("Arroz, tipo 1, cozido");
    expect(displayFoodName("Frango, sobrecoxa, sem pele, crua", true)).toBe("Frango, sobrecoxa, sem pele, cozida");
    expect(displayFoodName("Feijão, carioca, cru", true)).toBe("Feijão, carioca, cozido");
  });

  it("modo Cozido: nome sem marcador ganha '(cozido)'; tapioca vira hidratada", () => {
    expect(displayFoodName("Arroz", true)).toBe("Arroz (cozido)");
    expect(displayFoodName("Tapioca (goma seca/polvilho)", true)).toBe("Tapioca (goma hidratada)");
  });

  it("modo Cozido: o que não converte mantém nome e peso", () => {
    expect(displayFoodName("Banana prata (crua)", true)).toBe("Banana prata (crua)");
    expect(displayFoodName("Brócolis (cru)", true)).toBe("Brócolis (cru)");
    expect(displayFoodName("Aveia em flocos", true)).toBe("Aveia em flocos");
    expect(cookMultiplier("Banana prata (crua)", true)).toBe(1);
  });

  it("modo Cozido: alimento já cozido mantém nome e peso", () => {
    expect(displayFoodName("Arroz branco (cozido)", true)).toBe("Arroz branco (cozido)");
    expect(displayFoodName("Frango peito s/ pele (grelhado)", true)).toBe("Frango peito s/ pele (grelhado)");
    expect(cookMultiplier("Arroz branco (cozido)", true)).toBe(1);
  });

  it("ida e volta cru → cozido → cru fecha dentro de 1 g para porções reais", () => {
    for (const n of ["Arroz branco (cru)", "Feijão carioca (cru)", "Frango peito s/ pele (cru)", "Macarrão de trigo comum (cru)"]) {
      const f = cookInfo(n).factor;
      for (const g of [30, 60, 100, 150, 200, 300]) {
        const back = convertGrams(g, f) / f;
        expect(Math.abs(back - g), `${n} ${g}g`).toBeLessThanOrEqual(0.5 / f + 1e-9);
      }
    }
  });
});
