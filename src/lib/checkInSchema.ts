/**
 * checkInSchema.ts
 * Estrutura declarativa do check-in quinzenal (espelha o portal).
 *
 * CORREÇÃO: campos de braço padronizados para
 * braco_d_relaxado / braco_e_relaxado / braco_d_contraido / braco_e_contraido
 */

import type { SectionDef } from "./anamnesisSchema";
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

export const CHECKIN_SECTIONS: SectionDef[] = [
  {
    id: "identificacao",
    title: "01 · Identificação",
    fields: [
      { key: "humor_geral", label: "Humor geral", type: "choices", options: ["Animado", "Normal", "Cansado"] },
    ],
  },
  {
    id: "dieta",
    title: "02 · Dieta e adesão",
    fields: [
      { key: "dieta_adesao",      label: "Seguiu o protocolo?",           type: "choices", options: ["100%", "Maioria", "Desvios"] },
      { key: "refeicoes_fora",    label: "Refeições fora de casa",        type: "choices", options: ["Nenhuma", "1 ou 2", "3+"] },
      { key: "agua",              label: "Água diária (média)",           type: "choices", options: ["≤2L", "3L", "4L+"] },
      { key: "carbo_sensacao",    label: "Sensação após carbo alto",      type: "choices", options: ["Melhor", "Igual", "Pior", "Não fiz"] },
      { key: "compulsao_estado",  label: "Episódios de compulsão",       type: "choices", options: ["Nenhum", "Melhorou", "Igual", "Piorou"] },
      { key: "compulsao_detalhes",label: "Intensidade / gatilho (se houver)", type: "text", placeholder: "Ex: Ansiedade à noite…" },
      { key: "int_freq",          label: "Intestino — frequência",        type: "choices", options: ["< 1x dia", "1-2x dia", "3x+"] },
      { key: "int_cons",          label: "Intestino — consistência",      type: "choices", options: ["Preso", "Normal", "Irregular", "Solto"] },
    ],
  },
  {
    id: "treino_sono",
    title: "03 · Treino e sono",
    fields: [
      { key: "treino_falta",   label: "Faltou algum treino?",             type: "choices", options: ["Nenhum", "1 dia", "2+ dias"] },
      { key: "treino_perf",    label: "Pump e desempenho",                type: "choices", options: ["Excelente", "Médio", "Ruim"] },
      { key: "aerobico_jejum", label: "Aeróbico em jejum (40-50min)",     type: "choices", options: ["Sim", "Alguns dias", "Não"] },
      { key: "aerobico_obs",   label: "Observações sobre aeróbico",       type: "text" },
      { key: "treino_horario", label: "Horário de treino p/ próxima quinzena", type: "text", placeholder: "Ex: 19:30" },
      { key: "sono_disp",        label: "Sono",                             type: "choices", options: ["Ótimo", "Regular", "Ruim"] },
      { key: "sono_como_acorda", label: "Como acorda?",                     type: "choices", options: ["Descansado", "Com disposição", "Cansado", "Com dor"] },
      { key: "sono_acorda",      label: "Acorda à noite?",                  type: "choices", options: ["Não", "1x", "2x+"] },
      { key: "stress",         label: "Stress geral",                     type: "choices", options: ["Baixo", "Médio", "Alto"] },
      { key: "libido",         label: "Libido",                          type: "choices", options: ["Alta", "Normal", "Baixa"] },
    ],
  },
  {
    id: "final",
    title: "04 · Finalização",
    fields: [
      { key: "aparencia",          label: "Notou melhora no corpo?",           type: "choices", options: ["Melhorou", "Igual", "Piorou"] },
      { key: "aparencia_desc",     label: "Descreva brevemente",               type: "text", placeholder: "Definição, retenção…" },
      { key: "temp_d1",            label: "Temp. D1 (manhã)",                  type: "number", step: "0.01", unit: "°C", half: true },
      { key: "temp_d2",            label: "Temp. D2",                          type: "number", step: "0.01", unit: "°C", half: true },
      { key: "temp_d3",            label: "Temp. D3",                          type: "number", step: "0.01", unit: "°C", half: true },
      { key: "temp_d4",            label: "Temp. D4",                          type: "number", step: "0.01", unit: "°C", half: true },
      { key: "temp_d5",            label: "Temp. D5",                          type: "number", step: "0.01", unit: "°C", half: true },
      { key: "observacoes",        label: "Observações livres pro coach",       type: "textarea" },
    ],
  },
];
