import { describe, it, expect } from "vitest";
import {
  AMENDOIM,
  CATEGORIAS,
  CRAVINGS,
  GRUPOS,
  INGREDIENTES,
  LIMITE_GORDURA_FIXA_G,
  LIMITE_GORDURA_PADRAO_G,
  LIMITE_GORDURA_TROCA_G,
  LIMITE_KCAL_SNACK,
  LIMITE_KCAL_TROCA,
  MAX_PORCAO_FIXA,
  OLEAGINOSAS_PROIBIDAS,
  calcularMacros,
  type Craving,
} from "../cravings";
import { TACO_FOODS } from "../tacoFoods";

/** kcal, P, C, G de cada opção (a primeira é a padrão). Conferência independente dos ingredientes. */
const GOLDEN: Record<string, [number, number, number, number][]> = {
  "cha-mel": [[22, 0.0, 5.7, 0.0]],
  "palitos-pepino-cenoura": [[44, 2.2, 9.7, 0.3]],
  "doce-banana-zero": [[64, 0.8, 16.5, 0.2]],
  "cafe-leite-mel": [[64, 4.1, 11.6, 0.2]],
  "uva-congelada": [[68, 0.6, 17.3, 0.1]],
  "picole-caseiro": [[45, 0.9, 11.3, 0.2], [45, 1.4, 10.2, 0.5], [72, 1.4, 18.5, 0.2]],
  "maca-assada": [[73, 0.4, 19.8, 0.0]],
  "ameixa-seca": [[84, 0.8, 22.4, 0.1]],
  "tamaras": [[85, 0.8, 22.5, 0.1]],
  "chocolate-quente-fit": [[86, 6.1, 15.8, 1.0], [125, 5.7, 15.4, 5.5]],
  "abacaxi-grelhado": [[86, 1.6, 22.1, 0.2]],
  "melancia-gelada": [[90, 1.8, 22.5, 0.3]],
  "batata-airfryer": [[96, 1.8, 22.1, 0.2]],
  "sorvete-banana-morango": [[104, 1.8, 27.2, 0.3]],
  "morango-leite-moca": [[108, 2.9, 21.6, 1.8]],
  "queijo-goiabada-zero": [[108, 5.3, 13.0, 6.1]],
  "pipoca-agua": [[113, 3.9, 22.3, 1.3], [150, 5.2, 29.7, 1.7], [188, 6.5, 37.2, 2.2]],
  "iogurte-gelado-morango": [[122, 7.9, 22.6, 0.5]],
  "doce-leite-zero": [[53, 2.0, 9.9, 0.6]],
  "pessego-calda": [[63, 0.7, 16.9, 0.0]],
  "doce-abobora": [[80, 0.4, 21.8, 0.1]],
  "doce-batata": [[91, 0.0, 23.6, 0.0]],
  "goiabada-cascao": [[100, 0.0, 24.9, 0.0]],
  "pao-integral-doce-leite": [[112, 3.5, 23.9, 1.0], [61, 1.9, 13.3, 0.5]],
  "brigadeiro-proteico": [[113, 11.0, 18.4, 1.6]],
  "doce-mocoto": [[120, 3.0, 28.0, 0.0]],
  "tapioca-geleia": [[120, 0.1, 29.6, 0.1]],
  "morango-chocolate-70": [[127, 2.9, 16.0, 5.9]],
  "torrada-tomate": [[136, 4.9, 26.8, 1.1]],
  "beijinho-coco": [[137, 7.8, 12.4, 6.2]],
  "gelatina-zero": [[10, 2.2, 0.2, 0.0], [46, 5.8, 5.4, 0.1]],
  "picole-fruta": [[56, 1.2, 12.0, 0.0], [61, 0.0, 15.0, 0.0], [67, 0.0, 16.8, 0.0]],
  "pacoca-zero": [[85, 4.0, 5.5, 6.0]],
  "bombom": [[105, 1.2, 13.0, 6.3]],
  "suspiro": [[107, 1.9, 25.8, 0.0], [161, 2.8, 38.7, 0.0], [215, 3.7, 51.5, 0.1]],
  "chocolate-ao-leite": [[108, 1.4, 11.9, 6.1]],
  "sobremesa-proteica": [[108, 15.0, 9.2, 1.3]],
  "chocolate-70": [[109, 2.0, 7.8, 7.2]],
  "whey-chocolate-gelado": [[120, 24.0, 2.4, 1.8]],
  "barrinha-proteina": [[123, 10.0, 9.5, 5.0]],
  "biscoito-arroz-geleia": [[136, 2.3, 30.0, 0.9]],
  "minis-chocolate": [[85, 1.5, 11.0, 4.0], [113, 2.0, 14.7, 5.3], [142, 2.5, 18.3, 6.7]],
  "crepioca-doce": [[238, 9.4, 26.9, 11.7]],
  "panqueca-proteica": [[391, 28.7, 49.2, 10.1]],
  "bife-pao-frances": [[464, 40.5, 31.6, 19.2], [456, 42.0, 30.6, 18.0]],
  "hamburguer-artesanal": [[456, 48.6, 32.3, 14.1], [492, 48.7, 34.1, 17.4]],
  "panqueca-banana": [[239, 10.6, 37.9, 6.6]],
  "doce-fit-uva-whey": [[330, 38.8, 40.1, 2.2], [398, 39.4, 57.4, 2.3], [446, 39.9, 63.7, 5.3]],
};

