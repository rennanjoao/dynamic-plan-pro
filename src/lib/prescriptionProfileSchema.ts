// Perfil de prescrição por aluno (tabela prescription_profile).
// Estado ATUAL, sem versionamento: um único row por aluno, sobrescrito a cada
// edição. Guarda apenas o que não existe em nenhum outro lugar do sistema —
// prioridade por grupo muscular, dominância, limitações e observação visual.
// O objetivo geral do aluno continua em anamnesis.meta_prioridade.
import { z } from "zod";
import { MUSCLE_GROUP_OPTIONS, type MuscleGroup } from "@/lib/muscleGroupClassifier";

export const PRIORITY_LEVELS = [
  "alta",
  "secundaria",
  "manutencao",
  "controle_crescimento",
  "sem_prioridade",
] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const PRIORITY_LEVEL_LABELS: Record<PriorityLevel, string> = {
  alta: "Prioridade alta",
  secundaria: "Prioridade secundária",
  manutencao: "Manutenção",
  controle_crescimento: "Controlar crescimento",
  sem_prioridade: "Sem prioridade",
};

export const DOMINANCES = [
  "quadriceps_dominant",
  "hamstring_dominant",
  "glute_dominant",
] as const;
export type Dominance = (typeof DOMINANCES)[number];

export const DOMINANCE_LABELS: Record<Dominance, string> = {
  quadriceps_dominant: "Dominância de quadríceps",
  hamstring_dominant: "Dominância de posterior",
  glute_dominant: "Dominância de glúteo",
};

export const SOURCES = [
  "CLIENT_REPORT",
  "COACH_OBSERVATION",
  "VISUAL_OBSERVATION",
  "TRAINING_HISTORY",
  "MEASUREMENTS",
  "SYSTEM_INFERENCE",
] as const;
export type SourceKind = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<SourceKind, string> = {
  CLIENT_REPORT: "Relato do aluno",
  COACH_OBSERVATION: "Observação do coach",
  VISUAL_OBSERVATION: "Observação visual",
  TRAINING_HISTORY: "Histórico de treino",
  MEASUREMENTS: "Medidas",
  SYSTEM_INFERENCE: "Inferência do sistema",
};

const MuscleGroupKey = z.enum(
  MUSCLE_GROUP_OPTIONS as unknown as [MuscleGroup, ...MuscleGroup[]],
);

export const PrescriptionProfileSchema = z.object({
  student_id: z.string().uuid(),
  coach_id: z.string().uuid(),
  muscle_priorities: z.record(MuscleGroupKey, z.enum(PRIORITY_LEVELS)).default({}),
  dominances: z.array(z.enum(DOMINANCES)).default([]),
  limitations: z.string().nullable().default(null),
  visual_observations: z.string().nullable().default(null),
  sources: z.record(z.string(), z.enum(SOURCES)).default({}),
});

export type PrescriptionProfile = z.infer<typeof PrescriptionProfileSchema>;

/** Campos que carregam origem (sources) na UI. */
export const SOURCED_FIELDS = [
  { key: "muscle_priorities", label: "Prioridades por grupo muscular" },
  { key: "dominances", label: "Dominâncias" },
  { key: "limitations", label: "Limitações" },
  { key: "visual_observations", label: "Observação visual (indício, não diagnóstico)" },
] as const;
