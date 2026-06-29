// src/hooks/useLoadProgression.ts
// Detecta padrão de overload progressivo automático:
// Se o aluno teve perceived_effort = 1 (Limpo / RIR 3+) nas últimas 2
// sessões do mesmo exercício na série 1, sugere +2.5kg na próxima.
//
// Retorna um Map<exerciseKey, { suggestedWeightKg: number; reason: string }>
// para ser consumido pelo WorkoutMode no campo de "Carga sugerida".

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const INCREMENT_KG = 2.5;

interface ProgressionSuggestion {
  suggestedWeightKg: number;
  currentWeightKg:   number;
  reason:            string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useLoadProgression(userId: string | undefined, exerciseKeys: string[]) {
  return useQuery({
    queryKey: ["load-progression", userId, exerciseKeys.sort().join(",")],
    enabled:  !!userId && exerciseKeys.length > 0,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<Map<string, ProgressionSuggestion>> => {
      const result = new Map<string, ProgressionSuggestion>();
      if (!userId || exerciseKeys.length === 0) return result;

      // Para cada exercício, busca as 2 sessões mais recentes da série 1
      const { data, error } = await sb
        .from("workout_sets")
        .select("exercise_key, weight_kg, perceived_effort, executed_at")
        .eq("user_id", userId)
        .in("exercise_key", exerciseKeys)
        .eq("set_number", 1)
        .eq("completed", true)
        .eq("skipped", false)
        .order("executed_at", { ascending: false })
        .limit(exerciseKeys.length * 4); // margem para 2 sessões por exercício

      if (error || !data) return result;

      // Agrupa por exercício, pega as 2 mais recentes
      const grouped: Record<string, { weight: number; effort: number; date: string }[]> = {};
      for (const row of data as { exercise_key: string; weight_kg: number | null; perceived_effort: number | null; executed_at: string }[]) {
        if (!grouped[row.exercise_key]) grouped[row.exercise_key] = [];
        if (grouped[row.exercise_key].length < 2) {
          grouped[row.exercise_key].push({
            weight: row.weight_kg ?? 0,
            effort: row.perceived_effort ?? 0,
            date:   row.executed_at,
          });
        }
      }

      for (const [key, sessions] of Object.entries(grouped)) {
        if (sessions.length < 2) continue;

        const [last, prev] = sessions; // last = mais recente
        const bothClean    = last.effort === 1 && prev.effort === 1;
        const sameWeight   = last.weight > 0 && last.weight === prev.weight;
        const weightGrew   = last.weight > 0 && prev.weight > 0 && last.weight > prev.weight;

        // Sugestão: ambas limpas E peso estagnado (não cresceu entre sessões)
        if (bothClean && sameWeight) {
          result.set(key, {
            suggestedWeightKg: last.weight + INCREMENT_KG,
            currentWeightKg:   last.weight,
            reason: `RIR 3+ nas últimas 2 sessões com ${last.weight}kg — hora de subir!`,
          });
        } else if (bothClean && weightGrew) {
          // Cresceu recentemente mas ainda limpo — mantém o atual e indica que ainda há margem
          result.set(key, {
            suggestedWeightKg: last.weight,
            currentWeightKg:   last.weight,
            reason: `Subiu para ${last.weight}kg e ainda ficou limpo — pode tentar +${INCREMENT_KG}kg se sentir.`,
          });
        }
      }

      return result;
    },
  });
}
