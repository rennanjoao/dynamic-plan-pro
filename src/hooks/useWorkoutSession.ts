// src/hooks/useWorkoutSession.ts
// Hook que gerencia uma sessão de treino: início, registro de séries e conclusão.
// Salva localmente (localStorage) para tolerância a perda de conexão.

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toExerciseKey } from "@/lib/workoutTypes";
import type { ExerciseHistory } from "@/lib/workoutTypes";

/* ── Parâmetros ──────────────────────────────────────────────────────────────── */

interface StartSessionParams {
  userId: string;
  coachId?: string;
  planId?: string;
  workoutKey: string;
  workoutLabel?: string;
  periodizationWeek?: number;
  blockNumber?: number;
  isDeloadWeek?: boolean;
}

interface RegisterSetParams {
  exerciseName: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  repsTargetMin?: number;
  repsTargetMax?: number;
  perceivedEffort?: 1 | 2 | 3;
  completed?: boolean;
  skipped?: boolean;
  notes?: string;
}

interface FinishSessionParams {
  generalFeeling?: 1 | 2 | 3;
  sleepQuality?: 1 | 2 | 3;
  notes?: string;
  periodizationWeek?: number;
}

/* ── Hook ────────────────────────────────────────────────────────────────────── */

export function useWorkoutSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef = useRef<string>("");
  const pendingSetsRef = useRef<RegisterSetParams[]>([]);
  const localDraftKey = useRef<string>("");

  // Timer de duração
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Retomar sessão existente (sem inserir nova linha no banco) ─────────────
  const resumeSession = useCallback(
    (params: { sessionId: string; userId: string; workoutKey: string; startedAt: number }) => {
      userIdRef.current = params.userId;
      localDraftKey.current = `workout_session_draft_${params.userId}_${params.workoutKey}`;
      setSessionId(params.sessionId);
      setIsActive(true);
      startTimeRef.current = new Date(params.startedAt);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(
            Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
          );
        }
      }, 1000);
    },
    []
  );

  // ── Buscar sessão ativa no Supabase (fallback quando o localStorage falha) ──
  // Usado quando o localStorage foi limpo/corrompido: em vez de simplesmente
  // abrir uma sessão nova (e perder o progresso do aluno), verificamos se já
  // existe uma sessão sem ended_at para esse usuário+treino no banco.
  const findActiveSession = useCallback(
    async (userId: string, workoutKey: string): Promise<{ sessionId: string; startedAt: number } | null> => {
      const { data, error } = await (supabase as any)
        .from("workout_sessions")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("workout_key", workoutKey)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("[useWorkoutSession] Erro ao buscar sessão ativa:", error.message);
        return null;
      }
      if (!data) return null;

      return { sessionId: data.id, startedAt: new Date(data.started_at).getTime() };
    },
    []
  );

  // ── Iniciar sessão ──────────────────────────────────────────────────────────
  const startSession = useCallback(async (params: StartSessionParams) => {
    userIdRef.current = params.userId;
    localDraftKey.current = `workout_session_draft_${params.userId}_${params.workoutKey}`;

    const { data, error } = await (supabase as any)
      .from("workout_sessions")
      .insert({
        user_id:            params.userId,
        coach_id:           params.coachId ?? null,
        plan_id:            params.planId ?? null,
        workout_key:        params.workoutKey,
        workout_label:      params.workoutLabel ?? null,
        periodization_week: params.periodizationWeek ?? null,
        block_number:       params.blockNumber ?? 1,
        is_deload_week:     params.isDeloadWeek ?? false,
        started_at:         new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[useWorkoutSession] Erro ao iniciar sessão:", error);
      // Gera ID local para operar offline
      const localId = `local_${Date.now()}`;
      setSessionId(localId);
    } else {
      setSessionId(data.id);
    }

    setIsActive(true);
    startTimeRef.current = new Date();

    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
        );
      }
    }, 1000);
  }, []);

  // ── Registrar série ─────────────────────────────────────────────────────────
  const registerSet = useCallback(
    async (params: RegisterSetParams) => {
      if (!sessionId) return;

      const setData = {
        session_id:      sessionId,
        user_id:         userIdRef.current,
        exercise_name:   params.exerciseName,
        exercise_key:    toExerciseKey(params.exerciseName),
        set_number:      params.setNumber,
        weight_kg:       params.weightKg ?? null,
        reps:            params.reps ?? null,
        reps_target_min: params.repsTargetMin ?? null,
        reps_target_max: params.repsTargetMax ?? null,
        perceived_effort: params.perceivedEffort ?? null,
        completed:       params.completed ?? true,
        skipped:         params.skipped ?? false,
        notes:           params.notes ?? null,
        executed_at:     new Date().toISOString(),
      };

      // Salva no buffer local primeiro (offline safety)
      pendingSetsRef.current.push(params);
      try {
        localStorage.setItem(
          localDraftKey.current,
          JSON.stringify(pendingSetsRef.current)
        );
      } catch {
        // noop — localStorage cheio ou bloqueado
      }

      // Persiste no banco (se falhar, fica no localStorage para sync manual)
      if (!sessionId.startsWith("local_")) {
        const { error } = await (supabase as any)
          .from("workout_sets")
          .upsert(setData, { onConflict: "session_id,exercise_key,set_number" });

        if (!error) {
          // Remove do buffer local após confirmar salvamento
          pendingSetsRef.current = pendingSetsRef.current.filter(
            (p) => p !== params
          );
        } else {
          console.error("[registerSet] Falha ao salvar série no Supabase:", error.message);
          // Os dados já estão no buffer local (pendingSetsRef/localStorage) então
          // nada é perdido — mas o chamador precisa saber para avisar o aluno.
          throw new Error("Falha ao salvar série no servidor. Seus dados foram mantidos localmente.");
        }
      }
    },
    [sessionId]
  );

  // ── Buscar séries já salvas de uma sessão (para reconstruir o progresso local) ──
  // Necessário quando a sessão é recuperada via findActiveSession (fallback do
  // Supabase): nesse caso não há dados no localStorage, então o componente
  // precisa desta lista para repopular setDataMap/completed e não mostrar o
  // treino como "zerado" enquanto a sessão já tem séries registradas.
  const getSessionSets = useCallback(
    async (
      sessionIdToFetch: string
    ): Promise<
      { exercise_key: string; set_number: number; weight_kg: number | null; reps: number | null; completed: boolean; skipped: boolean }[]
    > => {
      if (!sessionIdToFetch || sessionIdToFetch.startsWith("local_")) return [];

      const { data, error } = await (supabase as any)
        .from("workout_sets")
        .select("exercise_key, set_number, weight_kg, reps, completed, skipped")
        .eq("session_id", sessionIdToFetch);

      if (error) {
        console.warn("[getSessionSets] Erro ao buscar séries da sessão:", error.message);
        return [];
      }
      return data ?? [];
    },
    []
  );

  // ── Deletar série (desfazer) ────────────────────────────────────────────────
  const deleteSet = useCallback(
    async (setNumber: number, exerciseName: string) => {
      if (!sessionId || sessionId.startsWith("local_")) return;
      const { error } = await (supabase as any)
        .from("workout_sets")
        .delete()
        .eq("session_id", sessionId)
        .eq("exercise_key", toExerciseKey(exerciseName))
        .eq("set_number", setNumber);
      if (error) {
        console.warn(
          "[deleteSet] Falha ao remover série — será sobrescrita no próximo registro:",
          error.message
        );
      }
    },
    [sessionId]
  );

  // ── Concluir sessão ─────────────────────────────────────────────────────────
  const finishSession = useCallback(
    async (params: FinishSessionParams) => {
      if (!sessionId) return;

      if (timerRef.current) clearInterval(timerRef.current);

      if (!sessionId.startsWith("local_")) {
        const { error } = await (supabase as any)
          .from("workout_sessions")
          .update({
            ended_at:        new Date().toISOString(),
            general_feeling: params.generalFeeling ?? null,
            sleep_quality:   params.sleepQuality ?? null,
            notes:           params.notes ?? null,
          })
          .eq("id", sessionId);
        if (error) {
          console.warn("[finishSession] Erro ao finalizar no banco:", error.message);
          try {
            localStorage.setItem(
              `workout_finish_pending_${sessionId}`,
              JSON.stringify({
                ended_at: new Date().toISOString(),
                generalFeeling: params.generalFeeling ?? null,
                sleepQuality: params.sleepQuality ?? null,
                notes: params.notes ?? null,
              })
            );
          } catch { /* noop */ }
        }
      }

      // Compatibilidade: salva também em workout_progress (tabela legada)
      if (userIdRef.current) {
        const dayKey = sessionId.startsWith("local_") ? "X" : sessionId;
        const today  = new Date().toISOString().slice(0, 10);
        try {
          await (supabase as any)
            .from("workout_progress")
            .upsert(
              {
                user_id:      userIdRef.current,
                workout_id:   `${dayKey}_${today}`,
                completed:    true,
                completed_at: new Date().toISOString(),
                updated_at:   new Date().toISOString(),
                session_id:   sessionId.startsWith("local_") ? null : sessionId,
              },
              { onConflict: "user_id,workout_id" }
            );
        } catch {
          // noop — não bloqueia conclusão se workout_progress falhar
        }
      }

      // Limpa buffer local
      try { localStorage.removeItem(localDraftKey.current); } catch { /* noop */ }

      setIsActive(false);
    },
    [sessionId]
  );

  // ── Buscar histórico de um exercício ────────────────────────────────────────
  const getExerciseHistory = useCallback(
    async (exerciseName: string, limit = 5): Promise<ExerciseHistory[]> => {
      if (!userIdRef.current) return [];

      const key = toExerciseKey(exerciseName);

      const { data, error } = await (supabase as any)
        .from("workout_sets")
        .select("weight_kg, reps, perceived_effort, executed_at, workout_key")
        .eq("user_id", userIdRef.current)
        .eq("exercise_key", key)
        .eq("set_number", 1)
        .eq("completed", true)
        .order("executed_at", { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return (data as any[]).map((s) => ({
        weightKg:        s.weight_kg ?? 0,
        reps:            s.reps ?? 0,
        perceivedEffort: s.perceived_effort,
        executedAt:      s.executed_at,
      }));
    },
    []
  );

  // ── Buscar histórico de vários exercícios em uma única query ─────────────
  const getExerciseHistoryBatch = useCallback(
    async (
      exerciseNames: string[],
      limitPerExercise = 3
    ): Promise<Record<string, ExerciseHistory[]>> => {
      const result: Record<string, ExerciseHistory[]> = {};
      if (!userIdRef.current || exerciseNames.length === 0) return result;

      const keyToName = new Map(exerciseNames.map((n) => [toExerciseKey(n), n]));
      const keys = Array.from(keyToName.keys());

      const { data, error } = await (supabase as any)
        .from("workout_sets")
        .select("exercise_key, weight_kg, reps, perceived_effort, executed_at")
        .eq("user_id", userIdRef.current)
        .in("exercise_key", keys)
        .eq("set_number", 1)
        .eq("completed", true)
        .order("executed_at", { ascending: false });

      if (error || !data) return result;

      (data as any[]).forEach((s) => {
        const name = keyToName.get(s.exercise_key);
        if (!name) return;
        if (!result[name]) result[name] = [];
        if (result[name].length < limitPerExercise) {
          result[name].push({
            weightKg: s.weight_kg ?? 0,
            reps: s.reps ?? 0,
            perceivedEffort: s.perceived_effort,
            executedAt: s.executed_at,
          });
        }
      });
      return result;
    },
    []
  );

  return {
    sessionId,
    isActive,
    elapsedSeconds,
    startSession,
    resumeSession,
    findActiveSession,
    getSessionSets,
    registerSet,
    deleteSet,
    finishSession,
    getExerciseHistory,
    getExerciseHistoryBatch,
  };
}