const ORDEM_ESPERADA: Record<string, string[]> = {
  natural: ["cha-mel", "palitos-pepino-cenoura", "picole-caseiro", "cafe-leite-mel", "doce-banana-zero", "uva-congelada", "maca-assada", "ameixa-seca", "tamaras", "abacaxi-grelhado", "chocolate-quente-fit", "melancia-gelada", "batata-airfryer", "sorvete-banana-morango", "morango-leite-moca", "queijo-goiabada-zero", "pipoca-agua", "iogurte-gelado-morango"],
  caseiro: ["doce-leite-zero", "pao-integral-doce-leite", "pessego-calda", "doce-abobora", "doce-batata", "goiabada-cascao", "brigadeiro-proteico", "doce-mocoto", "tapioca-geleia", "morango-chocolate-70", "torrada-tomate", "beijinho-coco"],
  industrializado: ["gelatina-zero", "picole-fruta", "minis-chocolate", "pacoca-zero", "bombom", "suspiro", "chocolate-ao-leite", "sobremesa-proteica", "chocolate-70", "whey-chocolate-gelado", "barrinha-proteina", "biscoito-arroz-geleia"],
  troca: ["crepioca-doce", "panqueca-banana", "doce-fit-uva-whey", "panqueca-proteica", "bife-pao-frances", "hamburguer-artesanal"],
};

const textoDe = (c: Craving) =>
  [
    c.titulo,
    c.resumo,
    c.dica ?? "",
    ...c.preparo,
    ...(c.extras ?? []),
    ...c.opcoes.flatMap((o) => [o.rotulo, ...o.ingredientes.map((l) => `${INGREDIENTES[l.id].nome} ${l.medida ?? ""}`)]),
  ].join(" | ");

const porId = (id: string) => CRAVINGS.find((c) => c.id === id)!;
const snacks = CRAVINGS.filter((c) => c.grupo !== "troca");
const trocas = CRAVINGS.filter((c) => c.grupo === "troca");

