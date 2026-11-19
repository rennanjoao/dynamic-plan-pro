/**
 * Postura rápida — versão "cirúrgica" pedida pelo coach no lugar do módulo
 * completo de avaliação postural (que ficou oculto por ser longo demais).
 *
 * São 10 desvios comuns, visíveis nas fotos padrão do check-in. Para cada um o
 * coach toca em Ok / Observar / Investigar (ou deixa sem marcar = não avaliado).
 *
 * Linguagem e raciocínio vêm do "Manual prático de postura, encurtamentos e
 * correções" e do "Guia prático de postura" do coach:
 *  - "Uma foto mostra uma posição. Um teste mostra uma estratégia." Por isso
 *    cada desvio traz o PRIMEIRO TESTE para confirmar ou descartar a hipótese,
 *    o que FAVORECER e o que EVITAR fazer automaticamente (Partes 7 a 9).
 *  - Código de cores: verde = ok, amarelo = observar/testar, vermelho =
 *    investigar (Parte 3.4). Vermelho nunca quer dizer "músculo encurtado".
 *
 * Os valores gravados no banco continuam "none" | "mild" | "marked" — só os
 * rótulos mudaram, então marcações antigas seguem válidas.
 */

export type PoseKey = "frente" | "lateral_dir" | "lateral_esq" | "costas";
export type PostureGrade = "none" | "mild" | "marked";

export interface PostureGuidance {
  /** Primeiro teste de movimento (sem dor, sem forçar). */
  test: string;
  /** O que pode favorecer, se o teste confirmar. */
  favor: string;
  /** O que NÃO fazer automaticamente. */
  avoid: string;
}

export interface PostureDeviation {
  key: string;
  label: string;
  /** Onde olhar (texto curto mostrado ao coach). */
  look: string;
  poses: PoseKey[];
  guidance: PostureGuidance;
}

// Linha "Ombros projetados à frente" da matriz (Parte 7): vale para cabeça,
// ombros e escápulas — o manual trata os três pelo mesmo raciocínio.
const SHOULDER_GUIDANCE: PostureGuidance = {
  test: "Elevar os braços e ver se a posição melhora com uma expiração suave.",
  favor: "Mobilidade torácica e controle de escápula.",
  avoid: "Mandar puxar os ombros para trás o dia inteiro.",
};

