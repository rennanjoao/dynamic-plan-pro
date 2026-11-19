/**
 * Lógica pura da function photo-analysis (sem Deno, sem rede): prompts,
 * leitura defensiva da resposta da IA e regras determinísticas de confiança.
 * Testada em src/lib/__tests__/photoAnalysisLogic.test.ts.
 *
 * Duas leituras SEPARADAS (cada uma com um prompt focado, que erra menos):
 *  1. Estética (comparação com o check-in anterior): gordura visual,
 *     definição, volume e simetria — como já existia.
 *  2. Postura (as 4 fotos atuais): triagem visual educacional dos 10 desvios
 *     da "postura rápida", seguindo o manual de postura do coach — descrever
 *     antes de interpretar, linguagem de hipótese, "não visível" quando a foto
 *     não permite, nunca diagnóstico. É SUGESTÃO: o coach confirma.
 */

export const POSE_ORDER = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
export type Pose = typeof POSE_ORDER[number];

/** Espelha POSTURE_DEVIATIONS de src/lib/postureQuick.ts (teste de paridade garante). */
export const POSTURE_ITEMS: { key: string; where: string; what: string }[] = [
  { key: "cabeca_anteriorizada", where: "fotos de lado", what: "orelha bem à frente da linha do ombro" },
  { key: "ombros_protusos", where: "fotos de lado", what: "ombros projetados para a frente do tronco" },
  { key: "costelas_abertas", where: "fotos de lado", what: "costelas de baixo projetadas para a frente em relação à pelve" },
  { key: "lombar_acentuada", where: "fotos de lado", what: "curva da lombar aumentada, com a pelve inclinada para a frente" },
  { key: "ombros_desnivelados", where: "frente e costas", what: "um ombro visivelmente mais alto que o outro" },
  { key: "escapulas_aladas", where: "costas", what: "borda interna da escápula saltada, afastada das costelas" },
  { key: "pelve_desnivelada", where: "frente e costas", what: "um lado do quadril (cintura/crista ilíaca) mais alto ou rodado" },
  { key: "joelhos_para_dentro", where: "frente", what: "joelhos se aproximando da linha do meio do corpo (em X)" },
  { key: "pes_desabados", where: "frente e costas", what: "arco do pé caído, tornozelo caindo para dentro" },
  { key: "pes_girados_fora", where: "frente e costas", what: "pontas dos pés bem abertas para fora" },
];

const GRAUS = ["ok", "observar", "investigar", "nao_visivel"] as const;
type Grau = typeof GRAUS[number];

export const POSTURE_PROMPT_VERSION = 1;

export const POSTURE_SYSTEM_PROMPT = `Você faz uma TRIAGEM VISUAL EDUCACIONAL de postura (não é diagnóstico) a partir de 4 fotos de uma aluna de musculação, para o profissional de Educação Física dela.

Siga nesta ordem:
1. Qualidade das fotos: a pessoa está relaxada ou posando (peito estufado, barriga presa, bumbum empinado)? A câmera está reta, na altura do quadril, ou inclinada / perto demais / grande angular? A roupa deixa ver ombros, cintura, pelve, joelhos e pés?
2. Para cada item, DESCREVA primeiro o que dá para ver na foto indicada; só depois classifique. Não deduza causa, músculo encurtado, fraqueza, escoliose, lesão ou dor.
3. Classifique cada item:
   - "ok": alinhamento aparentemente bom ou diferença mínima.
   - "observar": diferença visível, mas discreta — vale acompanhar ou testar no movimento.
   - "investigar": diferença evidente e clara na foto — vale testar e investigar.
   - "nao_visivel": a foto, a roupa, o ângulo ou a pose não permitem avaliar com segurança.
   Na dúvida entre dois graus, escolha o mais leve. Na dúvida se dá para ver, use "nao_visivel".

Itens (chave — onde olhar — o que observar):
${POSTURE_ITEMS.map((i) => `- ${i.key} — ${i.where} — ${i.what}`).join("\n")}

Regras:
- Pequenas assimetrias são normais no corpo humano; não transforme toda diferença em achado.
- Nas fotos de lado, compare o mesmo item nos dois lados quando der.
- Descrições curtas (até 120 caracteres), linguagem de hipótese ("parece", "pode sugerir"), sem jargão.
- Nunca comente beleza, gordura, peso ou aparência corporal. Nunca dê nota de postura.

Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{"qualidade_foto":{"postura":"relaxada|posando|incerto","camera":"ok|inclinada|perto_demais|incerto","roupa_permite_ver":"sim|parcial|nao"},"desvios":{${POSTURE_ITEMS.map((i) => `"${i.key}":{"descricao":"...","grau":"ok|observar|investigar|nao_visivel"}`).join(",")}},"confianca":0.0}
"confianca" vai de 0.0 a 1.0: o quanto as fotos permitem uma leitura segura.`;

