import { describe, expect, it } from "vitest";
import {
  POSTURE_ITEMS, POSTURE_SYSTEM_PROMPT, extractJsonObject, hasAestheticTags, parseAesthetic, parsePosture,
  photosFingerprint, planAnalysis,
} from "../../../supabase/functions/_shared/photoAnalysisLogic";
import {
  GRADE_META, POSTURE_DEVIATIONS, POSTURE_KEYS, applyAiSuggestion, parsePostureAi, sanitizeFindings,
} from "@/lib/postureQuick";
import { gluteFamily, isGluteFocusExercise, summarizeFeel, type FeelRow } from "@/lib/exerciseFeel";
import { coachBy, coachFirstName, coachOf, coachSubject, coachTo, coachWith, normalizeUpdateLabel } from "@/lib/coachWords";
import { photoGuideTips } from "@/lib/photoGuide";

const allItems = (grau: string, descricao = "parece haver diferença") =>
  Object.fromEntries(POSTURE_ITEMS.map((i) => [i.key, { descricao, grau }]));

describe("IA de fotos — postura", () => {
  it("as 10 chaves da IA são exatamente as da postura rápida (paridade servidor × app)", () => {
    expect(POSTURE_ITEMS.map((i) => i.key)).toEqual(POSTURE_KEYS);
    for (const k of POSTURE_KEYS) expect(POSTURE_SYSTEM_PROMPT).toContain(k);
  });

  it("lê JSON mesmo com bloco de raciocínio, cercas de markdown ou texto em volta", () => {
    expect(extractJsonObject('<think>hmm</think>\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Claro! Segue: {"a":2} espero ter ajudado')).toEqual({ a: 2 });
    expect(extractJsonObject("sem json")).toBeNull();
    expect(extractJsonObject("[1,2]")).toBeNull();
    expect(extractJsonObject(undefined)).toBeNull();
  });

  it("valida a leitura: chave desconhecida e grau inválido somem; observar/investigar sem descrição é descartado", () => {
    const raw = JSON.stringify({
      qualidade_foto: { postura: "relaxada", camera: "ok", roupa_permite_ver: "sim" },
      desvios: {
        ...allItems("ok", ""),
        joelhos_para_dentro: { descricao: "joelhos parecem se aproximar", grau: "observar" },
        ombros_desnivelados: { descricao: "", grau: "investigar" }, // sem base → fora
        pes_desabados: { descricao: "x", grau: "muito" }, // grau inválido → fora
        inventado: { descricao: "x", grau: "investigar" },
      },
      confianca: 0.9,
    });
    const r = parsePosture(raw)!;
    expect(r.desvios.joelhos_para_dentro).toEqual({ grau: "observar", descricao: "joelhos parecem se aproximar" });
    expect(r.desvios.ombros_desnivelados).toBeUndefined();
    expect(r.desvios.pes_desabados).toBeUndefined();
    expect(Object.keys(r.desvios)).not.toContain("inventado");
    expect(r.desvios.cabeca_anteriorizada).toEqual({ grau: "ok", descricao: "" }); // "ok" pode vir sem descrição
    expect(r.reliability).toBe(0.9);
    expect(r.problemas_foto).toEqual([]);
  });

  it("confiança é rebaixada pelas regras do manual: posando, câmera torta, roupa, poucos itens visíveis", () => {
    const base = { desvios: allItems("ok", ""), confianca: 0.95 };
    expect(parsePosture(JSON.stringify({ ...base, qualidade_foto: { postura: "posando", camera: "ok", roupa_permite_ver: "sim" } }))!.reliability).toBe(0.5);
    const torta = parsePosture(JSON.stringify({ ...base, qualidade_foto: { postura: "relaxada", camera: "inclinada", roupa_permite_ver: "sim" } }))!;
    expect(torta.reliability).toBe(0.5);
    expect(torta.problemas_foto).toContain("câmera inclinada");
    expect(parsePosture(JSON.stringify({ ...base, qualidade_foto: { postura: "relaxada", camera: "ok", roupa_permite_ver: "nao" } }))!.reliability).toBe(0.3);
    const poucos = { ...allItems("nao_visivel"), joelhos_para_dentro: { descricao: "", grau: "ok" } };
    expect(parsePosture(JSON.stringify({ desvios: poucos, confianca: 1, qualidade_foto: { postura: "relaxada", camera: "ok", roupa_permite_ver: "sim" } }))!.reliability).toBe(0.4);
  });

  it("nada avaliável ou resposta quebrada = inválida (não grava, tenta de novo depois)", () => {
    expect(parsePosture(JSON.stringify({ desvios: allItems("nao_visivel") }))).toBeNull();
    expect(parsePosture("desculpe, não consigo")).toBeNull();
    expect(parsePosture(JSON.stringify({ desvios: [] }))).toBeNull();
  });

  it("o app lê a leitura gravada e converte para os graus da postura rápida", () => {
    const stored = parsePosture(JSON.stringify({
      qualidade_foto: { postura: "relaxada", camera: "ok", roupa_permite_ver: "sim" },
      desvios: { ...allItems("ok", ""), lombar_acentuada: { descricao: "curva lombar parece aumentada", grau: "investigar" }, escapulas_aladas: { descricao: "", grau: "nao_visivel" } },
      confianca: 0.8,
    }))!;
    const ai = parsePostureAi(stored, "2026-11-19T10:00:00Z")!;
    expect(ai.items.lombar_acentuada).toEqual({ grade: "marked", description: "curva lombar parece aumentada" });
    expect(ai.items.cabeca_anteriorizada?.grade).toBe("none");
    expect(ai.notVisible).toEqual(["escapulas_aladas"]);
    expect(ai.reliability).toBe(0.8);
    expect(parsePostureAi(null)).toBeNull();
    expect(parsePostureAi({ desvios: { x: { grau: "investigar" } } })).toBeNull();
  });

  it("aplicar sugestão da IA nunca sobrescreve o que o coach marcou", () => {
    const ai = parsePostureAi({ desvios: { joelhos_para_dentro: { grau: "investigar", descricao: "a" }, pes_desabados: { grau: "observar", descricao: "b" } } })!;
    expect(applyAiSuggestion({ joelhos_para_dentro: "none" }, ai)).toEqual({ joelhos_para_dentro: "none", pes_desabados: "mild" });
  });
});