describe("S.O.S TPM — lista de opções", () => {
  it("tem as 48 opções, com ids únicos, e a contagem certa por grupo", () => {
    expect(CRAVINGS).toHaveLength(48);
    expect(new Set(CRAVINGS.map((c) => c.id)).size).toBe(48);
    const contagem = Object.fromEntries(GRUPOS.map((g) => [g.id, CRAVINGS.filter((c) => c.grupo === g.id).length]));
    expect(contagem).toEqual({ natural: 18, caseiro: 12, industrializado: 12, troca: 6 });
    for (const cat of CATEGORIAS) expect(CRAVINGS.some((c) => c.categoria === cat.id), cat.label).toBe(true);
  });

  it("segue a ordem: grupos do mais natural ao mais processado e, em cada grupo, kcal crescente", () => {
    for (const g of GRUPOS) {
      const itens = CRAVINGS.filter((c) => c.grupo === g.id);
      expect(itens.map((c) => c.id), g.id).toEqual(ORDEM_ESPERADA[g.id]);
      const kcals = itens.map((c) => c.kcalMin);
      expect(kcals, g.id).toEqual([...kcals].sort((a, b) => a - b));
    }
    expect(CRAVINGS.map((c) => GRUPOS.findIndex((g) => g.id === c.grupo))).toEqual(
      [...CRAVINGS.map((c) => GRUPOS.findIndex((g) => g.id === c.grupo))].sort((a, b) => a - b),
    );
  });

  it("kcal e macros de cada opção batem com a conferência (±1 kcal, ±0,1 g)", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(CRAVINGS.map((c) => c.id).sort());
    for (const c of CRAVINGS) {
      const esperado = GOLDEN[c.id];
      expect(c.macros, c.id).toHaveLength(esperado.length);
      c.macros.forEach((m, i) => {
        const [k, p, cb, g] = esperado[i];
        expect(Math.abs(m.kcal - k), `${c.id}#${i} kcal`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.p - p), `${c.id}#${i} P`).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(m.c - cb), `${c.id}#${i} C`).toBeLessThanOrEqual(0.1 + 1e-9);
        expect(Math.abs(m.g - g), `${c.id}#${i} G`).toBeLessThanOrEqual(0.1 + 1e-9);
      });
      expect(c.macros.map((m) => m), c.id).toEqual(c.opcoes.map((o) => calcularMacros(o.ingredientes)));
      expect(c.kcalMin).toBe(Math.min(...c.macros.map((m) => m.kcal)));
      expect(c.kcalMax).toBe(Math.max(...c.macros.map((m) => m.kcal)));
    }
  });

  it("respeita os tetos de kcal e de gordura", () => {
    for (const c of snacks) {
      expect(c.kcalMax, c.id).toBeLessThanOrEqual(LIMITE_KCAL_SNACK);
      for (const m of c.macros) expect(m.g, c.id).toBeLessThanOrEqual(LIMITE_GORDURA_FIXA_G);
      if (c.porcaoFixa) expect(c.macros[0].g, c.id).toBeGreaterThan(LIMITE_GORDURA_PADRAO_G);
      else expect(c.macros[0].g, c.id).toBeLessThanOrEqual(LIMITE_GORDURA_PADRAO_G);
    }
    for (const c of trocas) {
      expect(c.porcaoFixa, c.id).toBe(false);
      expect(c.kcalMax, c.id).toBeLessThanOrEqual(LIMITE_KCAL_TROCA);
      for (const m of c.macros) expect(m.g, c.id).toBeLessThanOrEqual(LIMITE_GORDURA_TROCA_G);
    }
    expect(CRAVINGS.filter((c) => c.porcaoFixa).length).toBeLessThanOrEqual(MAX_PORCAO_FIXA);
  });

  it("não tem oleaginosa a granel nem pasta; amendoim só nos itens que o contêm, com aviso", () => {
    for (const c of CRAVINGS) {
      expect(OLEAGINOSAS_PROIBIDAS.test(textoDe(c)), `${c.id}: ${textoDe(c)}`).toBe(false);
      if (AMENDOIM.test(textoDe(c))) expect(c.contem, `${c.id} cita amendoim sem aviso`).toContain("amendoim");
    }
    const comAmendoim = CRAVINGS.filter((c) => c.contem.includes("amendoim")).map((c) => c.id).sort();
    expect(comAmendoim).toEqual(["bombom", "minis-chocolate", "pacoca-zero"]);
  });

  it("pipoca é só de milho feito na água, de 30 a 50 g, e nunca de micro-ondas", () => {
    const p = porId("pipoca-agua");
    expect(p.opcoes.map((o) => o.ingredientes.map((l) => [l.id, l.gramas]))).toEqual([
      [["milhoPipoca", 30]],
      [["milhoPipoca", 40]],
      [["milhoPipoca", 50]],
    ]);
    const texto = textoDe(p)
      .replace("sem óleo e sem micro-ondas", "")
      .replace("Nada de manteiga, óleo ou pipoca de micro-ondas", "");
    expect(/micro-ondas|manteiga|azeite/i.test(texto)).toBe(false);
  });

  it("toda receita está completa e toda porção é medida", () => {
    for (const c of CRAVINGS) {
      expect(c.preparo.length, c.id).toBeGreaterThan(0);
      expect(c.tempo, c.id).not.toBe("");
      expect(c.resumo, c.id).not.toBe("");
      expect(c.opcoes.length, c.id).toBeGreaterThan(0);
      if (c.opcoes.length > 1) expect(new Set(c.opcoes.map((o) => o.rotulo)).size, c.id).toBe(c.opcoes.length);
      for (const o of c.opcoes) {
        expect(o.ingredientes.length, c.id).toBeGreaterThan(0);
        for (const l of o.ingredientes) expect(l.gramas, `${c.id}/${l.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("ingredientes da TACO do app não divergem de tacoFoods.ts", () => {
    for (const [id, ing] of Object.entries(INGREDIENTES)) {
      if (ing.fonte !== "taco-app") continue;
      expect(ing.tacoNome, `${id} precisa de tacoNome`).toBeTruthy();
      const taco = TACO_FOODS.find((f) => f.name === ing.tacoNome);
      expect(taco, `${id}: "${ing.tacoNome}" não existe em tacoFoods.ts`).toBeDefined();
      expect({ kcal: ing.kcal, p: ing.p, c: ing.c, g: ing.g }, id).toEqual({
        kcal: taco!.kcal,
        p: taco!.p,
        c: taco!.c,
        g: taco!.g,
      });
    }
  });

  it("não tem os itens retirados nem 'meia barra': chocolate em barra só em versão mini", () => {
    for (const id of ["mousse-banana-cacau", "banana-quente-cacau", "snickers-meia-barra"]) {
      expect(CRAVINGS.some((c) => c.id === id), id).toBe(false);
    }
    for (const c of CRAVINGS) expect(/meia barra/i.test(textoDe(c)), c.id).toBe(false);
    const minis = porId("minis-chocolate");
    expect(minis.titulo).toMatch(/Qualquer Versão Mini/);
    expect(minis.opcoes.map((o) => o.ingredientes[0].gramas)).toEqual([18, 24, 30]);
  });

  it("chocolate quente deixa escolher o leite, e a kcal acompanha", () => {
    const q = porId("chocolate-quente-fit");
    expect(q.opcoes.map((o) => o.rotulo)).toEqual(["Leite desnatado", "Leite integral"]);
    expect(q.macros[1].kcal).toBeGreaterThan(q.macros[0].kcal);
    expect(q.dica).toMatch(/leite que preferir/i);
  });

  it("doce fit de uva com whey e panqueca de banana têm a receita e a kcal base", () => {
    const u = porId("doce-fit-uva-whey");
    expect(u.grupo).toBe("troca");
    expect(u.macros.map((m) => m.kcal)).toEqual([330, 398, 446]);
    expect(u.preparo.length).toBe(5);
    const p = porId("panqueca-banana");
    expect(p.grupo).toBe("troca");
    expect(p.macros[0].kcal).toBe(239);
    expect(p.opcoes[0].ingredientes.map((l) => l.id)).toEqual(["bananaPrata", "ovo", "aveia"]);
  });

  it("marca lactose, glúten e amendoim a partir dos ingredientes", () => {
    expect(porId("morango-leite-moca").contem).toContain("lactose");
    expect(porId("torrada-tomate").contem).toContain("gluten");
    expect(porId("minis-chocolate").contem).toEqual(expect.arrayContaining(["lactose", "amendoim"]));
    expect(porId("doce-fit-uva-whey").contem).toContain("lactose");
    expect(porId("panqueca-banana").contem).toEqual(["gluten"]);
    expect(porId("hamburguer-artesanal").contem).toEqual(expect.arrayContaining(["lactose", "gluten"]));
    expect(porId("goiabada-cascao").contem).toEqual([]);
    expect(porId("picole-caseiro").contem).toEqual([]);
  });
});