export const POSTURE_DEVIATIONS: PostureDeviation[] = [
  {
    key: "cabeca_anteriorizada", label: "Cabeça projetada à frente", look: "Foto de lado",
    poses: ["lateral_dir", "lateral_esq"], guidance: SHOULDER_GUIDANCE,
  },
  {
    key: "ombros_protusos", label: "Ombros arredondados para frente", look: "Foto de lado",
    poses: ["lateral_dir", "lateral_esq"], guidance: SHOULDER_GUIDANCE,
  },
  {
    key: "costelas_abertas", label: "Costelas abertas", look: "Foto de lado",
    poses: ["lateral_dir", "lateral_esq"],
    guidance: {
      test: "Ponte pequena com expiração suave: as costelas descem sem a lombar compensar?",
      favor: "Controle abdominal de costelas e pelve (ex.: dead bug regressivo) e respirar sem perder a posição.",
      avoid: "Pedir para \"prender a barriga\" o tempo inteiro.",
    },
  },
  {
    key: "lombar_acentuada", label: "Lombar muito curvada", look: "Foto de lado",
    poses: ["lateral_dir", "lateral_esq"],
    guidance: {
      test: "Ponte pequena com expiração e costelas organizadas.",
      favor: "Mobilidade confortável de flexores do quadril, controle abdominal e extensão do quadril pelo glúteo.",
      avoid: "Alongar o iliopsoas com agressividade ou mandar \"encaixar\" a pelve o tempo inteiro.",
    },
  },
  {
    key: "ombros_desnivelados", label: "Ombros desnivelados", look: "Frente ou costas",
    poses: ["frente", "costas"],
    guidance: {
      test: "Elevar os braços e comparar os lados; perguntar sobre dor ou lesão antiga.",
      favor: "Mobilidade torácica, controle de escápula e exercícios unilaterais comparando os lados.",
      avoid: "Concluir \"lado fraco\" só porque um lado parece diferente na foto.",
    },
  },
  {
    key: "escapulas_aladas", label: "Escápulas saltadas (aladas)", look: "Foto de costas",
    poses: ["costas"],
    guidance: {
      test: "Elevar os braços e observar se a escápula se afasta mais de um lado.",
      favor: SHOULDER_GUIDANCE.favor,
      avoid: "Mandar juntar as escápulas o dia inteiro ou concluir só pela foto parada.",
    },
  },
  {
    key: "pelve_desnivelada", label: "Quadril desnivelado", look: "Frente ou costas",
    poses: ["frente", "costas"],
    guidance: {
      test: "Apoio em uma perna (20–30 s) e caminhada, comparando os lados.",
      favor: "Controle do pé, do quadril e do tronco, conforme o teste mostrar.",
      avoid: "Afirmar que uma perna é menor ou tentar \"corrigir\" a pelve à força.",
    },
  },
  {
    key: "joelhos_para_dentro", label: "Joelhos para dentro", look: "Foto de frente",
    poses: ["frente"],
    guidance: {
      test: "Agachamento com apoio e amplitude menor.",
      favor: "Apoio do pé, controle do quadril e glúteo médio conforme a necessidade.",
      avoid: "Culpar só o glúteo médio ou empurrar o joelho para fora à força.",
    },
  },
  {
    key: "pes_desabados", label: "Pés desabados (arco caído)", look: "Frente ou costas",
    poses: ["frente", "costas"],
    guidance: {
      test: "Agachamento e apoio em uma perna observando o arco do pé.",
      favor: "Apoio do pé em três pontos (tripé) e controle do tornozelo.",
      avoid: "Culpar o glúteo antes de olhar o pé.",
    },
  },
  {
    key: "pes_girados_fora", label: "Pés girados para fora", look: "Frente ou costas",
    poses: ["frente", "costas"],
    guidance: {
      test: "Observar o agachamento e o apoio em uma perna.",
      favor: "Controle do tripé do pé e mobilidade adequada.",
      avoid: "Forçar os pés paralelos em qualquer exercício.",
    },
  },
];

export const POSTURE_KEYS = POSTURE_DEVIATIONS.map((d) => d.key);

