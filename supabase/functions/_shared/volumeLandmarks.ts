// src/lib/volumeLandmarks.ts
// Referências de volume semanal por grupamento muscular (séries efetivas/semana).
// MEV = mínimo para estímulo, MAV = faixa adaptativa (alvo), MRV = teto recuperável.
// Valores de referência da literatura aplicada de hipertrofia — usados apenas
// como sinalização para o coach, nunca como prescrição automática.

import type { MuscleGroup } from "./muscleGroupClassifier.ts";

export interface VolumeLandmark {
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmark> = {
  peito:          { mev: 8,  mavMin: 12, mavMax: 20, mrv: 22 },
  costas:         { mev: 10, mavMin: 14, mavMax: 22, mrv: 25 },
  trapezio:       { mev: 4,  mavMin: 6,  mavMax: 16, mrv: 20 },
  lombar:         { mev: 2,  mavMin: 4,  mavMax: 10, mrv: 12 },
  ombro:          { mev: 8,  mavMin: 12, mavMax: 22, mrv: 26 },
  biceps:         { mev: 6,  mavMin: 10, mavMax: 18, mrv: 20 },
  triceps:        { mev: 6,  mavMin: 10, mavMax: 18, mrv: 20 },
  antebraco:      { mev: 2,  mavMin: 4,  mavMax: 12, mrv: 15 },
  quadriceps:     { mev: 8,  mavMin: 12, mavMax: 18, mrv: 20 },
  posterior_coxa: { mev: 6,  mavMin: 10, mavMax: 16, mrv: 18 },
  gluteo:         { mev: 4,  mavMin: 8,  mavMax: 16, mrv: 20 },
  adutores:       { mev: 2,  mavMin: 4,  mavMax: 10, mrv: 12 },
  panturrilha:    { mev: 6,  mavMin: 8,  mavMax: 16, mrv: 20 },
  abdomen:        { mev: 4,  mavMin: 6,  mavMax: 16, mrv: 20 },
};

export type VolumeStatus = "abaixo_mev" | "mev" | "otimo" | "acima_mrv";

export const VOLUME_STATUS_META: Record<VolumeStatus, { label: string; color: string; cls: string }> = {
  abaixo_mev: { label: "Abaixo do mínimo", color: "#f59e0b", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  mev:        { label: "No mínimo",        color: "#60a5fa", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  otimo:      { label: "Faixa ideal",      color: "#22c55e", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  acima_mrv:  { label: "Acima do teto",    color: "#ef4444", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
};

/** Classifica o volume semanal (séries) de um grupamento contra os landmarks. */
export function classifyWeeklyVolume(group: MuscleGroup, weeklySets: number): VolumeStatus {
  const lm = VOLUME_LANDMARKS[group];
  if (weeklySets > lm.mrv) return "acima_mrv";
  if (weeklySets >= lm.mavMin) return "otimo";
  if (weeklySets >= lm.mev) return "mev";
  return "abaixo_mev";
}
