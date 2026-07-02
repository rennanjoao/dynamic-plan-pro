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

      // Busca o histórico de TODOS os exercícios em uma única query (evita N+1).
      // Não aplicamos um .limit() global — isso enviesaria o resultado a favor
      // dos exercícios mais frequentes e deixaria exercícios raros sem dados
      // (esse era exatamente o motivo pelo qual essa query tinha sido dividida
      // em N chamadas paralelas antes). Em vez disso, trazemos o histórico
      // recente de todos e agrupamos client-side, pegando as 2 sessões mais
      // recentes por exercício. O filtro de data (últimos 120 dias) mantém
      // o payload pequeno mesmo para contas com histórico muito longo.
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 120);

      const { data, error } = await sb
        .from("workout_sets")
        .select("exercise_key, weight_kg, perceived_effort, executed_at")
        .eq("user_id", userId)
        .in("exercise_key", exerciseKeys)
        .eq("set_number", 1)
        .eq("completed", true)
        .eq("skipped", false)
        .gte("executed_at", cutoff.toISOString())
        .order("executed_at", { ascending: false });

      if (error) {
        console.error("[useLoadProgression] Erro ao carregar progressão:", error.message);
        return result;
      }

      const grouped: Record<string, { weight: number; effort: number; date: string }[]> = {};
      ((data ?? []) as { exercise_key: string; weight_kg: number | null; perceived_effort: number | null; executed_at: string }[]).forEach((r) => {
        const key = r.exercise_key;
        if (!grouped[key]) grouped[key] = [];
        // Já veio ordenado por executed_at desc; guardamos só os 2 mais recentes por exercício.
        if (grouped[key].length < 2) {
          grouped[key].push({
            weight: r.weight_kg ?? 0,
            effort: r.perceived_effort ?? 0,
            date:   r.executed_at,
          });
        }
      });

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
