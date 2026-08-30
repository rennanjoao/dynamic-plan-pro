/**
 * checkInSchema.ts
 * Estrutura declarativa do check-in quinzenal (espelha o portal).
 *
 * CORREÇÃO: campos de braço padronizados para
 * braco_d_relaxado / braco_e_relaxado / braco_d_contraido / braco_e_contraido
 *
 * REVISÃO (reavaliação funcional do Check-in): campos agora podem declarar
 * `condition`, avaliada contra a Anamnese do aluno (linha de base) e contra
 * as respostas já preenchidas no próprio Check-in. Isso permite perguntas
 * condicionais (ex.: colaterais de hormônio só para quem tem protocolo
 * ativo; ciclo menstrual só para alunas) sem esconder nada de quem
 * realmente precisa responder — ver `hasActiveProtocol`/`isFemale` abaixo
 * para a regra de decisão e suas limitações.
 */

import type { SectionDef, FieldRenderContext } from "./anamnesisSchema";
import { NEURO_SLIDERS } from "./anamnesisSchema";
import type { Goal } from "@/utils/macros";

/**
 * Polaridade da métrica em relação ao objetivo do aluno.
 *
 * - `menor_melhor`: reduzir o valor é considerado progresso (ex.: perder peso
 *   quando o objetivo é "emagrecer" ou "recomposicao").
 * - `maior_melhor`: aumentar o valor é considerado progresso (ex.: ganhar
 *   peso quando o objetivo é "hipertrofia").
 * - `neutro`: variações são estabilidade e não devem ser tratadas como
 *   alerta (ex.: objetivo "manter").
 *
 * Tabela fixa — não altera regras de negócio existentes, apenas centraliza
 * a decisão de cor que hoje está duplicada em vários componentes.
 */
export type MetricPolarity = "menor_melhor" | "maior_melhor" | "neutro";

export function getMetricPolarity(goal: Goal): MetricPolarity {
  switch (goal) {
    case "emagrecer":
    case "recomposicao":
      return "menor_melhor";
    case "hipertrofia":
      return "maior_melhor";
    case "manter":
      return "neutro";
  }
}

/**
 * Classe Tailwind de cor de texto para um delta em relação à polaridade.
 * Preserva o mesmo esquema já usado nas telas (emerald = progresso,
 * amber = regressão, muted = estável/neutro).
 */
export function colorForDelta(delta: number | null, polarity: MetricPolarity = "menor_melhor"): string {
  if (delta == null || Math.abs(delta) < 0.05) return "text-muted-foreground";
  if (polarity === "neutro") return "text-muted-foreground";
  const positive = polarity === "menor_melhor" ? delta < 0 : delta > 0;
  return positive ? "text-emerald-500" : "text-amber-500";
}

/**
 * Determina se o aluno tem protocolo ativo (hormônios, manipulados,
 * estimulantes ou suplementação) a partir da Anamnese.
 *
 * Fonte primária: o campo estruturado `usa_hormonio_atualmente` ("Sim"/"Não"),
 * quando presente — resposta explícita manda.
 *
 * FALLBACK (Anamneses enviadas antes desse campo existir): os campos de
 * origem (`hormonios`, `estimulantes`, `suplementacao`) são texto livre —
 * não há flag booleano nesses registros antigos. Por segurança clínica,
 * qualquer valor não-vazio que não pareça uma negação clara ("não",
 * "nenhum", "-"...) é tratado como "possui protocolo". Isso favorece
 * deliberadamente o falso positivo (mostrar a pergunta extra a quem não
 * precisava) em vez do falso negativo (esconder colaterais/adesão de quem
 * realmente usa hormônio). Se a Anamnese ainda não carregou, também assume
 * "possui" pelo mesmo motivo.
 */
const NEGATION_PATTERN = /^(n[aã]o|nenhum[a]?|-+|n\/?a|sem uso)\.?$/i;

function mentionsActiveUse(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  return !NEGATION_PATTERN.test(v);
}

export function hasActiveProtocol(anamnesisPayload: Record<string, unknown> | null | undefined): boolean {
  if (!anamnesisPayload) return true; // sem anamnese carregada ainda → não escondemos por segurança
  // Campo estruturado (Anamneses novas): resposta explícita manda.
  const structured = anamnesisPayload["usa_hormonio_atualmente"];
  if (structured === "Sim") return true;
  if (structured === "Não") return false;
  // Anamneses antigas (sem o campo): mantém a heurística de texto livre.
  return (
    mentionsActiveUse(anamnesisPayload["hormonios"]) ||
    mentionsActiveUse(anamnesisPayload["estimulantes"]) ||
    mentionsActiveUse(anamnesisPayload["suplementacao"])
  );
}

