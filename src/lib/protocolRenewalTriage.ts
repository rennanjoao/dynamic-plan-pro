/**
 * Triagem da IA (`protocol-renewal-draft`) — fonte única de rótulo e cor.
 * Antes esse mapa vivia duplicado em ProtocolBuilder.tsx e CheckinFeedbackPanel.tsx,
 * com a caixa sempre verde mesmo quando a ação era um alerta clínico.
 */
export type TriageSeverity = "positivo" | "atencao" | "critico";

/** Rótulos humanos da triagem gerada por `protocol-renewal-draft`. */
export const TRIAGE_ACTION_LABEL: Record<string, string> = {
  nenhuma_alteracao: "Sem alteração no protocolo",
  orientar_coach: "Orientar o aluno",
  investigar_antes: "Investigar antes de ajustar",
  recomendar_exame: "Recomendar exame",
  reduzir_carga_treino: "Reduzir carga de treino",
  acompanhar_mais_um_ciclo: "Acompanhar mais um ciclo",
  ajustar: "Ajuste sugerido no protocolo",
};

/**
 * Severidade por ação, seguindo os grupos documentados no prompt da própria
 * edge function: sinais clínicos (dor, sono péssimo, exaustão, sintomas) geram
 * investigar_antes / recomendar_exame / reduzir_carga_treino.
 */
export const TRIAGE_ACTION_SEVERITY: Record<string, TriageSeverity> = {
  nenhuma_alteracao: "positivo",
  acompanhar_mais_um_ciclo: "positivo",
  ajustar: "positivo",
  orientar_coach: "atencao",
  investigar_antes: "critico",
  recomendar_exame: "critico",
  reduzir_carga_treino: "critico",
};

const SEVERITY_CLASSES: Record<TriageSeverity, { box: string; text: string }> = {
  positivo: { box: "border-emerald-500/30 bg-emerald-500/5", text: "text-emerald-700" },
  atencao:  { box: "border-amber-500/40 bg-amber-500/5",     text: "text-amber-600" },
  critico:  { box: "border-red-500/30 bg-red-500/10",        text: "text-red-600" },
};

export function triageSeverity(acao: string | null | undefined): TriageSeverity {
  return TRIAGE_ACTION_SEVERITY[acao ?? ""] ?? "atencao";
}

export function triageClasses(acao: string | null | undefined) {
  return SEVERITY_CLASSES[triageSeverity(acao)];
}

export function triageLabel(acao: string | null | undefined): string {
  return TRIAGE_ACTION_LABEL[acao ?? ""] ?? (acao || "—");
}
