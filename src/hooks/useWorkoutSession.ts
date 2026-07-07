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
  generalFeeling?: 1 | 2 | 3 | 4;
  sleepQuality?: 1 | 2 | 3 | 4;
  notes?: string;
  periodizationWeek?: number;
}

/* ── Helpers puros (fora do hook — sem dependência de estado/closures) ───────── */

// Monta a linha para `workout_sets`. Extraído para ser reaproveitado tanto no
// registro imediato (registerSet) quanto na sincronização de pendências
// (syncPendingSets), evitando que as duas lógicas divirjam com o tempo.
function buildSetRow(sessionId: string, userId: string, params: RegisterSetParams) {
  return {
    session_id:       sessionId,
    user_id:          userId,
    exercise_name:    params.exerciseName,
    exercise_key:     toExerciseKey(params.exerciseName),
    set_number:       params.setNumber,
    weight_kg:        params.weightKg ?? null,
    reps:             params.reps ?? null,
    reps_target_min:  params.repsTargetMin ?? null,
    reps_target_max:  params.repsTargetMax ?? null,
    perceived_effort: params.perceivedEffort ?? null,
    completed:        params.completed ?? true,
    skipped:          params.skipped ?? false,
    notes:            params.notes ?? null,
    executed_at:      new Date().toISOString(),
  };
}

// Lê a fila de séries pendentes (offline) de uma chave de rascunho.
// Usado ao retomar/iniciar sessão para não perder de vista séries que já
// estavam no buffer local de uma sessão anterior (ex.: app fechado antes de
// sincronizar).
function loadPendingSetsFromStorage(key: string): RegisterSetParams[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
      // Recupera séries que ficaram no buffer local (offline) de uma sessão
      // anterior sob a mesma chave — sem isso, elas ficam órfãs no
      // localStorage e nunca são reenviadas ao servidor.
      pendingSetsRef.current = loadPendingSetsFromStorage(localDraftKey.current);
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
    // Mesma recuperação de pendências que resumeSession — cobre o caso de uma
    // sessão local (offline) anterior não ter sido encontrada no Supabase e
    // uma nova estar sendo criada em cima da mesma chave de rascunho.
    pendingSetsRef.current = loadPendingSetsFromStorage(localDraftKey.current);

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

      const setData = buildSetRow(sessionId, userIdRef.current, params);

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
          // Persiste a fila já sem este item — sem isto, o localStorage ficava
          // com séries já sincronizadas, que seriam reenviadas à toa numa
          // futura recuperação de pendências.
          try {
            if (pendingSetsRef.current.length > 0) {
              localStorage.setItem(localDraftKey.current, JSON.stringify(pendingSetsRef.current));
            } else {
              localStorage.removeItem(localDraftKey.current);
            }
          } catch { /* noop */ }
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

  // ── Sincroniza séries pendentes salvas localmente (fila offline) ───────────
  // Reenvia ao servidor qualquer série que ficou no buffer local (rede caiu,
  // app foi fechado antes de sincronizar etc.). É o mecanismo de retry que
  // faltava: sem ele, dados no localStorage só eram sincronizados se o aluno
  // completasse manualmente outra série depois de a conexão voltar.
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const syncPendingSets = useCallback(async () => {
    if (!sessionId || sessionId.startsWith("local_")) return;

    // Se já existe uma sincronização em andamento, espera ela terminar em vez
    // de desistir. Isso importa porque finishSession chama esta função como
    // última tentativa antes de encerrar a sessão — se ela apenas desistisse
    // por já haver uma sync em curso (disparada, por exemplo, pelo evento
    // "online" um instante antes), o encerramento seguiria em frente sem
    // esperar essa sync realmente terminar.
    if (syncInFlightRef.current) {
      await syncInFlightRef.current;
      return;
    }

    if (pendingSetsRef.current.length === 0) return;

    const run = (async () => {
      const toSync = [...pendingSetsRef.current];
      const succeeded: RegisterSetParams[] = [];

      for (const params of toSync) {
        try {
          const { error } = await (supabase as any)
            .from("workout_sets")
            .upsert(buildSetRow(sessionId, userIdRef.current, params), {
              onConflict: "session_id,exercise_key,set_number",
            });
          if (error) {
            console.warn("[syncPendingSets] Ainda sem sucesso ao sincronizar série:", error.message);
          } else {
            succeeded.push(params);
          }
        } catch (err) {
          console.warn("[syncPendingSets] Falha de rede ao sincronizar série:", err);
        }
      }

      if (succeeded.length === 0) return;

      // Remove da fila apenas os itens confirmados, filtrando o estado ATUAL
      // de pendingSetsRef — nunca sobrescrevendo com a lista antiga
      // (`toSync`). O loop acima faz `await` por item: enquanto espera a
      // resposta de um item antigo, um registerSet concorrente pode ter
      // empurrado uma série nova para a fila, e ela não pode ser descartada.
      const succeededSet = new Set(succeeded);
      pendingSetsRef.current = pendingSetsRef.current.filter((p) => !succeededSet.has(p));
      try {
        if (pendingSetsRef.current.length > 0) {
          localStorage.setItem(localDraftKey.current, JSON.stringify(pendingSetsRef.current));
        } else {
          localStorage.removeItem(localDraftKey.current);
        }
      } catch { /* noop */ }
    })();

    syncInFlightRef.current = run;
    try {
      await run;
    } finally {
      syncInFlightRef.current = null;
    }
  }, [sessionId]);

  // Tenta sincronizar pendências assim que a sessão fica disponível e sempre
  // que a conexão for reestabelecida — cobre o caso de reabrir o app com
  // séries que ficaram sem sincronizar de uma sessão anterior.
  useEffect(() => {
    if (!sessionId || sessionId.startsWith("local_")) return;
    void syncPendingSets();

    const handleOnline = () => { void syncPendingSets(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [sessionId, syncPendingSets]);

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

      // Última tentativa de sincronizar séries pendentes antes de encerrar —
      // reduz a chance de a sessão fechar com dados presos só no localStorage.
      await syncPendingSets();

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

      // Limpa buffer local — mas só se não sobrou nada pendente de fato. Se
      // syncPendingSets não conseguiu confirmar tudo (ex.: uma série cujo
      // próprio registerSet ainda estava em voo e falhou bem na janela do
      // encerramento), preserva o rascunho: apagar aqui destruiria a única
      // cópia restante daquele dado. Uma futura sessão para o mesmo treino
      // recarrega esta chave (via loadPendingSetsFromStorage) e tenta de novo.
      try {
        if (pendingSetsRef.current.length === 0) {
          localStorage.removeItem(localDraftKey.current);
        }
      } catch { /* noop */ }

      setIsActive(false);
    },
    [sessionId, syncPendingSets]
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

  // ── Streak real de dias consecutivos com sessão finalizada ─────────────────
  // Substitui o `streak={0}` hardcoded do WorkoutMode — sem isso o gatilho de
  // "perder a sequência" (o de maior retenção comprovada do mercado) era fake.
  const getStreak = useCallback(async (userId: string): Promise<number> => {
    const { data, error } = await (supabase as any)
      .from("workout_sessions")
      .select("ended_at")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(90);

    if (error || !data?.length) return 0;

    const daySet = new Set(
      (data as any[]).map((s) => new Date(s.ended_at).toISOString().slice(0, 10))
    );

    let streak = 0;
    const cursor = new Date();
    // Se ainda não treinou hoje, o streak conta a partir de ontem
    if (!daySet.has(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, []);

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
    getStreak,
  };
}
