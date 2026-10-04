// src/hooks/useWorkoutSession.ts
// Hook que gerencia uma sessão de treino: início, registro de séries e conclusão.
//
// GRAVAÇÃO — como as séries chegam ao banco
// -----------------------------------------
// Toda escrita em `workout_sets` passa por UMA fila ordenada (pendingSetsRef,
// espelhada no localStorage). A fila é processada em ordem, e cada item vai
// para a SESSÃO EM QUE FOI REGISTRADO (`sid`), nunca para "a sessão de agora":
//   - registrar série  = item `upsert` (idempotente: onConflict session+exercício+nº);
//   - remover série    = reescrever as séries que mudam de número (upsert) + item
//                        `truncate` (apaga tudo acima de N séries) — idempotente e
//                        reaplicável, então sobrevive a queda de rede;
//   - toque antes da sessão existir fica na fila e sobe quando ela existir;
//   - treino iniciado sem rede vira uma sessão real depois (materializeLocalSession),
//     com o started_at original, e as séries sobem com o executed_at original.

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toExerciseKey } from "@/lib/workoutTypes";
import type { ExerciseHistory, ExerciseSessionLoad } from "@/lib/workoutTypes";
import { workoutDraftStorageKey } from "@/lib/periodizationKey";
import { groupSetRowsIntoSessions, type SetRowLike } from "@/lib/loadProgression";

/* ── Parâmetros ──────────────────────────────────────────────────────────────── */

// Janela em que uma sessão aberta ainda é considerada "o treino de agora" e
// pode ser retomada automaticamente, sem perguntar nada ao aluno. Fora dela a
// sessão é tratada como abandonada (app fechado, conexão perdida) e o aluno
// precisa escolher entre continuar ou começar do zero.
// Ajuste aqui para mudar o comportamento em todo o app.
export const SESSION_RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 horas

export function isSessionStale(startedAt: number | null | undefined): boolean {
  if (!startedAt) return true;
  return Date.now() - startedAt > SESSION_RESUME_MAX_AGE_MS;
}

interface StartSessionParams {
  userId: string;
  coachId?: string;
  planId?: string;
  workoutKey: string;
  workoutLabel?: string;
  periodizationWeek?: number;
  /** Tipo estável da periodização (peso/tecnica/resistencia/deload). `null` = sem periodização. */
  periodizationKey?: string | null;
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
  /** Nome do exercício prescrito originalmente, quando o aluno trocou por outro. */
  swappedFromName?: string | null;
  /** Periodização da sessão — grava junto da série para separar o histórico. */
  periodizationKey?: string | null;
  periodizationWeek?: number | null;
  /** Momento real em que a série foi feita (ISO). Se omitido, vale "agora". */
  executedAt?: string | null;
}

interface FinishSessionParams {
  generalFeeling?: 1 | 2 | 3 | 4;
  sleepQuality?: 1 | 2 | 3 | 4;
  notes?: string;
  periodizationWeek?: number;
}

/** Plano de remoção de série (ver `planSetRemoval` em lib/workoutSets). */
export interface RemoveSetPlan {
  /** Primeiro nº de série (1-based) cujo conteúdo muda no servidor. */
  fromSetNumber: number;
  /** Séries que mudam de número, já com o número NOVO. */
  shifted: RegisterSetParams[];
  /** Quantas séries devem sobrar no servidor para este exercício. */
  keepCount: number;
}

/**
 * Item da fila de gravação. Sem `op` = upsert (formato antigo, compatível com
 * rascunhos já guardados no aparelho). `truncate` usa `setNumber` como "quantas
 * séries manter" e apaga as de número maior.
 */
type QueueItem = RegisterSetParams & {
  op?: "upsert" | "truncate";
  /** Sessão em que o item foi registrado. Ausente = sessão atual (formato antigo). */
  sid?: string | null;
};

/* ── Sessão criada sem rede (id "local_...") ─────────────────────────────────── */

const LOCAL_SESSION_PREFIX = "workout_local_session_";
const FINISH_PENDING_PREFIX = "workout_finish_pending_";
const LOCAL_SESSION_KEEP_MS = 2 * 24 * 60 * 60 * 1000; // 2 dias

interface LocalSessionRecord {
  localId: string;
  userId: string;
  startedAt: string;
  params: Omit<StartSessionParams, "userId">;
  finish?: { endedAt: string; generalFeeling: number | null; sleepQuality: number | null; notes: string | null };
  /** Preenchido quando a sessão foi criada de verdade no servidor. */
  realId?: string;
}