describe("IA de fotos — estética e o que gerar", () => {
  it("estética: textos limitados; sem referência a confiabilidade é 0; tudo vazio = inválida", () => {
    const r = parseAesthetic(JSON.stringify({ gordura_visual: "moderada", definicao: "boa", volume_muscular: "", simetria: "ok", reliability: 0.8 }), false)!;
    expect(r.tags.definicao).toBe("boa");
    expect(r.reliability).toBe(0);
    expect(parseAesthetic(JSON.stringify({ gordura_visual: "a", reliability: 0.7 }), true)!.reliability).toBe(0.7);
    expect(parseAesthetic(JSON.stringify({ gordura_visual: "", definicao: " " }), true)).toBeNull();
    expect(parseAesthetic("{}", true)).toBeNull();
    expect(hasAestheticTags({ simetria: "ok" })).toBe(true);
    expect(hasAestheticTags({})).toBe(false);
  });

  it("gera só o que falta; fotos trocadas refazem tudo; linha antiga (sem impressão digital) não refaz a estética", () => {
    const fp = photosFingerprint({ frente: "f", lateral_dir: "ld", lateral_esq: "le", costas: "c" });
    expect(fp).toBe("f|ld|le|c");
    const want = { wantAesthetic: true, wantPosture: true, postureSupported: true, fingerprint: fp };
    expect(planAnalysis({ ...want, existing: null })).toEqual({ aesthetic: true, posture: true });
    expect(planAnalysis({ ...want, existing: { tags: { definicao: "boa" }, posture: null, photos_fingerprint: null } })).toEqual({ aesthetic: false, posture: true });
    expect(planAnalysis({ ...want, existing: { tags: { definicao: "boa" }, posture: { x: 1 }, photos_fingerprint: fp } })).toEqual({ aesthetic: false, posture: false });
    // a IA tinha falhado (tags vazias): tenta de novo
    expect(planAnalysis({ ...want, existing: { tags: {}, posture: { x: 1 }, photos_fingerprint: fp } })).toEqual({ aesthetic: true, posture: false });
    // aluna trocou uma foto
    expect(planAnalysis({ ...want, wantAesthetic: false, existing: { tags: { definicao: "boa" }, posture: { x: 1 }, photos_fingerprint: "f|ld|le|OUTRA" } })).toEqual({ aesthetic: true, posture: true });
    // só postura pedida (botão do coach)
    expect(planAnalysis({ ...want, wantAesthetic: false, existing: { tags: {}, posture: null, photos_fingerprint: fp } })).toEqual({ aesthetic: false, posture: true });
    // banco sem o SQL novo: postura indisponível
    expect(planAnalysis({ ...want, postureSupported: false, existing: null })).toEqual({ aesthetic: true, posture: false });
  });
});

