import { describe, expect, it } from "vitest";
import { parseFoodQuantity, findFoodByName, parseWeightString } from "../macroCalc";
import { householdApprox, hasHouseholdWord } from "../householdMeasures";
import { HOUSEHOLD_MEASURES, UNIT_WEIGHT_REMOVED, measureKey } from "@/data/householdMeasures";
import { ENRICHED_TO_LEGACY } from "@/data/foodTwins";

const q = (food: string, text: string) => parseFoodQuantity(findFoodByName(food), text);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const food = (name: string): any => findFoodByName(name);

describe("lista de medidas (IBGE) — integridade", () => {
  const entries = Object.entries(HOUSEHOLD_MEASURES);

  it("todo alimento da lista existe no catálogo", () => {
    for (const [name] of entries) expect(findFoodByName(name), name).toBeTruthy();
  });

  it("toda medida é lida pelo parser do alimento e dá exatamente os gramas da lista", () => {
    for (const [name, measures] of entries) {
      for (const m of measures) {
        const r = q(name, m.label);
        expect(r.status, `${name} · ${m.label}`).toBe("ok");
        expect(r.grams, `${name} · ${m.label}`).toBeCloseTo(m.grams, 6);
      }
    }
  });

  it("toda medida tem fonte; as do IBGE trazem o código do alimento e a linha da tabela", () => {
    for (const [name, measures] of entries) {
      for (const m of measures) {
        expect(m.source, `${name} · ${m.label}`).toBeTruthy();
        if (m.source.startsWith("IBGE")) expect(m.ref, `${name} · ${m.label}`).toMatch(/^\d{7} \S/);
      }
    }
  });

  it("alimento cru não recebe medida de alimento pronto, e pronto não recebe de cru", () => {
    const cooked = /cozid|assad|grelhad|frit|ensopad|refogad|mexid|enlatad/;
    for (const [name, measures] of entries) {
      const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const isRaw = /\bcru[ao]?\b|\(cru/.test(n);
      const isCooked = /cozid|assad|grelhad|refogad|desfiad|preparad|frit/.test(n);
      for (const m of measures) {
        const ref = String(m.ref ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        if (isRaw) expect(ref, `${name} · ${m.label}`).not.toMatch(cooked);
        if (isCooked) expect(ref, `${name} · ${m.label}`).not.toMatch(/\bcru[ao]?\b/);
      }
    }
  });

  it("nenhum alimento tem a mesma medida duas vezes, e '1 unidade' = peso da unidade", () => {
    const names = new Set([...Object.keys(HOUSEHOLD_MEASURES), ...Object.keys(ENRICHED_TO_LEGACY), ...Object.values(ENRICHED_TO_LEGACY)]);
    for (const name of names) {
      const f = food(name);
      if (!f?.portions) continue;
      const keys = f.portions.map((p: { label: string }) => `${p.label.trim().split(/\s+/)[0]}|${measureKey(p.label)}`);
      expect(new Set(keys).size, name).toBe(keys.length);
      const unit = f.portions.find((p: { label: string }) => /^1 unidade$/.test(p.label));
      if (unit) expect(f.unitWeight, name).toBe(unit.grams);
    }
  });

  it("pares de nomes têm as mesmas medidas e o mesmo peso da unidade", () => {
    for (const [e, l] of Object.entries(ENRICHED_TO_LEGACY)) {
      const fe = food(e);
      const fl = food(l);
      if (!fe || !fl) continue;
      expect(fe.portions, `${e} ↔ ${l}`).toEqual(fl.portions);
      expect(fe.unitWeight, `${e} ↔ ${l}`).toEqual(fl.unitWeight);
    }
  });

  it("pesos de '1 unidade' que eram outra medida saíram (também do par de nome)", () => {
    const twinOf = new Map<string, string>();
    for (const [e, l] of Object.entries(ENRICHED_TO_LEGACY)) { twinOf.set(e, l); twinOf.set(l, e); }
    for (const name of UNIT_WEIGHT_REMOVED) {
      expect(food(name), name).toBeTruthy();
      expect(food(name).unitWeight, name).toBeUndefined();
      const twin = twinOf.get(name);
      if (twin && food(twin)) expect(food(twin).unitWeight, twin).toBeUndefined();
      expect(q(name, "1 unidade").status, name).toBe("no-weight");
    }
  });
});

describe("medidas revisadas: valores que o coach usa", () => {
  it("óleos: colher de sopa do IBGE (8 g); ml pela densidade", () => {
    expect(q("Azeite de oliva extra virgem", "1 colher de sopa")).toMatchObject({ status: "ok", grams: 8 });
    expect(q("Azeite, de oliva, extra virgem", "2 colheres de chá")).toMatchObject({ status: "ok", grams: 4 });
    expect(q("Óleo de coco", "1 colher de sopa").grams).toBe(8);
    expect(q("Azeite de oliva extra virgem", "10 ml").grams).toBe(9.1);
    expect(q("Azeite de oliva extra virgem", "1 xícara")).toMatchObject({ status: "no-weight", grams: 0 });
  });

  it("manteiga e requeijão: ponta de faca e colheres", () => {
    expect(q("Manteiga integral (com ou s/ sal)", "2 pontas de faca")).toMatchObject({ status: "ok", grams: 10 });
    expect(q("Manteiga integral (com ou s/ sal)", "1 colher de chá").grams).toBe(8);
    expect(q("Requeijão cremoso tradicional", "1 colher de sopa").grams).toBe(30);
    expect(q("Requeijão Light Tirolez", "1 colher de sopa").grams).toBe(30);
    expect(q("Requeijão Light Tirolez", "1 ponta de faca").grams).toBe(6);
  });

  it("queijos por fatia; frescal tem fatia própria (30 g); cottage por colher", () => {
    expect(q("Queijo Muçarela", "2 fatias").grams).toBe(40);
    expect(q("Queijo Prato", "1 fatia").grams).toBe(15);
    expect(q("Queijo Minas Frescal", "2 fatias").grams).toBe(60);
    expect(q("Queijo, minas, frescal", "1 fatia").grams).toBe(30);
    expect(q("Queijo Minas Padrão", "1 fatia").grams).toBe(45);
    expect(q("Queijo Cottage", "1 colher de sopa").grams).toBe(44);
    expect(q("Queijo Coalho", "1 unidade").status).toBe("no-weight");
  });

  it("frutas pela unidade média do IBGE", () => {
    expect(q("Banana prata (crua)", "1 unidade").grams).toBe(75);
    expect(q("Banana, prata, crua", "2 unidades").grams).toBe(150);
    expect(q("Banana nanica (crua)", "1 unidade").grams).toBe(80); // sem medida própria no IBGE: fica a do cadastro
    expect(q("Maçã fuji (com casca)", "1 unidade").grams).toBe(150);
    expect(q("Abacaxi", "1 fatia").grams).toBe(75);
    expect(q("Abacaxi", "1 unidade").grams).toBe(750);
  });

  it("leite e suco: copo e xícara de 200 ml (ANVISA) — batem com '200 ml'", () => {
    expect(q("Leite de vaca integral (líquido)", "1 copo").grams).toBe(206);
    expect(q("Leite de vaca integral (líquido)", "200 ml").grams).toBe(206);
    expect(q("Suco de laranja pera (integral)", "1 xícara").grams).toBe(210);
    expect(q("Suco de laranja pera (integral)", "1 unidade").status).toBe("no-weight");
  });

  it("carnes: bife de fígado, filé de frango, fatia de pernil; ovo continua 50 g", () => {
    expect(q("Fígado bovino (grelhado)", "1 bife").grams).toBe(100);
    expect(q("Fígado bovino (cozido)", "1 fatia").status).toBe("no-weight");
    expect(q("Frango peito s/ pele (grelhado)", "1 filé").grams).toBe(100);
    expect(q("Pernil suíno (assado)", "2 fatias").grams).toBe(84);
    expect(q("Ovo de galinha inteiro (cozido)", "1 unidade").grams).toBe(50);
    expect(q("Ovo de galinha inteiro (cozido)", "2 ovos").grams).toBe(100);
  });

  it("suplementos: scoop", () => {
    expect(q("Albumina em pó", "1 scoop").grams).toBe(30);
    expect(q("Whey Protein Concentrado (80%)", "2 scoops").grams).toBe(60);
    expect(q("Whey Protein Concentrado (80%)", "1 unidade").status).toBe("no-weight");
  });

  it("itens sem medida confiável ficam só com gramas", () => {
    expect(food("Mandioquinha / Chuchu (cozido)").portions).toBeUndefined();
    expect(q("Arroz branco (cru)", "1 colher de sopa").status).toBe("no-weight");
    expect(q("Leite de coco (garrafinha)", "1 colher de sopa").status).toBe("no-weight");
  });
});

describe("medidas: peso da unidade só vale para 'unidade'", () => {
  it("'1 colher de sopa' não herda o peso de 1 banana", () => {
    expect(q("Banana nanica (crua)", "1 colher de sopa")).toMatchObject({ status: "no-weight", grams: 0 });
  });

  it("a palavra do próprio alimento vale como unidade (1 ovo, 2 castanhas)", () => {
    expect(q("Ovo de galinha inteiro (cozido)", "2 ovos")).toMatchObject({ status: "ok", grams: 100 });
    expect(q("Castanha do Pará / Brasil", "3 castanhas")).toMatchObject({ status: "ok", grams: 12 });
  });

  it("pão de forma: fatia = 25 g (o IBGE chama de 'unidade'); nomes duplicados têm as mesmas medidas", () => {
    expect(q("Pão de forma tradicional", "2 fatias")).toMatchObject({ status: "ok", grams: 50 });
    expect(q("Pão, trigo, forma, integral", "1 unidade")).toMatchObject({ status: "ok", grams: 25 });
    expect(q("Ovo, de galinha, inteiro, cru", "1 unidade")).toMatchObject({ status: "ok", grams: 50 });
  });
});

describe("colher sem dizer qual", () => {
  it("'1 colher' é a colher de sopa quando o alimento tem colher de sopa", () => {
    expect(q("Arroz branco (cozido)", "2 colheres")).toMatchObject({ status: "ok", grams: 50, canonicalText: "2 colheres de sopa" });
    expect(q("Arroz branco (cozido)", "1 colher de arroz").grams).toBe(45);
    expect(q("Arroz branco (cozido)", "1 colher de servir").grams).toBe(45);
  });

  it("sem colher de sopa e com mais de uma colher, pede para dizer qual", () => {
    const r = parseWeightString("1 colher", undefined, [{ label: "1 colher de chá", grams: 2 }, { label: "1 colher de sobremesa", grams: 5 }]);
    expect(r).toMatchObject({ status: "no-weight", grams: 0 });
    expect(r.hint).toMatch(/Diga qual colher: colher de chá, colher de sobremesa/);
  });

  it("uma colher só: vale ela", () => {
    expect(q("Pasta de amendoim integral", "1 colher")).toMatchObject({ status: "ok", grams: 20 });
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
  it("concha, escumadeira, colher de servir/arroz, ponta de faca", () => {
    for (const t of ["1 concha", "2 escumadeiras", "1 colher de servir", "1 colher de arroz", "1 ponta de faca"]) {
      expect(parseWeightString(t, undefined, undefined).status, t).toBe("no-weight");
    }
    expect(parseWeightString("2 conchas", undefined, [{ label: "1 concha", grams: 80 }])).toMatchObject({ status: "ok", grams: 160 });
    expect(parseWeightString("1 colher de servir", undefined, [{ label: "1 colher de servir", grams: 45 }, { label: "1 colher de sopa", grams: 25 }]).grams).toBe(45);
  });
});

describe("'Mostrar medidas caseiras ao aluno' — medida mais natural", () => {
  it("arroz: colher de sopa até 6; acima disso, colher de servir", () => {
    expect(householdApprox("Arroz branco (cozido)", 120)).toBe("≈ 5 colheres de sopa");
    expect(householdApprox("Arroz branco (cozido)", 180)).toBe("≈ 4 colheres de servir");
  });

  it("feijão: concha; banana: unidade, ou fatias quando é pouco", () => {
    expect(householdApprox("Feijão carioca (cozido)", 140)).toBe("≈ 1 concha");
    expect(householdApprox("Banana prata (crua)", 150)).toBe("≈ 2 unidades");
    expect(householdApprox("Banana prata (crua)", 50)).toBe("≈ 2 fatias");
  });

  it("peças: filé, scoop, ponta de faca, copo", () => {
    expect(householdApprox("Frango peito s/ pele (grelhado)", 150)).toBe("≈ 1 ½ filés");
    expect(householdApprox("Whey Protein Concentrado (80%)", 30)).toBe("≈ 1 scoop");
    expect(householdApprox("Manteiga integral (com ou s/ sal)", 10)).toBe("≈ 2 pontas de faca");
    expect(householdApprox("Leite de vaca integral (líquido)", 200)).toBe("≈ 1 copo");
  });

  it("pão de forma: unidade = fatia, mostra fatias", () => {
    expect(householdApprox("Pão de forma tradicional", 50)).toBe("≈ 2 fatias");
    expect(householdApprox("Pão de forma tradicional", 62)).toBe("≈ 2 ½ fatias");
    expect(householdApprox("Ovo de galinha inteiro (cru)", 150)).toBe("≈ 3 unidades");
  });

  it("sem medida, ou nenhuma perto o bastante dos gramas: não mostra nada", () => {
    expect(householdApprox("Arroz branco (cru)", 100)).toBeNull();
    expect(householdApprox("Pão de forma tradicional", 5)).toBeNull();
    expect(householdApprox("Pão de forma tradicional", 1000)).toBeNull();
    expect(householdApprox("Frango peito s/ pele (grelhado)", 120)).toBeNull(); // 1 filé = 100 g: 17% longe
  });

  it("texto que já é medida caseira não ganha outra", () => {
    expect(hasHouseholdWord("2 fatias")).toBe(true);
    expect(hasHouseholdWord("1 ponta de faca")).toBe(true);
    expect(hasHouseholdWord("120g")).toBe(false);
  });
});