function readLocalSession(localId: string): LocalSessionRecord | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_SESSION_PREFIX}${localId}`);
    return raw ? (JSON.parse(raw) as LocalSessionRecord) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(rec: LocalSessionRecord) {
  try {
    localStorage.setItem(`${LOCAL_SESSION_PREFIX}${rec.localId}`, JSON.stringify(rec));
  } catch { /* noop — localStorage cheio ou bloqueado */ }
}

// Descarta registros de sessões locais que já viraram sessões reais e são antigos
// (ou já foram encerradas): ficam só alguns bytes, mas não precisam acumular.
function pruneLocalSessions() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCAL_SESSION_PREFIX)) continue;
      const rec = readLocalSession(key.slice(LOCAL_SESSION_PREFIX.length));
      if (!rec || !rec.realId) continue;
      const old = Date.now() - new Date(rec.startedAt).getTime() > LOCAL_SESSION_KEEP_MS;
      if (old || rec.finish) stale.push(key);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

// Evita inserir a mesma sessão duas vezes quando duas chamadas concorrem
// (evento "online" + abertura do treino, por exemplo).
const materializing = new Map<string, Promise<string | null>>();

/* ── Helpers puros (fora do hook — sem dependência de estado/closures) ───────── */

// Monta a linha para `workout_sets`. Reaproveitado pelo registro e pela
// sincronização da fila, para as duas lógicas não divergirem.
// `executed_at` é o momento REAL da série (gravado quando ela foi feita), não o
// momento em que a fila conseguiu enviá-la.
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
    swapped_from_name: params.swappedFromName ?? null,
    periodization_key: params.periodizationKey ?? null,
    periodization_week: params.periodizationWeek ?? null,
    executed_at:      params.executedAt ?? new Date().toISOString(),
  };
}

// Lê a fila de pendências (offline) de uma chave de rascunho.
function loadPendingSetsFromStorage(key: string): QueueItem[] {
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

const queueSignature = (p: QueueItem) =>
  `${p.op ?? "upsert"}|${p.sid ?? ""}|${toExerciseKey(p.exerciseName)}|${p.setNumber}|${p.executedAt ?? ""}`;

// Junta o que estava guardado com o que já estava só em memória (toques feitos
// antes de a sessão começar/retomar), sem duplicar.
function mergeQueues(stored: QueueItem[], inMemory: QueueItem[]): QueueItem[] {
  const seen = new Set(stored.map(queueSignature));
  const out = [...stored];
  for (const item of inMemory) {
    if (!seen.has(queueSignature(item))) out.push(item);
  }
  return out;
}

// Encerramentos que falharam (sem rede) ficam guardados e são reenviados aqui.
async function flushPendingFinishes(): Promise<void> {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(FINISH_PENDING_PREFIX)) keys.push(k);
    }
  } catch {
    return;
  }
  for (const k of keys) {
    const sid = k.slice(FINISH_PENDING_PREFIX.length);
    if (!sid || sid.startsWith("local_")) continue;
    try {
      const payload = JSON.parse(localStorage.getItem(k) ?? "null");
      if (!payload?.ended_at) { localStorage.removeItem(k); continue; }
      const { error } = await supabase
        .from("workout_sessions")
        .update({
          ended_at:        payload.ended_at,
          general_feeling: payload.generalFeeling ?? null,
          sleep_quality:   payload.sleepQuality ?? null,
          notes:           payload.notes ?? null,
        })
        .eq("id", sid)
        .is("ended_at", null);
      if (!error) localStorage.removeItem(k);
    } catch { /* tenta de novo na próxima sincronização */ }
  }
}

/* ── Hook ────────────────────────────────────────────────────────────────────── */

export function useWorkoutSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userIdRef = useRef<string>("");
  const pendingSetsRef = useRef<QueueItem[]>([]);
  const localDraftKey = useRef<string>("");
  // Corrente de sincronizações: cada passada espera a anterior terminar.
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  // O estado alimenta a tela; o ref é o que as rotinas assíncronas leem (sempre atual).
  const applySessionId = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  // Timer de duração
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const persistQueue = useCallback(() => {
    const key = localDraftKey.current;
    if (!key) return;
    try {
      if (pendingSetsRef.current.length > 0) {
        localStorage.setItem(key, JSON.stringify(pendingSetsRef.current));
      } else {
        localStorage.removeItem(key);
      }
    } catch { /* noop — localStorage cheio ou bloqueado */ }
  }, []);

  // ── Sessão criada offline → sessão real ─────────────────────────────────────
  const materializeLocalSession = useCallback(async (localId: string): Promise<string | null> => {
    if (!localId || !localId.startsWith("local_")) return null;
    const known = readLocalSession(localId);
    if (!known) return null;
    if (known.realId) return known.realId;

    const inFlight = materializing.get(localId);
    if (inFlight) return inFlight;

    const run = (async (): Promise<string | null> => {
      const rec = readLocalSession(localId);
      if (!rec) return null;
      if (rec.realId) return rec.realId;
      const p = rec.params;
      const { data, error } = await (supabase as any)
        .from("workout_sessions")
        .insert({
          user_id:            rec.userId,
          coach_id:           p.coachId ?? null,
          plan_id:            p.planId ?? null,
          workout_key:        p.workoutKey,
          workout_label:      p.workoutLabel ?? null,
          periodization_week: p.periodizationWeek ?? null,
          periodization_key:  p.periodizationKey ?? null,
          block_number:       p.blockNumber ?? 1,
          is_deload_week:     p.isDeloadWeek ?? false,
          started_at:         rec.startedAt,
          ended_at:           rec.finish?.endedAt ?? null,
          general_feeling:    rec.finish?.generalFeeling ?? null,
          sleep_quality:      rec.finish?.sleepQuality ?? null,
          notes:              rec.finish?.notes ?? null,
        })
        .select("id")
        .single();
      if (error || !data) return null;
      writeLocalSession({ ...rec, realId: data.id });
      // Se é a sessão que está na tela, passa a operar na sessão real.
      if (sessionIdRef.current === localId) applySessionId(data.id);
      return data.id as string;
    })().finally(() => { materializing.delete(localId); });

    materializing.set(localId, run);
    return run;
  }, [applySessionId]);

  const hasLocalSession = useCallback((localId: string): boolean => !!readLocalSession(localId), []);

  // Para onde um item da fila deve ir (null = ainda não dá).
  const resolveTargetSession = useCallback(async (item: QueueItem): Promise<string | null> => {
    const sid = item.sid ?? sessionIdRef.current;
    if (!sid) return null;
    if (!sid.startsWith("local_")) return sid;
    return materializeLocalSession(sid);
  }, [materializeLocalSession]);

  const applyQueueItem = useCallback(async (targetSessionId: string, item: QueueItem): Promise<boolean> => {
    if (item.op === "truncate") {
      const { error } = await supabase
        .from("workout_sets")
        .delete()
        .eq("session_id", targetSessionId)
        .eq("exercise_key", toExerciseKey(item.exerciseName))
        .gt("set_number", item.setNumber);
      if (error) console.warn("[syncPendingSets] Falha ao apagar séries excedentes:", error.message);
      return !error;
    }
    const { error } = await (supabase as any)
      .from("workout_sets")
      .upsert(buildSetRow(targetSessionId, userIdRef.current, item), {
        onConflict: "session_id,exercise_key,set_number",
      });
    if (error) console.warn("[syncPendingSets] Ainda sem sucesso ao sincronizar série:", error.message);
    return !error;
  }, []);

  // Uma passada pela fila, em ordem. Se um item falha, os seguintes DO MESMO
  // exercício/sessão esperam (a ordem importa: um `truncate` atrasado não pode
  // apagar uma série nova que passou na frente). Outros exercícios seguem.
  const runSync = useCallback(async () => {
    await flushPendingFinishes();
    if (!sessionIdRef.current) return;

    const toSync = [...pendingSetsRef.current];
    if (toSync.length === 0) return;

    const synced = new Set<QueueItem>();
    const blocked = new Set<string>();

    for (const item of toSync) {
      const lane = `${item.sid ?? "current"}::${toExerciseKey(item.exerciseName)}`;
      if (blocked.has(lane)) continue;
      let ok = false;
      try {
        const target = await resolveTargetSession(item);
        ok = !!target && (await applyQueueItem(target, item));
      } catch (err) {
        console.warn("[syncPendingSets] Falha de rede ao sincronizar série:", err);
      }
      if (ok) synced.add(item);
      else blocked.add(lane);
    }

    if (synced.size === 0) return;

    // Remove da fila apenas os itens confirmados, filtrando o estado ATUAL: o
    // loop faz `await` por item e um registro concorrente pode ter entrado na fila.
    pendingSetsRef.current = pendingSetsRef.current.filter((p) => !synced.has(p));
    persistQueue();
  }, [applyQueueItem, persistQueue, resolveTargetSession]);

  // Passadas encadeadas: quem chama só volta depois de uma passada iniciada
  // APÓS o seu item entrar na fila (finishSession depende disso).
  const syncPendingSets = useCallback((): Promise<void> => {
    const next = syncChainRef.current.catch(() => undefined).then(runSync);
    syncChainRef.current = next;
    return next;
  }, [runSync]);

  // ── Retomar sessão existente (sem inserir nova linha no banco) ─────────────
  const resumeSession = useCallback(
    (params: { sessionId: string; userId: string; workoutKey: string; startedAt: number; periodizationKey?: string | null }) => {
      userIdRef.current = params.userId;
      localDraftKey.current = workoutDraftStorageKey(params.userId, params.workoutKey, params.periodizationKey ?? null);
      // Recupera séries que ficaram no buffer local (offline) de uma sessão
      // anterior e preserva as que já estavam só em memória.
      pendingSetsRef.current = mergeQueues(loadPendingSetsFromStorage(localDraftKey.current), pendingSetsRef.current);
      persistQueue();
      pruneLocalSessions();
      applySessionId(params.sessionId);
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
    [applySessionId, persistQueue]
  );

  // ── Buscar sessão ativa no Supabase (fallback quando o localStorage falha) ──
  // Usado quando o localStorage foi limpo/corrompido: em vez de simplesmente
  // abrir uma sessão nova (e perder o progresso do aluno), verificamos se já
  // existe uma sessão sem ended_at para esse usuário+treino no banco.
  const findActiveSession = useCallback(
    async (
      userId: string,
      workoutKey: string
    ): Promise<{ sessionId: string; startedAt: number; isStale: boolean; periodizationKey: string | null } | null> => {
      const { data, error } = await (supabase as any)
        .from("workout_sessions")
        .select("id, started_at, periodization_key")
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

      const startedAt = new Date(data.started_at).getTime();
      return {
        sessionId: data.id,
        startedAt,
        isStale: isSessionStale(startedAt),
        periodizationKey: data.periodization_key ?? null,
      };
    },
    []
  );

  // ── Encerrar sessão abandonada ──────────────────────────────────────────────
  // Quando o aluno decide começar um treino novo, a sessão antiga precisa ser
  // fechada: se ficar com ended_at nulo ela continua sendo devolvida por
  // findActiveSession e reaparece como "sessão zumbi" em qualquer consulta que
  // trate ended_at IS NULL como treino em andamento.
  const abandonSession = useCallback(async (staleSessionId: string) => {
    if (!staleSessionId || staleSessionId.startsWith("local_")) return;
    const { error } = await (supabase as any)
      .from("workout_sessions")
      .update({ ended_at: new Date().toISOString(), notes: "Sessão abandonada (encerrada automaticamente)" })
      .eq("id", staleSessionId);
    if (error) console.warn("[abandonSession] Falha ao encerrar sessão antiga:", error.message);
  }, []);

  // ── Iniciar sessão ──────────────────────────────────────────────────────────
  const startSession = useCallback(async (params: StartSessionParams) => {
    userIdRef.current = params.userId;
    localDraftKey.current = workoutDraftStorageKey(params.userId, params.workoutKey, params.periodizationKey ?? null);
    // Mesma recuperação de pendências que resumeSession.
    pendingSetsRef.current = mergeQueues(loadPendingSetsFromStorage(localDraftKey.current), pendingSetsRef.current);
    persistQueue();
    pruneLocalSessions();

    const startedAtIso = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from("workout_sessions")
      .insert({
        user_id:            params.userId,
        coach_id:           params.coachId ?? null,
        plan_id:            params.planId ?? null,
        workout_key:        params.workoutKey,
        workout_label:      params.workoutLabel ?? null,
        periodization_week: params.periodizationWeek ?? null,
        periodization_key:  params.periodizationKey ?? null,
        block_number:       params.blockNumber ?? 1,
        is_deload_week:     params.isDeloadWeek ?? false,
        started_at:         startedAtIso,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.warn("[useWorkoutSession] Erro ao iniciar sessão:", error);
      // Sem rede: opera com um id local, mas guarda o que é preciso para criar a
      // sessão de verdade depois (com o started_at original).
      const localId = `local_${Date.now()}`;
      const { userId, ...rest } = params;
      writeLocalSession({ localId, userId, startedAt: startedAtIso, params: rest });
      applySessionId(localId);
    } else {
      applySessionId(data.id);
    }

    setIsActive(true);
    startTimeRef.current = new Date();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
        );
      }
    }, 1000);
  }, [applySessionId, persistQueue]);

  // ── Registrar série ─────────────────────────────────────────────────────────
  // Entra na fila ANTES de qualquer rede (offline-safe) e é enviada em ordem.
  // Se a sessão ainda não existe, fica na fila e sobe assim que ela existir.
  const registerSet = useCallback(
    async (params: RegisterSetParams) => {
      const item: QueueItem = {
        ...params,
        executedAt: params.executedAt ?? new Date().toISOString(),
        sid: sessionIdRef.current,
      };
      pendingSetsRef.current.push(item);
      persistQueue();

      const sid = sessionIdRef.current;
      if (!sid) return; // a fila é enviada quando a sessão existir

      await syncPendingSets();

      // Sessão local (offline conhecido) não reclama a cada série; sessão real
      // que não conseguiu gravar precisa avisar o aluno.
      if (!sid.startsWith("local_") && pendingSetsRef.current.includes(item)) {
        console.error("[registerSet] Série ficou pendente (sem confirmação do servidor)");
        throw new Error("Falha ao salvar série no servidor. Seus dados foram mantidos localmente.");
      }
    },
    [persistQueue, syncPendingSets]
  );

  // Tenta sincronizar assim que a sessão fica disponível e sempre que a conexão
  // voltar — cobre reabrir o app com séries pendentes e sessões criadas offline.
  useEffect(() => {
    if (!sessionId) return;
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
      { exercise_key: string; set_number: number; weight_kg: number | null; reps: number | null; completed: boolean; skipped: boolean; executed_at?: string | null }[]
    > => {
      if (!sessionIdToFetch || sessionIdToFetch.startsWith("local_")) return [];

      const { data, error } = await (supabase as any)
        .from("workout_sets")
        .select("exercise_key, set_number, weight_kg, reps, completed, skipped, executed_at")
        .eq("session_id", sessionIdToFetch);

      if (error) {
        console.warn("[getSessionSets] Erro ao buscar séries da sessão:", error.message);
        return [];
      }
      return data ?? [];
    },
    []
  );

  // ── Remover série (desfazer / remover pelo diálogo) ─────────────────────────
  // No banco a série é (sessão, exercício, nº). Tirar a do MEIO exige reescrever
  // as de cima com o número novo e apagar o excedente — tudo na mesma fila
  // ordenada, então é idempotente e continua valendo se a rede cair no meio.
  const removeSet = useCallback(
    async (exerciseName: string, plan: RemoveSetPlan) => {
      // Espera uma passada em andamento: ela poderia reenviar séries antigas
      // depois de a fila ser reescrita aqui.
      await syncChainRef.current.catch(() => undefined);

      const sid = sessionIdRef.current;
      const exKey = toExerciseKey(exerciseName);
      const now = new Date().toISOString();

      // Tudo que a fila ainda guarda deste exercício a partir da primeira série
      // afetada (e truncamentos antigos) é substituído pelo plano abaixo.
      pendingSetsRef.current = pendingSetsRef.current.filter((p) => {
        if (toExerciseKey(p.exerciseName) !== exKey) return true;
        if ((p.sid ?? sid) !== sid) return true;
        if (p.op === "truncate") return false;
        return p.setNumber < plan.fromSetNumber;
      });

      const items: QueueItem[] = [
        ...plan.shifted.map((s): QueueItem => ({ ...s, executedAt: s.executedAt ?? now, sid })),
        { op: "truncate", exerciseName, setNumber: plan.keepCount, executedAt: now, sid },
      ];
      pendingSetsRef.current.push(...items);
      persistQueue();

      if (!sid) return;
      await syncPendingSets();

      if (!sid.startsWith("local_") && items.some((i) => pendingSetsRef.current.includes(i))) {
        throw new Error("Falha ao ajustar as séries no servidor. A alteração foi mantida localmente.");
      }
    },
    [persistQueue, syncPendingSets]
  );

  // ── Concluir sessão ─────────────────────────────────────────────────────────
  const finishSession = useCallback(
    async (params: FinishSessionParams) => {
      const currentId = sessionIdRef.current;
      if (!currentId) return;

      if (timerRef.current) clearInterval(timerRef.current);

      const endedAt = new Date().toISOString();
      const finishPayload = {
        generalFeeling: params.generalFeeling ?? null,
        sleepQuality: params.sleepQuality ?? null,
        notes: params.notes ?? null,
      };

      // Sessão criada offline: registra o encerramento no registro local ANTES de
      // sincronizar, para a sessão nascer no servidor já encerrada.
      if (currentId.startsWith("local_")) {
        const rec = readLocalSession(currentId);
        if (rec) writeLocalSession({ ...rec, finish: { endedAt, ...finishPayload } });
      }

      // Última tentativa de sincronizar séries pendentes antes de encerrar.
      await syncPendingSets();

      let effectiveId = currentId;
      if (currentId.startsWith("local_")) {
        const rec = readLocalSession(currentId);
        if (rec?.realId) effectiveId = rec.realId;
      }

      if (!effectiveId.startsWith("local_")) {
        const { error } = await (supabase as any)
          .from("workout_sessions")
          .update({
            ended_at:        endedAt,
            general_feeling: finishPayload.generalFeeling,
            sleep_quality:   finishPayload.sleepQuality,
            notes:           finishPayload.notes,
          })
          .eq("id", effectiveId);
        if (error) {
          console.warn("[finishSession] Erro ao finalizar no banco:", error.message);
          // Fica guardado e é reenviado pela próxima sincronização (flushPendingFinishes).
          try {
            localStorage.setItem(
              `${FINISH_PENDING_PREFIX}${effectiveId}`,
              JSON.stringify({ ended_at: endedAt, ...finishPayload })
            );
          } catch { /* noop */ }
        }
      }

      // Compatibilidade: salva também em workout_progress (tabela legada)
      if (userIdRef.current) {
        const dayKey = effectiveId.startsWith("local_") ? "X" : effectiveId;
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
                session_id:   effectiveId.startsWith("local_") ? null : effectiveId,
              },
              { onConflict: "user_id,workout_id" }
            );
        } catch {
          // noop — não bloqueia conclusão se workout_progress falhar
        }
      }

      // Limpa buffer local — mas só se não sobrou nada pendente de fato. Se a
      // sincronização não confirmou tudo, preserva o rascunho: apagar aqui
      // destruiria a única cópia restante. Os itens carregam o `sid` da sessão
      // deles, então uma futura abertura do mesmo treino os envia para o lugar certo.
      try {
        if (pendingSetsRef.current.length === 0) {
          localStorage.removeItem(localDraftKey.current);
        }
      } catch { /* noop */ }

      setIsActive(false);

      // Dispara o motor determinístico de alertas (fadiga/estagnação/assiduidade).
      // Nunca bloqueia o encerramento do treino.
      try {
        await (supabase as any).functions.invoke("workout-alert-engine", {
          body: { studentId: userIdRef.current },
        });
      } catch { /* noop */ }
    },
    [syncPendingSets]
  );

  // ── Buscar histórico de um exercício ────────────────────────────────────────
  // @deprecated Só considera a série 1. Para progressão por série use
  // `getExerciseLoadHistory`. Mantido por compatibilidade (sem uso em produção).
  const getExerciseHistory = useCallback(
    async (exerciseName: string, periodizationKey: string | null = null, limit = 5): Promise<ExerciseHistory[]> => {
      if (!userIdRef.current) return [];

      const key = toExerciseKey(exerciseName);

      let query = (supabase as any)
        .from("workout_sets")
        .select("weight_kg, reps, perceived_effort, executed_at, periodization_key")
        .eq("user_id", userIdRef.current)
        .eq("exercise_key", key)
        .eq("set_number", 1)
        .eq("completed", true);

      // Fase ativa: filtro exato no banco; sem periodização: último treino geral.
      if (periodizationKey) query = query.eq("periodization_key", periodizationKey);

      const { data, error } = await query
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
  // @deprecated Só considera a série 1. Ver `getExerciseLoadHistory`.
  const getExerciseHistoryBatch = useCallback(
    async (
      exerciseNames: string[],
      periodizationKey: string | null = null,
      limitPerExercise = 3
    ): Promise<Record<string, ExerciseHistory[]>> => {
      const result: Record<string, ExerciseHistory[]> = {};
      if (!userIdRef.current || exerciseNames.length === 0) return result;

      const keyToName = new Map(exerciseNames.map((n) => [toExerciseKey(n), n]));
      const keys = Array.from(keyToName.keys());

      let query = (supabase as any)
        .from("workout_sets")
        .select("exercise_key, weight_kg, reps, perceived_effort, executed_at")
        .eq("user_id", userIdRef.current)
        .in("exercise_key", keys)
        .eq("set_number", 1)
        .eq("completed", true);

      // Fase ativa: filtro exato; sem fase: inclui sessões de todas as fases.
      if (periodizationKey) query = query.eq("periodization_key", periodizationKey);

      const { data, error } = await query.order("executed_at", { ascending: false });

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

  // Histórico com TODAS as séries de cada treino anterior (base da sugestão de
  // carga por série e da comparação de progressão).
  // Uma consulta por exercício: um limite global esconderia exercícios pouco usados.
  const getExerciseLoadHistory = useCallback(async (opts: LoadHistoryOptions): Promise<Record<string, ExerciseSessionLoad[]>> => {
    const { userId, exerciseNames, weekSlot = null, periodizationKey = null, excludeSessionId = null, sessionsPerExercise = 3 } = opts;
    const result: Record<string, ExerciseSessionLoad[]> = {};
    if (!userId || exerciseNames.length === 0) return result;
    await Promise.all(Array.from(new Set(exerciseNames)).map(async name => {
      let query = supabase.from("workout_sets")
        .select("session_id, set_number, weight_kg, reps, perceived_effort, executed_at, periodization_week")
        .eq("user_id", userId).eq("exercise_key", toExerciseKey(name))
        .eq("completed", true).eq("skipped", false);
      if (weekSlot != null) query = query.eq("periodization_week", weekSlot);
      // O slot (semana 0..3) é posicional: se o coach reordena as semanas, o mesmo
      // slot passa a ser outro estímulo. Exigir também a mesma fase evita misturar
      // cargas; registros antigos sem fase (null) continuam valendo.
      if (weekSlot != null && periodizationKey && /^[a-z_]+$/.test(periodizationKey)) {
        query = query.or(`periodization_key.is.null,periodization_key.eq.${periodizationKey}`);
      }
      if (excludeSessionId && !excludeSessionId.startsWith("local_")) query = query.neq("session_id", excludeSessionId);
      const { data, error } = await query.order("executed_at", { ascending: false }).limit(LOAD_HISTORY_ROWS_PER_EXERCISE);
      if (error || !data) return;
      const sessions = groupSetRowsIntoSessions(data as SetRowLike[], sessionsPerExercise);
      if (sessions.length) result[name] = sessions;
    }));
    return result;
  }, []);

  // Maior carga já registrada de cada exercício, em qualquer semana/fase.
  // É a base do "novo recorde": sem registro anterior, não há recorde a bater.
  const getExerciseBestWeights = useCallback(async (opts: { userId: string; exerciseNames: string[] }): Promise<Record<string, number>> => {
    const { userId, exerciseNames } = opts;
    const result: Record<string, number> = {};
    if (!userId || exerciseNames.length === 0) return result;
    await Promise.all(Array.from(new Set(exerciseNames)).map(async name => {
      const { data, error } = await supabase.from("workout_sets")
        .select("weight_kg")
        .eq("user_id", userId).eq("exercise_key", toExerciseKey(name))
        .eq("completed", true).eq("skipped", false).gt("weight_kg", 0)
        .order("weight_kg", { ascending: false }).limit(1);
      if (error || !data?.length) return;
      const best = Number(data[0].weight_kg) || 0;
      if (best > 0) result[name] = best;
    }));
    return result;
  }, []);

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
    abandonSession,
    materializeLocalSession,
    hasLocalSession,
    getSessionSets,
    registerSet,
    removeSet,
    finishSession,
    getExerciseHistory,
    getExerciseHistoryBatch,
    getExerciseLoadHistory,
    getExerciseBestWeights,
    getStreak,
  };
}

export interface LoadHistoryOptions {
  userId: string;
  exerciseNames: string[];
  weekSlot?: number | null;
  /** Fase da semana atual (peso/tecnica/resistencia/deload). Usada junto com `weekSlot`. */
  periodizationKey?: string | null;
  excludeSessionId?: string | null;
  sessionsPerExercise?: number;
}

const LOAD_HISTORY_ROWS_PER_EXERCISE = 60;
