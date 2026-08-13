/** Radar de Evolução (tabela `coach_insights`) — metadados compartilhados. */
export type CoachInsightSituacao = "boa" | "atencao" | "risco" | "dados_insuficientes";

const GOLD  = "#C9A84C";
const RED   = "#CC0000";
const GREEN = "#22c55e";

export const INSIGHT_META: Record<CoachInsightSituacao, { label: string; emoji: string; color: string; bg: string }> = {
  boa:                 { label: "Evolução consistente", emoji: "🟢", color: GREEN,      bg: "rgba(34,197,94,0.06)" },
  atencao:             { label: "Atenção",               emoji: "🟡", color: GOLD,       bg: "rgba(201,168,76,0.06)" },
  risco:               { label: "Risco — vale intervir", emoji: "🔴", color: RED,        bg: "rgba(204,0,0,0.06)" },
  dados_insuficientes: { label: "Dados insuficientes",   emoji: "❓", color: "#9ca3af",  bg: "rgba(255,255,255,0.03)" },
};
