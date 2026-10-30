export type RedFlagKey =
  | "tingling"
  | "strength_loss"
  | "radiating_pain"
  | "trauma"
  | "gait_change"
  | "persistent_pain";

export type RedFlags = Record<RedFlagKey, boolean>;
export type ViewAngle = "front" | "side" | "back";
export type ProgressionLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type FunctionalTestId =
  | "bodyweight_squat"
  | "glute_bridge"
  | "quadruped_hip_extension"
  | "single_leg_stance"
  | "hip_flexor_mobility"
  | "post_intervention_response";

export type Side = "left" | "right" | "bilateral" | "not_applicable";

export type CompensationId =
  | "lumbar_dominance_bridge_hip_thrust"
  | "hip_flexor_dominance"
  | "rib_pelvis_control_limited"
  | "knee_valgus_squat_lunge"
  | "pelvic_drop_single_leg"
  | "pelvic_rotation_quadruped"
  | "foot_support_instability"
  | "other";

export interface StaticObservations {
  pelvicTilt?: "anterior" | "posterior" | "neutral_or_variable" | "not_assessed";
  lumbarCurve?: "increased" | "reduced" | "not_obvious" | "not_assessed";
  ribPelvisRelationship?: string | null;
  kneePosition?: string | null;
  footSupport?: string | null;
  weightDistribution?: string | null;
  asymmetries?: string | null;
  frontNotes?: string | null;
  sideNotes?: string | null;
  backNotes?: string | null;
}

export interface FunctionalTestRecord {
  test: FunctionalTestId;
  label: string;
  completed: boolean;
  side: Side;
  observations: string;
  painScore: number | null;
  result: string;
  beforeIntervention?: string | null;
  afterIntervention?: string | null;
}

export interface DecisionRecord {
  compensation: CompensationId | null;
  dominantStrategyHypothesis: string;
  muscleGroupToFavor: string;
  chosenRegression: string;
  suggestedStrategies: string[];
  coachConfirmed: boolean;
}

export interface PostureAssessmentFormValues {
  assessedAt: string;
  complaint: string;
  painScore: number | null;
  painLocation: string;
  painWorseWith: string;
  painBetterWith: string;
  muscleSensation: string;
  relevantHistory: string;
  redFlags: RedFlags;
  referralRecommended: boolean;
  staticObservations: StaticObservations;
  functionalTests: FunctionalTestRecord[];
  decision: DecisionRecord;
  intervention: string;
  postInterventionResponse: string;
  progressionLevel: ProgressionLevel | null;
  progressionCriterion: string;
  notes: string;
  photoPaths: Record<ViewAngle, string | null>;
}

export const PROGRESSION_LEVELS: ReadonlyArray<{ value: ProgressionLevel; label: string }> = [
  { value: 1, label: "Percepção" },
  { value: 2, label: "Controle" },
  { value: 3, label: "Resistência" },
  { value: 4, label: "Carga" },
  { value: 5, label: "Complexidade" },
  { value: 6, label: "Especificidade" },
];

export const RED_FLAG_LABELS: Record<RedFlagKey, string> = {
  tingling: "Formigamento",
  strength_loss: "Perda de força",
  radiating_pain: "Dor irradiada",
  trauma: "Trauma recente",
  gait_change: "Alteração importante da marcha",
  persistent_pain: "Dor persistente",
};

export const FUNCTIONAL_TESTS: ReadonlyArray<{ id: FunctionalTestId; label: string; hint: string }> = [
  { id: "bodyweight_squat", label: "Agachamento com peso corporal", hint: "Controle pélvico, joelhos, desvio de peso, lombar, dor." },
  { id: "glute_bridge", label: "Ponte de glúteo", hint: "Início do movimento, rotação pélvica, respiração, lados, lombar." },
  { id: "quadruped_hip_extension", label: "Extensão de quadril em quatro apoios", hint: "Lado a lado, rotação pélvica, curva lombar." },
  { id: "single_leg_stance", label: "Apoio unipodal", hint: "20–30 s se confortável; queda pélvica, tronco, pé, joelho." },
  { id: "hip_flexor_mobility", label: "Mobilidade do flexor do quadril", hint: "Variante usada, conforto, posição pélvica." },
  { id: "post_intervention_response", label: "Resposta pós-intervenção leve", hint: "Tarefa antes, intervenção leve, resultado depois." },
];

export const VIEW_LABELS: Record<ViewAngle, string> = { front: "Frente", side: "Lado", back: "Costas" };
