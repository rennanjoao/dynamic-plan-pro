/**
 * foodSearch.test.ts — busca de alimentos sem redundância e com equivalências seguras.
 */
import { describe, it, expect } from "vitest";
import { searchFoods, normFood } from "@/lib/foodSearch";
import { TACO_FOODS } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { ENRICHED_TO_LEGACY } from "@/data/foodTwins";
import { TACO_ALIASES, fuzzyFindTaco, resolveFiberPer100 } from "@/lib/macroCalc";
import { isCookedEntry } from "@/lib/cooking";
import { COOKED_TWINS } from "@/data/cookedTwins";

const names = (q: string, limit = 20) => searchFoods(q, limit).map((h) => h.name);
const legacy = new Map(TACO_FOODS.map((f) => [f.name, f]));
const enriched = new Map(ENRICHED_FOODS.map((f) => [f.name, f]));

describe("busca — sem redundância", () => {
  it("'Ban' mostra a banana com parênteses uma única vez, sem a versão com vírgula", () => {
    const r = names("Ban");
    expect(r).toContain("Banana prata (crua)");
    expect(r).toContain("Banana nanica (crua)");
    expect(r).not.toContain("Banana, prata, crua");
    expect(r).not.toContain("Banana, nanica, crua");
  });

  it("nenhum resultado repete alimento nem mostra nome enriquecido que tenha equivalente", () => {
    for (const q of ["ban", "arroz", "feijao", "frango", "carne", "queijo", "brocolis", "azeite", "ovo", "pao"]) {
      const r = names(q, 40);
      expect(new Set(r).size, q).toBe(r.length);
      expect(r.filter((n) => n in ENRICHED_TO_LEGACY), q).toEqual([]);
      const keys = r.map(normFood);
      expect(new Set(keys).size, `${q}: nomes equivalentes`).toBe(keys.length);
    }
  });

  it("digitar o nome enriquecido leva ao equivalente com parênteses", () => {
    expect(names("Banana, prata")[0]).toBe("Banana prata (crua)");
    expect(names("Arroz, tipo 1, cru")).toContain("Arroz branco (cru)");
  });
});

describe("busca — qualidade", () => {
  it("ignora acento e pontuação", () => {
    expect(names("feijao")).toContain("Feijão carioca (cru)");
    expect(names("maca")).toContain("Maçã fuji (com casca)");
    expect(names("pao frances")).toContain("Pão francês");
  });

  it("aceita as palavras em qualquer ordem", () => {
    expect(names("peito frango")).toContain("Frango peito s/ pele (cru)");
  });

  it("nome que começa com o digitado vem antes de quem só contém", () => {
    const r = names("arroz");
    expect(r[0].toLowerCase().startsWith("arroz")).toBe(true);
  });

  it("todo resultado tem cookFactor numérico (a tela não pode mostrar ×undefined)", () => {
    for (const q of ["ban", "arroz", "requeij", "whey", "frango"]) {
      for (const h of searchFoods(q, 40)) expect(typeof h.cookFactor, `${q}: ${h.name}`).toBe("number");
    }
  });

  it("industrializados continuam aparecendo, depois da TACO", () => {
    const r = searchFoods("requeij", 40);
    const firstInd = r.findIndex((h) => h.source === "industrial");
    expect(firstInd).toBeGreaterThan(0);
    expect(r.slice(firstInd).every((h) => h.source === "industrial")).toBe(true);
  });

  it("consulta curta demais ou só pontuação não devolve nada", () => {
    expect(searchFoods("a")).toEqual([]);
    expect(searchFoods(" , ")).toEqual([]);
  });
});

describe("equivalências enriquecido ↔ parênteses (foodTwins)", () => {
  const pairs = Object.entries(ENRICHED_TO_LEGACY);

  it("todos os nomes existem e nenhum legado é usado por dois enriquecidos", () => {
    for (const [e, l] of pairs) {
      expect(enriched.has(e), `enriquecido ausente: ${e}`).toBe(true);
      expect(legacy.has(l), `legado ausente: ${l}`).toBe(true);
    }
    expect(new Set(pairs.map(([, l]) => l)).size).toBe(pairs.length);
  });

  it("todo enriquecido com nome idêntico a um legado (sem pontuação) está no mapa", () => {
    const legacyKeys = new Set(TACO_FOODS.map((f) => normFood(f.name)));
    const missing = ENRICHED_FOODS.filter((f) => legacyKeys.has(normFood(f.name)) && !(f.name in ENRICHED_TO_LEGACY));
    expect(missing.map((f) => f.name)).toEqual([]);
  });

  it("nenhum par é cozido ↔ cru e o fator de cozimento é o mesmo nos dois lados", () => {
    for (const [e, l] of pairs) {
      const en = enriched.get(e)!;
      const lg = legacy.get(l)!;
      // Só o enriquecido pode ser "neutro" (ex.: atum em lata); cozido de verdade nunca entra no par.
      expect(isCookedEntry(en), e).toBe(false);
      expect(en.cookFactor ?? 1, `fator ${e} × ${l}`).toBe(lg.cookFactor ?? 1);
    }
  });

  it("fibra preservada ao trocar para o legado", () => {
    for (const [, l] of pairs) {
      expect(resolveFiberPer100(legacy.get(l)!).source, `fibra de ${l}`).not.toBe("missing");
    }
  });

  it("a troca nunca muda a energia de forma relevante (máx. max(8 kcal, 15%))", () => {
    for (const [e, l] of pairs) {
      const ek = enriched.get(e)!.kcal;
      const lk = legacy.get(l)!.kcal;
      expect(Math.abs(lk - ek), `${e} (${ek}) × ${l} (${lk})`).toBeLessThanOrEqual(Math.max(8, ek * 0.15));
    }
  });

  it("itens alinhados à TACO: kcal, proteína, carboidrato e gordura próximos da planilha", () => {
    for (const l of [
      "Lombo suíno (cru)", "Pernil suíno s/ osso (cru)", "Bisteca suína (crua)", "Acém (cru)", "Contra-filé (cru)",
      "Alcatra (crua)", "Coxão mole (cru)", "Manga palmer / tommy", "Uva itália / rubi", "Kiwi",
      "Brócolis (cru)", "Chuchu (cru)", "Berinjela (crua)", "Repolho branco (cru)",
    ]) {
      const e = enriched.get(Object.entries(ENRICHED_TO_LEGACY).find(([, v]) => v === l)![0])!;
      const g = legacy.get(l)!;
      expect(Math.abs(g.kcal - e.kcal), `${l} kcal`).toBeLessThanOrEqual(1);
      expect(Math.abs(g.p - e.p), `${l} p`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(g.c - e.c), `${l} c`).toBeLessThanOrEqual(0.1);
      expect(Math.abs(g.g - e.g), `${l} g`).toBeLessThanOrEqual(0.1);
    }
  });
});

