import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Dumbbell } from "lucide-react";

export default function WorkoutHistory({ userId }: { userId: string }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["workout_history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("workout_progress")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>;
  }

  if (!logs?.length) {
    return (
      <div className="text-center py-10 space-y-3">
        <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Nenhum treino registrado ainda.</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Complete um treino no Modo Treino para ver seu histórico aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log: any) => (
        <div
          key={`${log.user_id}_${log.workout_id}`}
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-3"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {log.completed ? (
              <Trophy className="w-4 h-4 text-primary" />
            ) : (
              <Dumbbell className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              Treino {log.workout_id?.split("_")[0] ?? "—"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {log.completed_at
                ? new Date(log.completed_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
          {log.completed && (
            <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 px-2 py-1 rounded">
              Concluído
            </span>
          )}
        </div>
      ))}
    </div>
  );
}