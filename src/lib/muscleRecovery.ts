// muscleRecovery.ts
// Extraído de WorkoutPeriodizationEditor.tsx para ser reaproveitado também
// pelo TemplateLibraryDialog.tsx (preview de templates antes de aplicar),
// sem duplicar a lógica em dois arquivos.

// Mapeia palavras-chave do campo `focus` para grupos musculares
const MUSCLE_GROUPS: Record<string, string[]> = {
  "peito":    ["peito", "peitoral", "chest", "supino", "crucifixo"],
  "costas":   ["costas", "dorsal", "back", "puxada", "remada", "lat"],
  "ombro":    ["ombro", "deltóide", "deltoid", "shoulder", "desenvolvimento"],
  "biceps":   ["bíceps", "biceps", "rosca"],
  "triceps":  ["tríceps", "triceps", "trícep", "tricep", "paralela", "pulley"],
  "quadri":   ["quadríceps", "quadriceps", "agachamento", "leg press", "hack", "inferiores", "perna", "leg"],
  "posterior":["posterior", "femoral", "terra", "romeno", "stiff", "glúteo", "gluteo", "bumbum", "cadeia posterior"],
  "core":     ["core", "abdômen", "abdomen", "abdominal"],
};

// Grupos que precisam de pelo menos 48h entre sessões (antagonistas pesados)
const NEEDS_48H = ["peito","costas","ombro","quadri","posterior"];

function detectMuscleGroups(focus: string): string[] {
  const lower = (focus || "").toLowerCase();
  return Object.entries(MUSCLE_GROUPS)
    .filter(([, kws]) => kws.some((kw) => lower.includes(kw)))
    .map(([group]) => group);
}

/**
 * Retorna avisos de recuperação muscular inadequada para um array de workouts.
 * Assume que os dias se repetem ciclicamente (sem dia fixo da semana).
 */
export function checkMuscleRecovery(workouts: Array<{ key: string; focus: string }>): string[] {
  const warnings: string[] = [];
  const n = workouts.length;
  if (n < 2) return warnings;

  for (let i = 0; i < n; i++) {
    const curr = workouts[i];
    const next = workouts[(i + 1) % n];
    const currGroups = detectMuscleGroups(curr.focus);
    const nextGroups = detectMuscleGroups(next.focus);

    const overlap = currGroups.filter((g) => nextGroups.includes(g) && NEEDS_48H.includes(g));
    if (overlap.length > 0) {
      const isWrap = i === n - 1;
      const label = isWrap
        ? `Treino ${curr.key} → retorno ao Treino ${next.key}`
        : `Treino ${curr.key} → Treino ${next.key}`;
      warnings.push(
        `${label}: grupo(s) ${overlap.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(", ")} treinado(s) em dias consecutivos — recuperação insuficiente (mín. 48h).`
      );
    }
  }
  return warnings;
}