export const AESTHETIC_SYSTEM_PROMPT = `Você analisa fotos corporais (frente e costas) de um aluno de fitness para o coach dele.
Responda SOMENTE com um JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{"gordura_visual":"...","definicao":"...","volume_muscular":"...","simetria":"...","reliability":0.0}
- Descrições curtas e qualitativas (ex.: "moderada", "boa definição no tronco", "levemente assimétrico à direita").
- As imagens vêm identificadas por legenda (frente atual, frente anterior, costas atual, costas anterior). Compare cada pose com seu par da mesma pose quando o par anterior existir.
- "simetria" pode considerar frente e costas atuais entre si, mesmo sem referência anterior.
- Use o contexto de objetivo/condição do aluno (se fornecido) só para calibrar a leitura (ex.: fase de volume explica menos definição; não tratar como meta a cobrar do aluno).
- Se a luz, o ângulo ou a pose forem diferentes entre a foto atual e a anterior, diga isso na descrição e reduza "reliability" — não atribua a diferença ao corpo.
- NUNCA cite peso, %BF ou qualquer número clínico.
- NUNCA emita diagnóstico clínico, mesmo que o contexto mencione lesão ou condição de saúde.
- reliability: 0.0 a 1.0 conforme a confiabilidade da comparação com as fotos de referência anterior (frente+costas). Se não houver esse par anterior completo, use 0.`;

/**
 * Tira o JSON de dentro da resposta do modelo: ignora bloco de raciocínio
 * (<think>), cercas de markdown e texto antes/depois. null se não houver JSON válido.
 */
