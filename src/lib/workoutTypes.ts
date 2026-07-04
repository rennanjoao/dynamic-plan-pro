// src/lib/workoutTypes.ts
// Tipos para o sistema de logbook de treinos (Sprint 1+)

// ── Sessão de treino ──────────────────────────────────────────────────────────
export interface WorkoutSession {
  id: string;
  user_id: string;
  coach_id?: string;
  plan_id?: string;
  workout_key: string;
  workout_label?: string;
  periodization_week?: number;
  block_number: number;
  started_at: string;
  ended_at?: string;
  general_feeling?: 1 | 2 | 3; // 1=Pesado 2=Bom 3=Top
  sleep_quality?: 1 | 2 | 3;   // 1=Mal  2=Normal 3=Bem
  notes?: string;
  is_deload_week: boolean;
  created_at: string;
  updated_at: string;
}

// ── Série executada ───────────────────────────────────────────────────────────
export interface WorkoutSet {
  id: string;
  session_id: string;
  user_id: string;
  exercise_name: string;
  exercise_key: string;
  muscle_group?: string;
  set_number: number;
  weight_kg?: number;
  reps?: number;
  reps_target_min?: number;
  reps_target_max?: number;
  /** 1=Limpo(RIR 3+)  2=Pesado(RIR 1-2)  3=Falhei(RIR 0) */
  perceived_effort?: 1 | 2 | 3;
  completed: boolean;
  skipped: boolean;
  notes?: string;
  executed_at: string;
  created_at: string;
}

// ── Estado de série no Modo Treino ────────────────────────────────────────────
export interface SetEntry {
  setNumber: number;
  weight?: number;
  reps?: number;
  perceivedEffort?: 1 | 2 | 3;
  status: "pending" | "active" | "completed" | "skipped";
  completedAt?: string;
}

// ── Histórico de exercício para exibição no Modo Treino ───────────────────────
export interface ExerciseHistory {
  weightKg: number;
  reps: number;
  perceivedEffort?: 1 | 2 | 3;
  executedAt: string;
  sessionLabel?: string;
}

// ── Sugestão de progressão ────────────────────────────────────────────────────
export interface ProgressionSuggestion {
  exerciseKey: string;
  exerciseName: string;
  currentWeight: number;
  suggestedWeight: number;
  reason: "increase" | "maintain" | "reduce" | "consolidate";
  message: string;
}

// ── Alerta de fadiga ──────────────────────────────────────────────────────────
export interface CoachFatigueAlert {
  id: string;
  coach_id: string;
  student_id: string;
  alert_type:
    | "high_rpe"
    | "poor_sleep"
    | "stagnation"
    | "low_adherence"
    | "overreaching";
  severity: "info" | "warning" | "critical";
  context: Record<string, unknown>;
  message: string;
  suggestion?: string;
  is_read: boolean;
  resolved_at?: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normaliza o nome de um exercício para uma chave consistente.
 * "Supino Reto com Barra" → "supino_reto_com_barra"
 */
export function toExerciseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Rótulo legível para perceived_effort.
 */
export function effortLabel(effort?: 1 | 2 | 3): string {
  if (!effort) return "—";
  return effort === 1 ? "Limpo" : effort === 2 ? "Pesado" : "Falhei";
}

/**
 * Estima o RIR com base no perceived_effort.
 */
export function estimatedRIR(effort?: 1 | 2 | 3): number | null {
  if (!effort) return null;
  return effort === 1 ? 3 : effort === 2 ? 1 : 0;
}

/**
 * Calcula o 1RM estimado pela fórmula de Epley.
 * Referência: Epley B (1985).
 */
export function epley1RM(weightKg: number, reps: number): number {
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

/**
 * Extrai o menor número de repetições de uma string como "8 a 12 reps".
 */
export function parseRepsMin(s?: string): number {
  if (!s) return 0;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 0;
  return Math.min(...nums.map(Number));
}

/**
 * Extrai o maior número de repetições de uma string como "8 a 12 reps".
 */
export function parseRepsMax(s?: string): number {
  if (!s) return 0;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 0;
  return Math.max(...nums.map(Number));
}