/** Cores do manual: verde = ok, amarelo = observar/testar, vermelho = investigar. */
export const GRADE_META: Record<PostureGrade, { label: string; short: string; rank: number; cls: string }> = {
  none:   { label: "Ok",          short: "Ok",          rank: 0, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40" },
  mild:   { label: "Observar",    short: "Observar",    rank: 1, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" },
  marked: { label: "Investigar",  short: "Investigar",  rank: 2, cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40" },
};

export const GRADE_ORDER: PostureGrade[] = ["none", "mild", "marked"];

/** Frase fixa da tela (manual, "Para quem é este manual" e Parte 3). */
export const POSTURE_DISCLAIMER =
  "Hipótese visual, não diagnóstico. A foto mostra uma posição; o teste de movimento mostra a estratégia.";

/** Sinais de alerta para encaminhar a fisioterapeuta ou médico (manual, Parte 5.4). */
export const POSTURE_RED_FLAGS: string[] = [
  "Dor forte, persistente ou que piora com o tempo",
  "Formigamento ou perda de sensibilidade",
  "Perda de força súbita",
  "Dor que irradia (desce pela perna ou braço)",
  "Trauma recente ou inchaço importante",
  "Articulação que trava (bloqueio)",
  "Mudança no jeito de andar",
  "Perda de controle urinário ou intestinal",
  "Sintomas noturnos intensos sem explicação",
];

export type PostureFindings = Partial<Record<string, PostureGrade>>;

/** Mantém só desvios conhecidos com grau válido (protege contra JSON estranho). */
export function sanitizeFindings(raw: unknown): PostureFindings {
  const out: PostureFindings = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const d of POSTURE_DEVIATIONS) {
    const v = (raw as Record<string, unknown>)[d.key];
    if (v === "none" || v === "mild" || v === "marked") out[d.key] = v;
  }
  return out;
}

export interface PostureQuickCheck {
  id: string;
  source_kind: "anamnesis" | "checkin";
  source_id: string;
  source_date: string;
  findings: PostureFindings;
  note: string | null;
}

export type PostureTrend = "melhorou" | "igual" | "piorou" | null;

/**
 * Tendência de um desvio entre a PRIMEIRA e a ÚLTIMA vez em que foi avaliado
 * (ignora as datas em que ficou sem marcar). null = avaliado só 1 vez ou nunca.
 */
export function deviationTrend(checks: PostureQuickCheck[], key: string): PostureTrend {
  const graded = [...checks]
    .sort((a, b) => new Date(a.source_date).getTime() - new Date(b.source_date).getTime())
    .map((c) => c.findings[key])
    .filter((g): g is PostureGrade => !!g);
  if (graded.length < 2) return null;
  const first = GRADE_META[graded[0]].rank;
  const last = GRADE_META[graded[graded.length - 1]].rank;
  if (last < first) return "melhorou";
  if (last > first) return "piorou";
  return "igual";
}

/** Quantos desvios pedem atenção (observar ou investigar) numa marcação. */
export function countPresent(findings: PostureFindings): number {
  return Object.values(findings).filter((g) => g === "mild" || g === "marked").length;
}

// ─── Sugestão da IA (leitura postural das fotos do check-in) ─────────────────

/** Uma sugestão por desvio, já convertida para os graus do app. */
export interface PostureAiItem {
  grade: PostureGrade;
  /** O que a IA descreveu na foto (antes de interpretar). */
  description: string;
}

export interface PostureAiSuggestion {
  items: Partial<Record<string, PostureAiItem>>;
  /** Desvios que a IA não conseguiu ver (roupa, ângulo, distância). */
  notVisible: string[];
  /** 0..1 — já rebaixada quando a foto não está relaxada ou a câmera está torta. */
  reliability: number | null;
  /** Problemas de foto que reduzem a confiança (texto curto). */
  photoIssues: string[];
  generatedAt: string | null;
}

const AI_GRADE: Record<string, PostureGrade> = { ok: "none", observar: "mild", investigar: "marked" };

/**
 * Lê a coluna `checkin_photo_analysis.posture` (gravada pela function
 * photo-analysis já validada) de forma defensiva: qualquer coisa fora do
 * formato esperado é ignorada, nunca vira marcação.
 */
export function parsePostureAi(raw: unknown, generatedAt: string | null = null): PostureAiSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const desvios = (r.desvios && typeof r.desvios === "object" && !Array.isArray(r.desvios)) ? r.desvios as Record<string, unknown> : {};
  const items: Partial<Record<string, PostureAiItem>> = {};
  const notVisible: string[] = [];
  for (const key of POSTURE_KEYS) {
    const d = desvios[key] as { grau?: unknown; descricao?: unknown } | undefined;
    if (!d || typeof d !== "object") continue;
    const grau = typeof d.grau === "string" ? d.grau : "";
    if (grau === "nao_visivel") { notVisible.push(key); continue; }
    const grade = AI_GRADE[grau];
    if (!grade) continue;
    items[key] = { grade, description: typeof d.descricao === "string" ? d.descricao.slice(0, 200) : "" };
  }
  const rel = typeof r.reliability === "number" && Number.isFinite(r.reliability) ? Math.max(0, Math.min(1, r.reliability)) : null;
  const issues = Array.isArray(r.problemas_foto) ? (r.problemas_foto as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 4) : [];
  if (Object.keys(items).length === 0 && notVisible.length === 0) return null;
  return { items, notVisible, reliability: rel, photoIssues: issues, generatedAt };
}

/**
 * Aplica as sugestões da IA SÓ onde o coach ainda não marcou nada — a marcação
 * do coach nunca é sobrescrita.
 */
export function applyAiSuggestion(current: PostureFindings, ai: PostureAiSuggestion): PostureFindings {
  const next: PostureFindings = { ...current };
  for (const [key, item] of Object.entries(ai.items)) {
    if (item && next[key] === undefined) next[key] = item.grade;
  }
  return next;
}
