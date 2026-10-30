import type {
  CompensationId,
  FunctionalTestId,
  PostureAssessmentFormValues,
  RedFlags,
} from "@/types/postureAssessment";
import { FUNCTIONAL_TESTS } from "@/types/postureAssessment";

export interface PostureSuggestion {
  label: string;
  hypothesis: string;
  muscleGroupToFavor: string;
  strategies: readonly string[];
  regression: string;
  tests: readonly FunctionalTestId[];
  caution: string;
}

/** Catálogo determinístico: sugere ao Coach, nunca diagnostica. */
export const POSTURE_SUGGESTION_RULES: Record<CompensationId, PostureSuggestion> = {
  lumbar_dominance_bridge_hip_thrust: {
    label: "Lombar dominante na ponte/hip thrust",
    hypothesis: "Possível estratégia com participação dominante de extensores lombares; confirmar pela resposta a ajustes de posição e amplitude.",
    muscleGroupToFavor: "Glúteo máximo e controle abdominal anti-extensão/costelas–pelve.",
    strategies: [
      "Reduzir a amplitude para uma faixa controlável.",
      "Experimentar expiração suave durante a subida.",
      "Organizar as costelas sem impor retroversão máxima.",
      "Finalizar pelo quadril, sem projetar o peito para trás.",
      "Usar pausa curta no topo sem aumentar a curva lombar.",
    ],
    regression: "Ponte sem carga, amplitude reduzida, andamento lento e pausa curta; interromper se provocar dor.",
    tests: ["glute_bridge", "post_intervention_response"],
    caution: "Sensação na lombar, isoladamente, não diagnostica dominância muscular nem lesão.",
  },
  hip_flexor_dominance: {
    label: "Flexores do quadril dominantes",
    hypothesis: "Possível participação excessiva ou limitação aparente de flexores do quadril; o teste não confirma encurtamento isoladamente.",
    muscleGroupToFavor: "Glúteo máximo e estabilidade do tronco, conforme resposta funcional.",
    strategies: [
      "Organizar a pelve antes de testar mobilidade.",
      "Usar mobilidade ativa confortável, sem forçar amplitude nem dor.",
      "Comparar a tarefa com menor amplitude e tronco estável.",
    ],
    regression: "Reduzir amplitude e escolher posição em que o aluno mantenha controle sem dor.",
    tests: ["hip_flexor_mobility", "quadruped_hip_extension"],
    caution: "Posição, reto femoral e controle podem influenciar o resultado; não inferir diagnóstico.",
  },
  rib_pelvis_control_limited: {
    label: "Controle costelas–pelve limitado",
    hypothesis: "Controle costelas–pelve pode estar limitado nesta tarefa; verificar se cue respiratório leve modifica a execução.",
    muscleGroupToFavor: "Abdômen (anti-extensão) e glúteo máximo (extensão de quadril).",
    strategies: [
      "Começar com expiração confortável e baixa demanda.",
      "Manter respiração fluida; não pedir que prenda a barriga.",
      "Testar exercício anti-extensão regressivo se bem tolerado.",
    ],
    regression: "Reduzir carga e amplitude; praticar controle respiratório em posição confortável.",
    tests: ["glute_bridge", "bodyweight_squat", "post_intervention_response"],
    caution: "Não exigir posição rígida nem uma postura única para todos.",
  },
  knee_valgus_squat_lunge: {
    label: "Joelho para dentro (agachamento/afundo)",
    hypothesis: "Joelho desloca-se para dentro nesta tarefa; observar pé, velocidade, amplitude e contexto antes de escolher grupo muscular.",
    muscleGroupToFavor: "Controle do quadril e do apoio do pé/perna, conforme o padrão observado.",
    strategies: [
      "Reduzir amplitude e velocidade.",
      "Oferecer apoio, espelho ou feedback tátil leve com consentimento.",
      "Observar apoio do pé antes de atribuir a causa ao glúteo médio.",
    ],
    regression: "Agachamento com apoio e amplitude menor, sem dor, progredindo pela qualidade do movimento.",
    tests: ["bodyweight_squat", "single_leg_stance"],
    caution: "Valgo visual isolado não identifica causa nem fraqueza específica.",
  },
  pelvic_drop_single_leg: {
    label: "Queda pélvica no apoio unipodal",
    hypothesis: "Queda pélvica/compensação de tronco no apoio unipodal; comparar os lados sem concluir fraqueza por um teste isolado.",
    muscleGroupToFavor: "Controle lateral do quadril/tronco e musculatura do pé conforme observação.",
    strategies: [
      "Usar apoio externo e reduzir duração do teste.",
      "Priorizar alinhamento confortável e estabilidade do pé.",
      "Comparar tentativas curtas sem dor.",
    ],
    regression: "Apoio unipodal assistido por poucos segundos, ou tarefa bilateral estável.",
    tests: ["single_leg_stance"],
    caution: "O teste não confirma isoladamente fraqueza do glúteo médio.",
  },
  pelvic_rotation_quadruped: {
    label: "Rotação pélvica em quatro apoios",
    hypothesis: "Rotação pélvica na extensão do quadril em quatro apoios; verificar mudança com amplitude menor e ritmo lento.",
    muscleGroupToFavor: "Glúteo máximo com controle lombo-pélvico.",
    strategies: [
      "Reduzir amplitude até a pelve permanecer controlada.",
      "Movimentar devagar e comparar os lados.",
      "Usar cue simples de estabilidade sem rigidez excessiva.",
    ],
    regression: "Extensão de quadril em quatro apoios com amplitude curta e sem carga.",
    tests: ["quadruped_hip_extension", "post_intervention_response"],
    caution: "Registrar compensação observável; não declarar encurtamento/lesão por aparência.",
  },
  foot_support_instability: {
    label: "Apoio do pé instável",
    hypothesis: "Apoio do pé parece instável na tarefa; verificar calçado, superfície, equilíbrio e conforto.",
    muscleGroupToFavor: "Musculatura do pé/perna e controle do quadril conforme necessidade demonstrada.",
    strategies: [
      "Diminuir complexidade e duração.",
      "Permitir apoio externo e superfície segura.",
      "Progredir quando houver estabilidade confortável e sem dor.",
    ],
    regression: "Tarefa bilateral estável ou apoio unipodal assistido.",
    tests: ["single_leg_stance", "bodyweight_squat"],
    caution: "Instabilidade observada não equivale a diagnóstico.",
  },
  other: {
    label: "Outra (descrever)",
    hypothesis: "Registrar descrição observável e formular hipótese manualmente; o sistema não possui regra para esta compensação.",
    muscleGroupToFavor: "Definido pelo Coach após observação e resposta à regressão.",
    strategies: ["Reduzir demanda se necessário.", "Repetir somente se confortável e sem dor."],
    regression: "Definida pelo Coach, priorizando tarefa segura, confortável e controlável.",
    tests: [],
    caution: "Não inferir diagnóstico nem prescrever conduta automática.",
  },
};