export function extractJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const clip = (v: unknown, n: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "";

const clamp01 = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;

// ─── Estética ────────────────────────────────────────────────────────────────

export interface AestheticResult {
  tags: { gordura_visual: string; definicao: string; volume_muscular: string; simetria: string };
  reliability: number | null;
}

/** null = resposta inválida (nada aproveitável): não grava, deixa tentar de novo. */
export function parseAesthetic(raw: unknown, useReference: boolean): AestheticResult | null {
  const o = extractJsonObject(raw);
  if (!o) return null;
  const tags = {
    gordura_visual: clip(o.gordura_visual, 200),
    definicao: clip(o.definicao, 200),
    volume_muscular: clip(o.volume_muscular, 200),
    simetria: clip(o.simetria, 200),
  };
  if (!Object.values(tags).some(Boolean)) return null;
  const rel = clamp01(o.reliability);
  // Sem par anterior não existe "comparação": confiabilidade 0, diga o modelo o que disser.
  return { tags, reliability: useReference ? rel : 0 };
}

export function hasAestheticTags(tags: unknown): boolean {
  if (!tags || typeof tags !== "object") return false;
  return ["gordura_visual", "definicao", "volume_muscular", "simetria"].some(
    (k) => typeof (tags as Record<string, unknown>)[k] === "string" && ((tags as Record<string, string>)[k]).trim() !== "",
  );
}

// ─── Postura ─────────────────────────────────────────────────────────────────

export interface PostureResult {
  versao: number;
  desvios: Record<string, { grau: Grau; descricao: string }>;
  qualidade_foto: { postura: string; camera: string; roupa_permite_ver: string };
  problemas_foto: string[];
  reliability: number;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : fallback;

/**
 * Valida a leitura postural. Regras de precisão:
 *  - só as 10 chaves conhecidas; grau fora da lista é descartado;
 *  - "observar"/"investigar" SEM descrição é descartado (descrever antes de
 *    interpretar — sem o que foi visto, não há base para a hipótese);
 *  - confiança rebaixada de forma determinística quando a foto não ajuda
 *    (pose, câmera, roupa) ou quando muitos itens ficaram "não visível";
 *  - nenhum item avaliável = resposta inválida (null).
 */
export function parsePosture(raw: unknown): PostureResult | null {
  const o = extractJsonObject(raw);
  if (!o) return null;
  const q = (o.qualidade_foto && typeof o.qualidade_foto === "object") ? o.qualidade_foto as Record<string, unknown> : {};
  const qualidade = {
    postura: pick(q.postura, ["relaxada", "posando", "incerto"] as const, "incerto"),
    camera: pick(q.camera, ["ok", "inclinada", "perto_demais", "incerto"] as const, "incerto"),
    roupa_permite_ver: pick(q.roupa_permite_ver, ["sim", "parcial", "nao"] as const, "parcial"),
  };
  const src = (o.desvios && typeof o.desvios === "object" && !Array.isArray(o.desvios)) ? o.desvios as Record<string, unknown> : {};
  const desvios: PostureResult["desvios"] = {};
  for (const item of POSTURE_ITEMS) {
    const d = src[item.key] as Record<string, unknown> | undefined;
    if (!d || typeof d !== "object") continue;
    const grau = typeof d.grau === "string" && (GRAUS as readonly string[]).includes(d.grau) ? d.grau as Grau : null;
    if (!grau) continue;
    const descricao = clip(d.descricao, 160);
    if ((grau === "observar" || grau === "investigar") && !descricao) continue;
    desvios[item.key] = { grau, descricao };
  }
  const evaluated = Object.values(desvios).filter((d) => d.grau !== "nao_visivel").length;
  if (evaluated === 0) return null;

  const problemas: string[] = [];
  let rel = clamp01(o.confianca) ?? 0.5;
  if (qualidade.postura === "posando") { rel = Math.min(rel, 0.5); problemas.push("parece estar posando, não relaxada"); }
  if (qualidade.camera === "inclinada") { rel = Math.min(rel, 0.5); problemas.push("câmera inclinada"); }
  if (qualidade.camera === "perto_demais") { rel = Math.min(rel, 0.5); problemas.push("câmera perto demais ou grande angular"); }
  if (qualidade.roupa_permite_ver === "parcial") { rel = Math.min(rel, 0.7); problemas.push("roupa esconde parte do corpo"); }
  if (qualidade.roupa_permite_ver === "nao") { rel = Math.min(rel, 0.3); problemas.push("roupa não deixa ver o alinhamento"); }
  // Menos da metade dos itens avaliável = leitura parcial.
  if (evaluated < POSTURE_ITEMS.length / 2) rel = Math.min(rel, 0.4);

  return {
    versao: POSTURE_PROMPT_VERSION,
    desvios,
    qualidade_foto: qualidade,
    problemas_foto: problemas,
    reliability: Math.round(rel * 100) / 100,
  };
}

// ─── Decisão do que gerar ────────────────────────────────────────────────────

/** "Impressão digital" das 4 fotos: muda quando a aluna troca qualquer foto. */
export function photosFingerprint(fotos: Record<string, string | undefined>): string {
  return POSE_ORDER.map((k) => fotos[k] ?? "").join("|");
}

export interface ExistingAnalysis {
  tags: unknown;
  posture: unknown;
  photos_fingerprint: string | null;
}

/**
 * O que precisa ser gerado agora. Antes a regra era "nunca reprocessa": se a
 * IA devolvesse lixo, o check-in ficava para sempre com análise vazia; e se a
 * aluna trocasse as fotos (atualizar check-in), a análise das fotos antigas
 * continuava valendo.
 */
export function planAnalysis(args: {
  existing: ExistingAnalysis | null;
  fingerprint: string;
  wantAesthetic: boolean;
  wantPosture: boolean;
  postureSupported: boolean;
}): { aesthetic: boolean; posture: boolean } {
  const { existing, fingerprint } = args;
  // Linhas antigas não têm impressão digital: não dá para saber se as fotos
  // mudaram, então só gera o que estiver faltando.
  const photosChanged = !!existing?.photos_fingerprint && existing.photos_fingerprint !== fingerprint;
  // Fotos novas: refaz TUDO (a leitura das fotos antigas não pode continuar valendo).
  if (photosChanged) return { aesthetic: true, posture: args.postureSupported };
  const aesthetic = args.wantAesthetic && (!existing || !hasAestheticTags(existing.tags));
  const posture = args.wantPosture && args.postureSupported && !existing?.posture;
  return { aesthetic, posture };
}
