// Padrão de movimento do exercício (exercise_library.movement_pattern).
// NULL = ainda não classificado — é o estado padrão de toda a biblioteca atual.
export const MOVEMENT_PATTERNS = [
  "agachamento",
  "dobradica_quadril",
  "impulso",
  "abducao",
  "outro",
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  agachamento: "Agachamento",
  dobradica_quadril: "Dobradiça de quadril",
  impulso: "Impulso",
  abducao: "Abdução",
  outro: "Outro",
};
