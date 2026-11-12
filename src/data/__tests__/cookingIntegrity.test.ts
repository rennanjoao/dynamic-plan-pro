/**
 * cookingIntegrity.test.ts — integridade dos fatores cru → cozido nos catálogos.
 * Se alguém cadastrar/alterar um alimento e quebrar a pesagem do aluno, falha aqui.
 */
import { describe, it, expect } from "vitest";
import { TACO_FOODS } from "@/data/tacoFoods";
import { ENRICHED_FOODS } from "@/data/enrichedFoods";
import { isCookedEntry, fallbackCookFactor } from "@/lib/cooking";

const ALL = [...ENRICHED_FOODS.map((f) => ({ ...f, src: "enriched" })), ...TACO_FOODS.map((f) => ({ ...f, src: "legacy" }))];
const byName = (list: Array<{ name: string }>, n: string) => list.find((f) => f.name === n) as any;

describe("catálogos — estado e fator", () => {
  it("alimento JÁ cozido nunca tem fator de conversão", () => {
    const bad = ALL.filter((f) => isCookedEntry(f) && f.cookFactor !== undefined && f.cookFactor !== 1);
    expect(bad.map((f) => f.name)).toEqual([]);
  });

  it("fatores ficam em faixa plausível (0,5–3,2)", () => {
    const bad = ALL.filter((f) => typeof f.cookFactor === "number" && (f.cookFactor < 0.5 || f.cookFactor > 3.2));
    expect(bad.map((f) => `${f.name}=${f.cookFactor}`)).toEqual([]);
  });

  it("legumes e verduras não convertem (peso cozido na água/vapor ≈ cru)", () => {
    const bad = ALL.filter((f) => f.group === "veg" && f.cookFactor !== undefined && f.cookFactor !== 1);
    expect(bad.map((f) => `${f.name}=${f.cookFactor}`)).toEqual([]);
  });

  it("tubérculos não convertem: o peso CRU é o contabilizado (fator 1), exceto batata-doce", () => {
    const bad = ALL.filter(
      (f) => /^(batata|mandioca|inhame)/i.test(f.name) && !/batata,? doce/i.test(f.name) && !isCookedEntry(f) && (f.cookFactor ?? 1) !== 1,
    );
    expect(bad.map((f) => `${f.name}=${f.cookFactor}`)).toEqual([]);
  });

  it("batata-doce: TACO crua 118 kcal → cozida 77 kcal por 100 g, então 100 g crua = 150 g cozida (fator 1,5)", () => {
    const doce = ALL.filter((f) => /^batata,? doce,? \(?crua/i.test(f.name));
    expect(doce.length).toBe(2); // uma em cada catálogo
    expect(doce.map((f) => f.cookFactor)).toEqual([1.5, 1.5]);
  });

  it("frutas, laticínios, gorduras e farinhas não convertem", () => {
    const bad = ALL.filter(
      (f) => (f.group === "fruit" || f.group === "dairy" || /farinha|aveia|p[aã]o|tapioca, com/i.test(f.name)) && f.cookFactor !== undefined && f.cookFactor !== 1,
    );
    expect(bad.map((f) => `${f.name}=${f.cookFactor}`)).toEqual([]);
  });

  it("nomes únicos dentro de cada catálogo", () => {
    for (const list of [TACO_FOODS, ENRICHED_FOODS]) {
      const names = list.map((f) => f.name.toLowerCase());
      expect(names.length).toBe(new Set(names).size);
    }
  });
});

describe("mesmo alimento nos dois catálogos = mesmo fator", () => {
  // [enriquecido (TACO curado), legado]
  const SAME: Array<[string, string]> = [
    ["Arroz, tipo 1, cru", "Arroz branco (cru)"],
    ["Arroz, integral, cru", "Arroz integral (cru)"],
    ["Macarrão, trigo, cru", "Macarrão de trigo comum (cru)"],
    ["Batata, doce, crua", "Batata doce (crua)"],
    ["Batata, inglesa, crua", "Batata inglesa (crua)"],
    ["Mandioca, crua", "Mandioca / Aipim (crua)"],
    ["Inhame, cru", "Inhame (cru)"],
    ["Feijão, carioca, cru", "Feijão carioca (cru)"],
    ["Feijão, preto, cru", "Feijão preto (cru)"],
    ["Lentilha, crua", "Lentilha (crua)"],
    ["Grão-de-bico, cru", "Grão-de-bico (cru)"],
    ["Frango, peito, sem pele, cru", "Frango peito s/ pele (cru)"],
    ["Frango, sobrecoxa, sem pele, crua", "Frango coxa+sobrecoxa s/ pele (crua)"],
    ["Frango, sobrecoxa, com pele, crua", "Frango coxa+sobrecoxa c/ pele (crua)"],
    ["Ovo, de galinha, inteiro, cru", "Ovo de galinha inteiro (cru)"],
    ["Carne, bovina, patinho, sem gordura, cru", "Patinho (cru)"],
    ["Carne, bovina, acém, sem gordura, cru", "Acém (cru)"],
    ["Carne, bovina, contra-filé, sem gordura, cru", "Contra-filé (cru)"],
    ["Carne, bovina, picanha, sem gordura, crua", "Picanha s/ gordura (crua)"],
    ["Carne, bovina, picanha, com gordura, crua", "Picanha c/ gordura (crua)"],
    ["Carne, bovina, coxão mole, sem gordura, cru", "Coxão mole (cru)"],
    ["Porco, lombo, cru", "Lombo suíno (cru)"],
    ["Porco, pernil, cru", "Pernil suíno s/ osso (cru)"],
    ["Porco, bisteca, crua", "Bisteca suína (crua)"],
    ["Salmão, sem pele, fresco, cru", "Salmão s/ pele (cru)"],
    ["Merluza, filé, cru", "Merluza / Pescada (crua)"],
    ["Brócolis, cru", "Brócolis (cru)"],
    ["Couve-flor, crua", "Couve-flor (crua)"],
    ["Cenoura, crua", "Cenoura (crua)"],
    ["Abobrinha, italiana, crua", "Abobrinha italiana (crua)"],
    ["Abóbora, cabotian, crua", "Abóbora cabotian (crua)"],
    ["Chuchu, cru", "Chuchu (cru)"],
    ["Beterraba, crua", "Beterraba (crua)"],
    ["Berinjela, crua", "Berinjela (crua)"],
  ];

  it.each(SAME)("%s ≡ %s", (enrichedName, legacyName) => {
    const e = byName(ENRICHED_FOODS, enrichedName);
    const l = byName(TACO_FOODS, legacyName);
    expect(e, `não achei (enriquecido) ${enrichedName}`).toBeTruthy();
    expect(l, `não achei (legado) ${legacyName}`).toBeTruthy();
    expect(e.cookFactor ?? 1, `${enrichedName} × ${legacyName}`).toBe(l.cookFactor ?? 1);
  });
});

describe("fator reproduz o par cru/cozido da própria base (±10%)", () => {
  // Só alimentos em que o par é fisicamente consistente (kcal ≈ proteína).
  // Feijões ficam de fora: o cozido da TACO inclui caldo (76 kcal) e o fator vale para grãos ESCORRIDOS.
  const PAIRS: Array<[string, string]> = [
    ["Arroz branco (cru)", "Arroz branco (cozido)"],
    ["Arroz parboilizado (cru)", "Arroz parboilizado (cozido)"],
    ["Arroz integral (cru)", "Arroz integral (cozido)"],
    ["Macarrão de trigo comum (cru)", "Macarrão de trigo comum (cozido)"],
    ["Macarrão integral (cru)", "Macarrão integral (cozido)"],
    ["Macarrão de arroz (cru)", "Macarrão de arroz (cozido)"],
    ["Lentilha (crua)", "Lentilha (cozida)"],
    ["Quinoa (crua)", "Quinoa (cozida)"],
    ["Grão-de-bico (cru)", "Grão-de-bico (cozido)"],
  ];
  it.each(PAIRS)("%s", (rawName, cookedName) => {
    const r = byName(TACO_FOODS, rawName);
    const c = byName(TACO_FOODS, cookedName);
    const implied = r.kcal / c.kcal;
    expect(Math.abs(r.cookFactor - implied) / implied).toBeLessThanOrEqual(0.1);
  });

  it("feijão: grãos cozidos e escorridos (~2,4× — USDA feijão-pinto 347→143 kcal)", () => {
    for (const n of ["Feijão carioca (cru)", "Feijão preto (cru)"]) {
      const f = byName(TACO_FOODS, n).cookFactor;
      expect(f).toBeGreaterThanOrEqual(2.2);
      expect(f).toBeLessThanOrEqual(2.7);
    }
  });
});

describe("fallback de itens digitados à mão acompanha o catálogo", () => {
  it("não devolve fator diferente do catálogo para o mesmo alimento", () => {
    expect(fallbackCookFactor("arroz integral")).toBe(byName(TACO_FOODS, "Arroz integral (cru)").cookFactor);
    expect(fallbackCookFactor("feijão")).toBe(byName(TACO_FOODS, "Feijão carioca (cru)").cookFactor);
  });
});

// ─── O guia de importação (prompt para IA / coach) não pode divergir do catálogo ───────────────
import guideSource from "@/components/coach/ProtocolImportExport.tsx?raw";

describe("guia de importação (_taco_guide) acompanha o catálogo", () => {
  it("todo cookFactor citado no guia é igual ao do catálogo", () => {
    const re = /"([^"]+)":\s*\{\s*cookFactor:\s*([\d.]+)/g;
    const diffs: string[] = [];
    let m: RegExpExecArray | null;
    let seen = 0;
    while ((m = re.exec(guideSource))) {
      const food = TACO_FOODS.find((f) => f.name === m![1]);
      if (!food) continue; // nome informal do guia sem entrada exata
      seen++;
      const want = food.cookFactor ?? 1;
      if (Math.abs(want - Number(m[2])) > 1e-9) diffs.push(`${m[1]}: guia=${m[2]} catálogo=${want}`);
    }
    expect(seen).toBeGreaterThan(50);
    expect(diffs).toEqual([]);
  });
});