export function hasRedFlag(flags: RedFlags | null | undefined): boolean {
  return !!flags && Object.values(flags).some(Boolean);
}

/** Com sinal de alerta, não há sugestão de exercício: prevalece o encaminhamento. */
export function suggestionFor(
  compensation: CompensationId | null,
  flags: RedFlags,
): PostureSuggestion | null {
  if (!compensation || hasRedFlag(flags)) return null;
  return POSTURE_SUGGESTION_RULES[compensation];
}

export const EMPTY_RED_FLAGS: RedFlags = {
  tingling: false,
  strength_loss: false,
  radiating_pain: false,
  trauma: false,
  gait_change: false,
  persistent_pain: false,
};

export function emptyPostureForm(now = new Date()): PostureAssessmentFormValues {
  return {
    assessedAt: now.toISOString().slice(0, 10),
    complaint: "",
    painScore: null,
    painLocation: "",
    painWorseWith: "",
    painBetterWith: "",
    muscleSensation: "",
    relevantHistory: "",
    redFlags: { ...EMPTY_RED_FLAGS },
    referralRecommended: false,
    staticObservations: { pelvicTilt: "not_assessed", lumbarCurve: "not_assessed" },
    functionalTests: FUNCTIONAL_TESTS.map((t) => ({
      test: t.id,
      label: t.label,
      completed: false,
      side: "not_applicable",
      observations: "",
      painScore: null,
      result: "",
      beforeIntervention: null,
      afterIntervention: null,
    })),
    decision: {
      compensation: null,
      dominantStrategyHypothesis: "",
      muscleGroupToFavor: "",
      chosenRegression: "",
      suggestedStrategies: [],
      coachConfirmed: false,
    },
    intervention: "",
    postInterventionResponse: "",
    progressionLevel: null,
    progressionCriterion: "",
    notes: "",
    photoPaths: { front: null, side: null, back: null },
  };
}

/** Retorna lista de erros (vazia = válido). Ficha preliminar é permitida. */
export function validatePostureForm(v: PostureAssessmentFormValues): string[] {
  const errors: string[] = [];
  const isScore = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 10);
  if (!v.assessedAt) errors.push("Informe a data da avaliação.");
  if (!isScore(v.painScore)) errors.push("Dor deve ser um número inteiro de 0 a 10.");
  for (const t of v.functionalTests) {
    if (!isScore(t.painScore)) errors.push(`Dor em "${t.label}" deve ser de 0 a 10.`);
  }
  if (v.progressionLevel !== null && !(Number.isInteger(v.progressionLevel) && v.progressionLevel >= 1 && v.progressionLevel <= 6)) {
    errors.push("Nível de progressão deve ser de 1 a 6.");
  }
  if (hasRedFlag(v.redFlags)) {
    if (!v.referralRecommended) errors.push("Com sinal de alerta marcado, registre o encaminhamento recomendado.");
    if (v.functionalTests.some((t) => t.completed)) errors.push("Com sinal de alerta, os testes funcionais não devem ser realizados.");
  }
  return errors;
}

export function postureStoragePath(studentId: string, assessmentId: string, view: string, fileName: string): string {
  const ext = (fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${studentId}/posture-assessments/${assessmentId}/${view}.${ext}`;
}
