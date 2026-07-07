// src/components/student/WorkoutHistory.tsx
// Histórico de treinos com dados reais do logbook (Sprint 2)

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Dumbbell, Clock, TrendingUp, Zap, Moon, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { effortLabel } from "@/lib/workoutTypes";

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h${rem}min` : `${h}h`;
}

// Escalas alinhadas ao modal pós-treino (1..4).
// Fallback para o legado 3-níveis: reaproveita a cor "boa" quando o valor for 3.
const FEELING_META: Record<number, { label: string; emoji: string; cls: string }> = {
  1: { label: "Cansado",  emoji: "🥱", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  2: { label: "Normal",   emoji: "😐", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  3: { label: "Disposto", emoji: "🔥", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  4: { label: "Exaurido", emoji: "💀", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
};
const SLEEP_META: Record<number, { label: string; emoji: string; cls: string }> = {
  1: { label: "Ruim",      emoji: "🔴", cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  2: { label: "Regular",   emoji: "🟡", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  3: { label: "Boa",       emoji: "🟢", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  4: { label: "Excelente", emoji: "✨", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
};

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

interface SessionRow {
  id: string;
  workout_key: string;
  workout_label?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  general_feeling?: number;
  sleep_quality?: number;
  is_deload_week: boolean;
  sets?: SetRow[];
}

interface SetRow {
  exercise_name: string;
  set_number: number;
  weight_kg?: number;
  reps?: number;
  perceived_effort?: number;
}

/* ── Componente ─────────────────────────────────────────────────────────────── */

export default function WorkoutHistory({ userId }: { userId: string }) {
  // Busca sessões com sets aninhados
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["workout_history_v2", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 3,
    queryFn: async (): Promise<SessionRow[]> => {
      // Tenta buscar da nova tabela workout_sessions
      const { data: newData, error } = await (supabase as any)
        .from("workout_sessions")
        .select(`
          id,
          workout_key,
          workout_label,
          started_at,
          ended_at,
          general_feeling,
          sleep_quality,
          is_deload_week,
          workout_sets (
            exercise_name,
            set_number,
            weight_kg,
            reps,
            perceived_effort
          )
        `)
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(30);

      if (!error && newData) {
        const withSets = (newData as any[]).filter(
          (s) => (s.workout_sets?.length ?? 0) > 0
        );
        if (withSets.length > 0) {
          return withSets.map((s: any) => ({
            ...s,
            duration_seconds: s.ended_at && s.started_at
              ? Math.floor(
                  (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
                )
              : undefined,
            sets: s.workout_sets ?? [],
          }));
        }
      }

      // Fallback: tabela legada workout_progress
      const { data: legacy } = await (supabase as any)
        .from("workout_progress")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(30);

      if (!legacy) return [];
      return (legacy as any[]).map((log) => ({
        id:          `${log.user_id}_${log.workout_id}`,
        workout_key: log.workout_id?.split("_")[0] ?? "—",
        started_at:  log.completed_at ?? log.created_at,
        is_deload_week: false,
        sets: [],
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!sessions?.length) {
    return (
      <div className="text-center py-10 space-y-3">
        <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Nenhum treino registrado ainda.</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Complete um treino no Modo Treino para ver seu histórico aqui.
          A partir do primeiro treino, você terá acesso a dados de carga e evolução.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const hasSets    = session.sets && session.sets.length > 0;
        const totalSets  = session.sets?.length ?? 0;
        // Exercícios únicos nesta sessão
        const exercises  = Array.from(
          new Set(session.sets?.map((s) => s.exercise_name) ?? [])
        );
        // Melhor carga da sessão
        const bestSet    = session.sets
          ?.filter((s) => (s.weight_kg ?? 0) > 0)
          .sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0))[0];

        return (
          <div
            key={session.id}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 p-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {session.is_deload_week ? (
                  <Zap className="w-4 h-4 text-amber-500" />
                ) : (
                  <Trophy className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground truncate">
                    Treino {session.workout_key}
                    {session.workout_label ? ` · ${session.workout_label}` : ""}
                  </p>
                  {session.is_deload_week && (
                    <span className="text-[10px] font-bold uppercase text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      deload
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {fmtDate(session.started_at)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {session.sleep_quality != null && SLEEP_META[session.sleep_quality] && (
                  <Badge
                    variant="outline"
                    className={`gap-1 text-[10px] font-bold px-2 py-0.5 ${SLEEP_META[session.sleep_quality].cls}`}
                    title={`Sono: ${SLEEP_META[session.sleep_quality].label}`}
                  >
                    <Moon className="w-3 h-3" /> {SLEEP_META[session.sleep_quality].label}
                  </Badge>
                )}
                {session.general_feeling != null && FEELING_META[session.general_feeling] && (
                  <Badge
                    variant="outline"
                    className={`gap-1 text-[10px] font-bold px-2 py-0.5 ${FEELING_META[session.general_feeling].cls}`}
                    title={`Sensação: ${FEELING_META[session.general_feeling].label}`}
                  >
                    <Activity className="w-3 h-3" /> {FEELING_META[session.general_feeling].label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Métricas */}
            {(hasSets || session.duration_seconds) && (
              <div
                className="px-3 pb-3 grid gap-2"
                style={{ gridTemplateColumns: hasSets ? "repeat(3, 1fr)" : "repeat(2, 1fr)" }}
              >
                {session.duration_seconds && (
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <Clock className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-foreground">
                      {fmtDuration(session.duration_seconds)}
                    </p>
                  </div>
                )}
                {hasSets && (
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <Dumbbell className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-foreground">{totalSets} séries</p>
                  </div>
                )}
                {bestSet && (
                  <div className="bg-muted/30 rounded-lg p-2 text-center">
                    <TrendingUp className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-foreground">
                      {bestSet.weight_kg}kg
                    </p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {bestSet.exercise_name.split(" ").slice(0, 2).join(" ")}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Lista de exercícios (expandida quando tem sets) */}
            {hasSets && exercises.length > 0 && (
              <div className="border-t border-border/40 px-3 py-2 space-y-1">
                {exercises.slice(0, 4).map((exName) => {
                  const exSets = session.sets?.filter((s) => s.exercise_name === exName) ?? [];
                  const maxWeight = Math.max(...exSets.map((s) => s.weight_kg ?? 0));
                  const lastEffort = exSets.at(-1)?.perceived_effort;
                  return (
                    <div key={exName} className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground truncate flex-1">
                        {exName}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {maxWeight > 0 && (
                          <span className="text-[11px] font-bold text-foreground">
                            {maxWeight}kg
                          </span>
                        )}
                        {lastEffort && (
                          <span className="text-[10px] text-muted-foreground">
                            {effortLabel(lastEffort as 1 | 2 | 3)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {exercises.length > 4 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{exercises.length - 4} exercícios
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