describe("postura rápida — catálogo do manual", () => {
  it("10 desvios, cada um com primeiro teste, o que favorecer e o que evitar", () => {
    expect(POSTURE_DEVIATIONS).toHaveLength(10);
    expect(new Set(POSTURE_KEYS).size).toBe(10);
    for (const d of POSTURE_DEVIATIONS) {
      expect(d.guidance.test.length).toBeGreaterThan(10);
      expect(d.guidance.favor.length).toBeGreaterThan(10);
      expect(d.guidance.avoid.length).toBeGreaterThan(10);
      expect(d.poses.length).toBeGreaterThan(0);
    }
    expect(POSTURE_KEYS).toEqual(expect.arrayContaining(["costelas_abertas", "pes_girados_fora"]));
  });

  it("graus com a linguagem do manual; marcações antigas continuam válidas", () => {
    expect([GRADE_META.none.label, GRADE_META.mild.label, GRADE_META.marked.label]).toEqual(["Ok", "Observar", "Investigar"]);
    expect(sanitizeFindings({ ombros_desnivelados: "mild", costelas_abertas: "marked" })).toEqual({ ombros_desnivelados: "mild", costelas_abertas: "marked" });
  });
});

describe("onde você sentiu?", () => {
  it("reconhece os exercícios de glúteo por família e ignora os que não são", () => {
    expect(gluteFamily("Hip Thrust com barra")).toBe("ponte");
    expect(gluteFamily("Elevação Pélvica")).toBe("ponte");
    expect(gluteFamily("Stiff com halteres")).toBe("dobradica");
    expect(gluteFamily("RDL")).toBe("dobradica");
    expect(gluteFamily("Agachamento Búlgaro")).toBe("unilateral");
    expect(gluteFamily("Passada")).toBe("unilateral");
    expect(gluteFamily("Cadeira Abdutora")).toBe("isolado");
    expect(gluteFamily("Glúteo na polia")).toBe("isolado");
    for (const n of ["Agachamento livre", "Cadeira adutora", "Cadeira extensora", "Leg press", "Supino", "", null]) {
      expect(isGluteFocusExercise(n)).toBe(false);
    }
  });

  const row = (key: string, name: string, felt: FeelRow["felt"], daysAgo: number): FeelRow => ({
    exercise_key: key, exercise_name: name, felt, created_at: new Date(Date.UTC(2026, 10, 19 - daysAgo)).toISOString(),
  });

  it("lombar em 2 das últimas 4 no hip thrust = compensação, com a dica do manual", () => {
    const s = summarizeFeel([
      row("ht", "Hip Thrust", "lombar", 1), row("ht", "Hip Thrust", "gluteo", 3),
      row("ht", "Hip Thrust", "lombar", 5), row("ht", "Hip Thrust", "gluteo", 7),
      row("ht", "Hip Thrust", "lombar", 30), // 5ª mais antiga: fora da janela
    ]);
    expect(s[0].total).toBe(4);
    expect(s[0].counts).toEqual({ lombar: 2, gluteo: 2 });
    expect(s[0].compensation).toBe("lombar");
    expect(s[0].hint).toContain("expirar na subida");
  });

  it("uma resposta só nunca acusa; posterior no stiff é esperado; quadríceps no búlgaro só se dominar", () => {
    expect(summarizeFeel([row("ht", "Hip Thrust", "lombar", 1)])[0].compensation).toBeNull();
    expect(summarizeFeel([row("st", "Stiff", "posterior", 1), row("st", "Stiff", "posterior", 2)])[0].compensation).toBeNull();
    const bulg = summarizeFeel([row("b", "Búlgaro", "quadriceps", 1), row("b", "Búlgaro", "quadriceps", 2), row("b", "Búlgaro", "gluteo", 3)]);
    expect(bulg[0].compensation).toBe("quadriceps");
    expect(bulg[0].hint).toContain("ajustar a distância do pé");
  });

  it("exercícios com compensação aparecem primeiro", () => {
    const s = summarizeFeel([
      row("ab", "Cadeira Abdutora", "gluteo", 0),
      row("ht", "Hip Thrust", "lombar", 2), row("ht", "Hip Thrust", "lombar", 4),
    ]);
    expect(s.map((x) => x.exerciseKey)).toEqual(["ht", "ab"]);
  });
});