describe("batata-doce crua (TACO) e regra cru → cozido", () => {
  const crua = legacy.get("Batata doce (crua)")!;
  const cozida = legacy.get("Batata doce (cozida)")!;

  it("crua tem os valores da TACO por 100 g", () => {
    expect(crua.kcal).toBe(118);
    expect(crua.p).toBe(1.3);
    expect(crua.c).toBe(28.2);
    expect(crua.g).toBe(0.1);
    expect(resolveFiberPer100(crua).value).toBeGreaterThanOrEqual(2.5);
    expect(resolveFiberPer100(crua).value).toBeLessThanOrEqual(3.5);
  });

  it("100 g crua = 150 g cozida com as MESMAS kcal (muda o peso, não a energia)", () => {
    expect(crua.cookFactor).toBe(1.5);
    const cookedGrams = 100 * (crua.cookFactor ?? 1);
    expect(cookedGrams).toBe(150);
    expect(Math.abs((cozida.kcal * cookedGrams) / 100 - crua.kcal)).toBeLessThan(0.5);
  });
});

describe("regra cru → cozido: kcal fixas, só o peso muda", () => {
  it("em todo cozido derivado, kcal por 100 g × fator = kcal do cru", () => {
    for (const [cookedKey, rawName] of Object.entries(COOKED_TWINS)) {
      const raw = legacy.get(rawName)!;
      const cooked = TACO_FOODS.find((f) => f.name.toLowerCase() === cookedKey)!;
      expect(raw, rawName).toBeTruthy();
      expect(cooked, cookedKey).toBeTruthy();
      const f = raw.cookFactor ?? 1;
      expect(Math.abs((cooked.kcal * f) - raw.kcal), `${cookedKey} × ${rawName}`).toBeLessThanOrEqual(Math.max(1, raw.kcal * 0.02));
    }
  });
});

describe("importador — nome exato do catálogo nunca vira outro alimento", () => {
  it("todo nome do catálogo legado resolve para ele mesmo", () => {
    const wrong = TACO_FOODS.filter((f) => fuzzyFindTaco(f.name)?.taco.name !== f.name).map((f) => f.name);
    expect(wrong).toEqual([]);
  });

  it("todo nome da base enriquecida resolve para si ou para o equivalente com parênteses", () => {
    const wrong = ENRICHED_FOODS.filter((f) => {
      const expected = ENRICHED_TO_LEGACY[f.name] ?? f.name;
      return fuzzyFindTaco(f.name)?.taco.name !== expected;
    }).map((f) => f.name);
    expect(wrong).toEqual([]);
  });

  it.each([
    ["Farinha, de mandioca, torrada", "Farinha, de mandioca, torrada"],
    ["Couve, manteiga, crua", "Couve, manteiga, crua"],
    ["Óleo, de soja", "Óleo, de soja"],
    ["Leite de vaca desnatado (líquido)", "Leite de vaca desnatado (líquido)"],
    ["Frango coxa+sobrecoxa c/ pele (crua)", "Frango coxa+sobrecoxa c/ pele (crua)"],
  ])("'%s' → %s", (text, expected) => {
    expect(fuzzyFindTaco(text)!.taco.name).toBe(expected);
  });

  it.each([
    ["vagem", "Vagem, crua"],
    ["agrião", "Agrião, cru"],
    ["óleo de soja", "Óleo, de soja"],
    ["couve manteiga", "Couve, manteiga, crua"],
  ])("texto livre '%s' acha item que só existe na base enriquecida", (text, expected) => {
    expect(fuzzyFindTaco(text)!.taco.name).toBe(expected);
  });
});

describe("aliases do importador", () => {
  it("todo alias aponta para um alimento que existe", () => {
    const all = new Set([...TACO_FOODS, ...ENRICHED_FOODS].map((f) => f.name));
    const bad = Object.entries(TACO_ALIASES).filter(([, target]) => !all.has(target));
    expect(bad).toEqual([]);
  });

  it("'couve' liga couve-manteiga, não couve-flor", () => {
    expect(fuzzyFindTaco("couve")!.taco.name).toBe("Couve, manteiga, crua");
  });

  it.each([
    ["laranja", "Laranja pera"],
    ["uva", "Uva itália / rubi"],
    ["manga", "Manga palmer / tommy"],
    ["tomate", "Tomate salada"],
    ["abobrinha", "Abobrinha italiana (crua)"],
  ])("'%s' → %s com confiança total", (text, expected) => {
    const r = fuzzyFindTaco(text)!;
    expect(r.taco.name).toBe(expected);
    expect(r.score).toBe(1);
  });
});
