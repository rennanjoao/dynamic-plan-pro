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
        }
      }
    },
    [sessionId]
  );

  // ── Deletar série (desfazer) ────────────────────────────────────────────────
  const deleteSet = useCallback(
    async (setNumber: number, exerciseName: string) => {
      if (!sessionId || sessionId.startsWith("local_")) return;
      await (supabase as any)
        .from("workout_sets")
        .delete()
        .eq("session_id", sessionId)
        .eq("exercise_key", toExerciseKey(exerciseName))
        .eq("set_number", setNumber);
    },
    [sessionId]
  );

  // ── Concluir sessão ─────────────────────────────────────────────────────────
  const finishSession = useCallback(
    async (params: FinishSessionParams) => {
      if (!sessionId) return;

      if (timerRef.current) clearInterval(timerRef.current);

      if (!sessionId.startsWith("local_")) {
        await (supabase as any)
          .from("workout_sessions")
          .update({
            ended_at:        new Date().toISOString(),
            general_feeling: params.generalFeeling ?? null,
            sleep_quality:   params.sleepQuality ?? null,
            notes:           params.notes ?? null,
          })
          .eq("id", sessionId);
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

  return {
    sessionId,
    isActive,
    elapsedSeconds,
    startSession,
    resumeSession,
    registerSet,
    deleteSet,
    finishSession,
    getExerciseHistory,
  };
}