describe("linguagem para a aluna (sem 'coach')", () => {
  it("usa o primeiro nome do profissional; sem nome, 'seu treinador' — sem artigo antes do nome", () => {
    const rennan = { name: "Rennan Gonçalves", known: true };
    expect(coachFirstName(rennan)).toBe("Rennan");
    expect(coachOf(rennan)).toBe("de Rennan");
    expect(coachTo(rennan)).toBe("para Rennan");
    expect(coachBy("Rennan Gonçalves")).toBe("por Rennan");
    expect(coachWith(rennan)).toBe("com Rennan");
    expect(coachSubject(rennan)).toBe("Rennan");
    const unknown = { name: "seu treinador", known: false };
    expect(coachOf(unknown)).toBe("do seu treinador");
    expect(coachTo(null)).toBe("para o seu treinador");
    expect(coachBy(undefined)).toBe("pelo seu treinador");
    expect(coachWith("")).toBe("com o seu treinador");
    expect(coachSubject("Seu Treinador")).toBe("Seu treinador");
  });

  it("avisos antigos gravados no banco aparecem sem 'pelo seu coach'", () => {
    expect(normalizeUpdateLabel("Seu protocolo foi liberado pelo seu coach")).toBe("Seu protocolo foi liberado");
    expect(normalizeUpdateLabel("Dieta: refeição 2 atualizada")).toBe("Dieta: refeição 2 atualizada");
  });
});

describe("dicas de foto padronizadas", () => {
  it("mesmo texto para anamnese e check-in, com os pontos do manual", () => {
    const txt = photoGuideTips().map((t) => t.text).join(" | ");
    expect(txt).toContain("sem estufar o peito, prender a barriga ou empinar o bumbum");
    expect(txt).toContain("altura do quadril");
    expect(txt).toContain("Sem espelho, sem filtro e sem lente 0.5x");
    expect(photoGuideTips("F").map((t) => t.text).join()).toContain("Top e short de treino");
    expect(photoGuideTips("M").map((t) => t.text).join()).toContain("Sunga");
  });
});
