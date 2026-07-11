import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Deriva a semana ATUAL de periodização a partir de workout_sessions —
 * não do clique manual do aluno. Regra: olha as sessões finalizadas mais
 * recentes QUE JÁ TÊM periodization_week preenchido (ignora sessões antigas
 * de antes da periodização existir — senão elas contaminam o cálculo como
 * se fossem "Semana 1" por coerção). Enquanto pertencerem à mesma semana,
 * acumula os workout_key distintos concluídos. Se todos os treinos do split
 * já foram feitos ao menos uma vez nessa semana, a próxima já é a recomendada
 * (trava no índice final — sem loop automático pra Semana 1; o coach reseta
 * manualmente se quiser reiniciar o bloco).
 */
export function useCurrentPeriodizationWeek(
  userId: string,
  enabled: boolean,
  totalWeeks: number,
  workoutKeys: string[]
) {
  return useQuery({
    queryKey: ["current-periodization-week", userId, workoutKeys.join(",")],
    enabled: enabled && !!userId && workoutKeys.length > 0,
    queryFn: async (): Promise<number> => {
      const { data, error } = await (supabase as any)
        .from("workout_sessions")
        .select("workout_key, periodization_week, ended_at")
        .eq("user_id", userId)
        .not("ended_at", "is", null)
        .not("periodization_week", "is", null)
        .order("ended_at", { ascending: false })
        .limit(50);

      if (error || !data || data.length === 0) return 0;

      const latestWeek: number = data[0].periodization_week ?? 0;
      const doneInWeek = new Set<string>();
      for (const s of data as any[]) {
        if (s.periodization_week !== latestWeek) break;
        doneInWeek.add(s.workout_key);
      }

      const splitComplete = workoutKeys.every((k) => doneInWeek.has(k));
      if (splitComplete && latestWeek < totalWeeks - 1) return latestWeek + 1;
      return latestWeek;
    },
  });
}