/**
 * Mesma lógica de fallback "gender" → "genero" → "sexo" já usada em
 * MeasurementsEditor / EvolutionComparison / ProgressChart / ComparisonBoard,
 * repetida aqui (não centralizada) para não alterar esses arquivos, que
 * estão fora do escopo desta revisão do Check-in.
 */
export function isFemale(anamnesisPayload: Record<string, unknown> | null | undefined): boolean {
  const g =
    (anamnesisPayload?.["gender"] as string) ||
    (anamnesisPayload?.["genero"] as string) ||
    (anamnesisPayload?.["sexo"] as string) ||
    "";
  return g.toUpperCase().startsWith("F");
}

function answered(ctx: FieldRenderContext, key: string): string | undefined {
  const v = ctx.answers?.[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** true quando `key` foi respondida e a resposta NÃO está entre as excluídas. */
function answeredButNot(ctx: FieldRenderContext, key: string, ...excluded: string[]): boolean {
  const v = answered(ctx, key);
  return v !== undefined && !excluded.includes(v);
}

/** true quando `key` foi respondida com um dos valores em `match`. */
function answeredIs(ctx: FieldRenderContext, key: string, ...match: string[]): boolean {
  const v = answered(ctx, key);
  return v !== undefined && match.includes(v);
}

// Métricas que geram delta vs anamnese
export const CHECKIN_METRICS = [
  { key: "peso",    label: "Peso",    unit: "kg" },
  { key: "pescoco", label: "Pescoço", unit: "cm" },
  { key: "cintura", label: "Cintura", unit: "cm" },
  { key: "quadril", label: "Quadril", unit: "cm" },
  { key: "coxa_d",  label: "Coxa",    unit: "cm" },
  { key: "braco_d_relaxado",  label: "Braço D Rel.",  unit: "cm" },
  { key: "braco_e_relaxado",  label: "Braço E Rel.",  unit: "cm" },
  { key: "braco_d_contraido", label: "Braço D Cont.", unit: "cm" },
  { key: "braco_e_contraido", label: "Braço E Cont.", unit: "cm" },
] as const;

/**
 * Chaves priorizadas para renderizar uma faixa compacta de "Aderência" no
 * Resumo do Check-in do coach. NÃO altera CHECKIN_SECTIONS nem a validação
 * do formulário do aluno — é só um subset visual.
 */
export const CHECKIN_HIGHLIGHT_KEYS = [
  "dieta_adesao",
  "treino_falta",
  "sono_disp",
  "humor_geral",
  "compulsao_estado",
  "aparencia",
] as const;

/**
 * Sinal clínico do aluno — segundo eixo, INDEPENDENTE do badge de atraso.
 *
 * O badge existente (AlertBadge) mede só "quantos dias sem check-in".
 * Este mede "o que o último check-in diz". Regra determinística:
 *
 *  1. `atencao_urgente === "Sim"` → 'alerta' imediato.
 *  2. Senão, contam-se as respostas de CHECKIN_HIGHLIGHT_KEYS:
 *     - 2+ respostas no PIOR valor da escala         → 'alerta'
 *     - 1 resposta no pior valor OU 2+ no intermediário → 'atencao'
 *     - caso contrário                                  → 'ok'
 *  3. Sem check-in → null (neutro, não renderiza badge).
 *
 * `anamnesisPayload` é aceito para uso futuro (contexto de linha de base);
 * hoje a decisão usa apenas o último check-in.
 */
export type ClinicalSignal = "alerta" | "atencao" | "ok";

const CLINICAL_SCALE: Record<string, { worst: string; mid?: string }> = {
  dieta_adesao:     { worst: "Desvios",   mid: "Maioria" },
  treino_falta:     { worst: "2+ dias",   mid: "1 dia" },
  sono_disp:        { worst: "Ruim",      mid: "Regular" },
  humor_geral:      { worst: "Cansado" },
  compulsao_estado: { worst: "Piorou",    mid: "Igual" },
  aparencia:        { worst: "Piorou",    mid: "Igual" },
};

export function getClinicalSignal(
  latestCheckinPayload: Record<string, unknown> | null | undefined,
  anamnesisPayload?: Record<string, unknown> | null
): ClinicalSignal | null {
  if (!latestCheckinPayload) return null;
  if (latestCheckinPayload["atencao_urgente"] === "Sim") return "alerta";

  let worstCount = 0;
  let midCount = 0;
  for (const key of CHECKIN_HIGHLIGHT_KEYS) {
    const scale = CLINICAL_SCALE[key];
    if (!scale) continue;
    const v = latestCheckinPayload[key];
    if (typeof v !== "string" || !v) continue;
    if (v === scale.worst) worstCount++;
    else if (scale.mid && v === scale.mid) midCount++;
  }

  if (worstCount >= 2) return "alerta";
  if (worstCount === 1 || midCount >= 2) return "atencao";
  return "ok";
}

export const CHECKIN_SECTIONS: SectionDef[] = [
  {
    id: "identificacao",
    title: "01 · Identificação",
    fields: [
      { key: "atencao_urgente",   label: "Precisa de atenção prioritária do coach agora?", type: "choices", options: ["Não", "Sim"] },
      { key: "humor_geral",       label: "Como está seu humor e disposição geral?",        type: "choices", options: ["Animado", "Normal", "Cansado"] },
      { key: "evento_relevante",  label: "Aconteceu algo relevante desde o último check-in? (lesão, doença, viagem, novo sintoma)", type: "choices", options: ["Não", "Sim"] },
      {
        key: "evento_relevante_desc", label: "O que aconteceu?", type: "textarea",
        placeholder: "Descreva o evento e como isso afetou sua rotina…",
        condition: (ctx) => answeredIs(ctx, "evento_relevante", "Sim"),
      },
    ],
  },
  {
    id: "dieta",
    title: "02 · Dieta e adesão",
    fields: [
      { key: "dieta_adesao",      label: "Você conseguiu seguir o protocolo de dieta?",    type: "choices", options: ["100%", "Maioria", "Desvios"] },
      { key: "refeicoes_fora",    label: "Quantas refeições livres/fora do plano você fez?", type: "choices", options: ["Nenhuma", "1 ou 2", "3+"] },
      { key: "agua",              label: "Qual a sua média de consumo de água por dia?",   type: "choices", options: ["≤2L", "3L", "4L+"] },
      { key: "carbo_sensacao",    label: "Como você se sentiu nos dias de carboidrato mais alto?", type: "choices", options: ["Melhor", "Igual", "Pior", "Não fiz"] },
      { key: "compulsao_estado",  label: "Teve episódios de compulsão alimentar nesta quinzena?", type: "choices", options: ["Nenhum", "Melhorou", "Igual", "Piorou"] },
      { key: "dieta_dificuldade", label: "Quais as maiores dificuldades na dieta?", type: "textarea", placeholder: "Ex: horários, volume de comida, estufamento, paladar, vontade de doce…" },
      {
        key: "compulsao_detalhes", label: "Qual foi o gatilho da compulsão e a intensidade?", type: "text", placeholder: "Ex: Ansiedade à noite e acabei comendo muito doce...",
        condition: (ctx) => answeredButNot(ctx, "compulsao_estado", "Nenhum"),
      },
      { key: "int_freq",          label: "Quantas vezes ao dia você tem ido ao banheiro (nº 2)?", type: "choices", options: ["< 1x dia", "1-2x dia", "3x+"] },
      { key: "int_cons",          label: "Como está a consistência das fezes?", type: "choices", options: ["Preso", "Normal", "Irregular", "Solto"] },
    ],
  },
  {
    id: "protocolo",
    title: "03 · Protocolo & Saúde",
    fields: [
      {
        key: "protocolo_adesao", label: "Seguiu certinho a suplementação/hormônios/manipulados prescritos?", type: "choices",
        options: ["100%", "Maioria", "Não segui"],
        condition: (ctx) => hasActiveProtocol(ctx.reference),
      },
      {
        key: "protocolo_mudanca", label: "Mudou algo por conta própria ou por indicação médica (sup., hormônios, remédios)?", type: "choices",
        options: ["Não", "Sim"],
        condition: (ctx) => hasActiveProtocol(ctx.reference),
      },
      {
        key: "protocolo_mudanca_desc", label: "O que mudou no seu protocolo?", type: "text", placeholder: "Ex: aumentei a dose de X, parei de tomar Y...",
        condition: (ctx) => answeredIs(ctx, "protocolo_mudanca", "Sim"),
      },
      {
        key: "protocolo_colaterais", label: "Sentiu algum colateral (acne, queda capilar, retenção, humor, oleosidade, etc.)?", type: "choices",
        options: ["Nenhum", "Leve", "Moderado/Forte"],
        condition: (ctx) => hasActiveProtocol(ctx.reference),
      },
      {
        key: "protocolo_colaterais_desc", label: "Descreva o colateral", type: "text", placeholder: "Qual colateral, desde quando começou e qual a intensidade...",
        condition: (ctx) => answeredButNot(ctx, "protocolo_colaterais", "Nenhum"),
      },
      {
        key: "ciclo_menstrual", label: "Como está seu ciclo menstrual nesta quinzena?", type: "choices",
        options: ["Regular", "Atrasado/Irregular", "Ausente", "Não sei"],
        condition: (ctx) => isFemale(ctx.reference),
      },
    ],
  },
  {
    id: "treino_sono",
    title: "04 · Treino e sono",
    fields: [
      { key: "treino_falta",   label: "Você faltou a algum treino programado?",  type: "choices", options: ["Nenhum", "1 dia", "2+ dias"] },
      { key: "treino_perf",    label: "Como você avalia seu desempenho e 'pump' nos treinos?", type: "choices", options: ["Excelente", "Médio", "Ruim"] },
      { key: "treino_dificuldade", label: "Quais as maiores dificuldades no treino?", type: "textarea", placeholder: "Ex: dor na lombar, falta de tempo, cansaço extremo, não consigo progredir carga…" },
      { key: "aerobico_orientacoes", label: "Está conseguindo seguir as orientações do aeróbico?", type: "choices", options: ["Sim", "Não"] },
      {
        key: "aerobico_obs", label: "O que dificultou fazer o aeróbico?", type: "textarea", placeholder: "Descreva os motivos (ex: falta de tempo, preguiça, cansaço nas pernas)…",
        condition: (ctx) => answeredIs(ctx, "aerobico_orientacoes", "Não"),
      },
      { key: "treino_horario", label: "Qual será o seu horário de treino na próxima quinzena?", type: "text", placeholder: "Ex: Vou treinar todos os dias às 19:30." },
      { key: "sono_disp",        label: "Como você avalia a qualidade do seu sono?", type: "choices", options: ["Ótimo", "Regular", "Ruim"] },
      { key: "sono_como_acorda", label: "Como você se sente ao acordar?", type: "choices", options: ["Descansado", "Com disposição", "Cansado", "Com dor"] },
      { key: "sono_acorda",      label: "Você tem acordado no meio da madrugada?", type: "choices", options: ["Não", "1x", "2x+"] },
      { key: "stress",           label: "Como está o seu nível de estresse diário?", type: "choices", options: ["Baixo", "Médio", "Alto"] },
    ],
  },
  {
    id: "neuro",
    title: "05 · Como você se sente (0 a 10)",
    fields: NEURO_SLIDERS.map((s) => ({ key: s.key, label: s.label, type: "slider" as const })),
  },
  {
    id: "final",
    title: "06 · Finalização",
    fields: [
      { key: "aparencia",          label: "Você notou melhora no espelho ou nas roupas?", type: "choices", options: ["Melhorou", "Igual", "Piorou"] },
      { key: "meta_ainda_valida",  label: "Sua meta principal ainda é a mesma do início?", type: "choices", options: ["Sim", "Mudou"] },
      {
        key: "aparencia_desc", label: "O que você percebeu de diferente?", type: "text", placeholder: "Ex: Mais definição no abdômen, me sentindo mais retido(a)…",
        condition: (ctx) => answeredButNot(ctx, "aparencia", "Igual"),
      },
      { key: "temp_d1",            label: "Temperatura ao acordar (Dia 1)", type: "number", step: "0.01", unit: "°C", half: true, placeholder: "Ex: 36.5" },
      { key: "temp_d2",            label: "Temperatura ao acordar (Dia 2)", type: "number", step: "0.01", unit: "°C", half: true, placeholder: "Ex: 36.6" },
      { key: "temp_d3",            label: "Temperatura ao acordar (Dia 3)", type: "number", step: "0.01", unit: "°C", half: true, placeholder: "Ex: 36.5" },
      { key: "temp_d4",            label: "Temperatura ao acordar (Dia 4)", type: "number", step: "0.01", unit: "°C", half: true, placeholder: "Ex: 36.4" },
      { key: "temp_d5",            label: "Temperatura ao acordar (Dia 5)", type: "number", step: "0.01", unit: "°C", half: true, placeholder: "Ex: 36.5" },
      { key: "exame_obs",          label: "Tem algum resultado de exame novo ou orientação médica?", type: "text", placeholder: "Ex: Fiz exames ontem e o colesterol deu alterado..." },
      { key: "observacoes",        label: "Quer deixar algum recado, dúvida ou observação para o Coach?", type: "textarea", placeholder: "Use este espaço para falar o que quiser." },
    ],
  },
];
