// src/components/student/WorkoutMode.tsx
// Modo Treino — Cronômetro Dinâmico por Janela de Descanso (Sprint 11)

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  X,
  Pause,
  RotateCcw,
  Check,
  SkipForward,
  Flame,
  Zap,
  ChevronRight,
  Trophy,
  Play,
  Maximize2,
  ListTodo,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import WorkoutShareCard from "./WorkoutShareCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { useAdaptiveWeightStep } from "@/hooks/useAdaptiveWeightStep";
import { supabase } from "@/integrations/supabase/client";
import type { ExerciseHistory } from "@/lib/workoutTypes";
import { effortLabel, toExerciseKey } from "@/lib/workoutTypes";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { CompactWeekSelector } from "./CompactWeekSelector";

/* ── Constantes ─────────────────────────────────────────────────────────────── */
const GOLD = "#C9A84C";
const DEFAULT_WEEKS = [
  { label: "Semana 1 — Carga Máxima",            sets: "4 a 5 séries", reps: "5 a 8 reps",   rest: "2 min",     cadence: "1s conc / 2s exc" },
  { label: "Semana 2 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 3 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 4 — Estresse Metabólico",     sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30s a 45s", cadence: "1s conc / 1s exc" },
];

const EFFORT_OPTIONS: { value: 1 | 2 | 3; label: string; emoji: string; color: string; bg: string }[] = [
  { value: 1, label: "Limpo",  emoji: "✅", color: "#22c55e", bg: "rgba(34,197,94,0.14)" },
  { value: 2, label: "Pesado", emoji: "🔥", color: GOLD,      bg: "rgba(201,168,76,0.14)" },
  { value: 3, label: "Falhei", emoji: "💀", color: "#CC0000", bg: "rgba(204,0,0,0.14)" },
];

/* ── Helpers ── */
function parseSetsMax(s?: string): number {
  const nums = String(s || "3").match(/\d+/g);
  return nums ? Math.max(1, Math.max(...nums.map(Number))) : 3;
}
function parseSetsMin(s?: string): number {
  const nums = String(s || "3").match(/\d+/g);
  return nums ? Math.max(1, Math.min(...nums.map(Number))) : 3;
}
function parseRepsMin(s?: string): number {
  const nums = String(s || "0").match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : 0;
}
function parseRepsMax(s?: string): number {
  const nums = String(s || "0").match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}
function parseRestRange(rest?: string) {
  const nums = String(rest || "60-90").match(/\d+/g);
  if (!nums) return { min: 60, max: 90 };
  const toSec = (n: number) => (n < 60 && !/seg|s/.test(rest || "") ? n * 60 : n);
  const vals = nums.map(n => toSec(parseInt(n, 10)));
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
function fmtMMSS(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ── Sons ── */
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === "suspended") void sharedAudioCtx.resume();
    return sharedAudioCtx;
  } catch { return null; }
}

function playBeep(type: "warn" | "end" = "end") {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "end") {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.16);
      osc.start(now); osc.stop(now + 0.2);
    } else {
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now); osc.stop(now + 0.16);
    }
  } catch {}
}

/* ── Main Component ── */
export default function WorkoutMode({ workouts, userId, coachId, coachName, teamName, initialDay, initialWeek, periodization, onClose }: any) {
  const confirm = useConfirm();
  const session = useWorkoutSession();
  const storageKey = `workout_session_${userId}_${initialDay ?? workouts[0]?.key ?? "A"}`;
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks = periodization?.weeks?.length === 4 ? periodization.weeks : DEFAULT_WEEKS;

  const _saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { return null; } })();

  const [activeWeek, setActiveWeek] = useState<number>(_saved?.activeWeek ?? initialWeek ?? 0);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [phase, setPhase] = useState<"training" | "conclusion">("training");
  const [setDataMap, setSetDataMap] = useState<Record<string, any[]>>(_saved?.setDataMap ?? {});
  // Derivado de setDataMap — antes era um segundo useState (completed) atualizado
  // "em paralelo" a cada série, o que abria uma janela de corrida entre os dois
  // estados (um podia refletir uma série que o outro ainda não tinha). Como todo
  // o conteúdo de `completed` (índices das séries com done=true) já existe dentro
  // de setDataMap, não há motivo para guardá-lo separadamente.
  const completed = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const key of Object.keys(setDataMap)) {
      const doneIdx = (setDataMap[key] ?? [])
        .reduce((acc: number[], s: any, idx: number) => { if (s?.done) acc.push(idx); return acc; }, []);
      if (doneIdx.length) map[key] = doneIdx;
    }
    return map;
  }, [setDataMap]);
  const [startedAt, setStartedAt] = useState<number>(_saved?.startedAt ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [showShare, setShowShare] = useState(false);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const [showExList, setShowExList] = useState(false);

  // ── Retenção comportamental: histórico p/ detecção de PR, streak real e overlay ──
  const [historyMap, setHistoryMap] = useState<Record<string, ExerciseHistory[]>>({});
  const [sessionPRs, setSessionPRs] = useState<{ exerciseName: string; weightKg: number; reps: number }[]>([]);
  const [prPulse, setPrPulse] = useState(false);
  const [realStreak, setRealStreak] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const day = workouts.find((d: any) => d.key === (initialDay ?? workouts[0]?.key)) ?? workouts[0];
  const exercises = (day?.exercises ?? []).map((ex: any, idx: number) => {
    if (!isPeriodizationOn) return ex;
    const override = periodization?.overrides?.[String(activeWeek)]?.[`${day!.key}_${idx}`] ?? {};
    const wm = weeks[activeWeek];
    return { ...ex, sets: override.sets ?? wm.sets ?? ex.sets, reps: override.reps ?? wm.reps ?? ex.reps, rest: override.rest ?? wm.rest ?? ex.rest };
  });

  const currentEx = exercises[currentExIdx];
  const currentExKey = `${day?.key}::${currentExIdx}`;
  const gifUrl = useExerciseGif(currentEx?.name, currentEx?.gifKey);
  const setsMax = parseSetsMax(currentEx?.sets);
  const restRange = parseRestRange(currentEx?.rest);
  
  // Timer Dinâmico por Janela
  const [restBaseSec, setRestBaseSec] = useState(_saved?.restBaseSec ?? 0);
  const [restSegStartedAt, setRestSegStartedAt] = useState<number | null>(_saved?.restSegStartedAt ?? null);
  const restElapsed = restBaseSec + (restSegStartedAt ? Math.floor((now - restSegStartedAt) / 1000) : 0);
  const restRunning = restSegStartedAt !== null;

  const lastAlertRef = useRef<number>(-1);
  useEffect(() => {
    if (!restRunning) { lastAlertRef.current = -1; return; }
    
    // Alerta no Limite Inferior (Min)
    if (restElapsed === restRange.min && lastAlertRef.current !== restRange.min) {
      playBeep("warn");
      lastAlertRef.current = restRange.min;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
      toast.success("Janela de descanso aberta! Pode iniciar.", { icon: "🔥", duration: 2000 });
    }
    
    // Alerta no Limite Superior (Max) e Parada
    if (restElapsed >= restRange.max && lastAlertRef.current !== restRange.max) {
      playBeep("end");
      lastAlertRef.current = restRange.max;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([50, 40, 50]);
      setRestSegStartedAt(null);
      setRestBaseSec(restRange.max);

      // Se a última série do exercício já foi feita, o descanso máximo agora
      // funciona como o sinal de "hora de trocar" — avança sozinho para o
      // próximo exercício em vez de só travar o timer esperando um toque manual.
      const doneCountThisEx = (setDataMap[currentExKey] ?? []).filter((s: any) => s.done).length;
      const exerciseFullyDone = doneCountThisEx >= setsMax;
      const hasNextExercise = currentExIdx < exercises.length - 1;

      if (exerciseFullyDone && hasNextExercise) {
        toast.success(`Indo para ${exercises[currentExIdx + 1]?.name}`, { icon: "➡️", duration: 2500 });
        setCurrentExIdx((i) => i + 1);
      } else {
        toast.error("Limite de descanso atingido! Inicie agora.", { icon: "💀", duration: 3000 });
      }
    }
  }, [restElapsed, restRunning, restRange, setDataMap, currentExKey, setsMax, currentExIdx, exercises]);

  // ── Ciclo de vida da sessão de treino ───────────────────────────────────────
  // Sem isto, session.sessionId nunca é preenchido e registerSet/finishSession
  // não têm o que persistir (ambos saem em silêncio quando sessionId é nulo).
  // Tenta retomar (rascunho local ou sessão aberta no banco) antes de criar uma
  // nova, para não duplicar linha em workout_sessions nem "zerar" o progresso.
  const [isFinishing, setIsFinishing] = useState(false);
  // Declarado aqui (não junto de handleFinishWorkout) porque handleFizASerie,
  // definido mais acima na árvore de closures do componente, também precisa
  // checar essa ref para não registrar uma série exatamente durante a janela
  // de encerramento do treino.
  const isFinishingRef = useRef(false);
  const sessionBootstrapped = useRef(false);
  useEffect(() => {
    if (sessionBootstrapped.current || !userId || !day?.key) return;
    sessionBootstrapped.current = true;
    let cancelled = false;

    if (_saved?.sessionId && !String(_saved.sessionId).startsWith("local_")) {
      session.resumeSession({
        sessionId: _saved.sessionId,
        userId,
        workoutKey: day.key,
        startedAt: _saved.startedAt ?? Date.now(),
      });
      return;
    }

    session
      .findActiveSession(userId, day.key)
      .then((active) => {
        if (cancelled) return;
        if (active) {
          session.resumeSession({ sessionId: active.sessionId, userId, workoutKey: day.key, startedAt: active.startedAt });

          // Sem rascunho local (localStorage limpo, outro dispositivo, aba
          // anônima etc.) mas com sessão ativa no servidor: reconstrói
          // setDataMap a partir das séries já registradas, senão o treino
          // aparece "zerado" na tela mesmo com progresso salvo no banco.
          const hasLocalProgress = _saved?.setDataMap && Object.keys(_saved.setDataMap).length > 0;
          if (!hasLocalProgress) {
            session
              .getSessionSets(active.sessionId)
              .then((sets) => {
                if (cancelled || !sets.length) return;
                const rebuilt: Record<string, any[]> = {};
                sets.forEach((s) => {
                  const idx = exercises.findIndex((ex: any) => toExerciseKey(ex.name) === s.exercise_key);
                  if (idx === -1) return;
                  const key = `${day.key}::${idx}`;
                  const arr = rebuilt[key] ?? [];
                  arr[s.set_number - 1] = { weight: s.weight_kg ?? 0, reps: s.reps ?? 0, done: s.completed, skipped: s.skipped };
                  rebuilt[key] = arr;
                });
                // `prev` por cima do reconstruído: preserva qualquer série que
                // o aluno já tenha marcado localmente enquanto a busca corria.
                setSetDataMap((prev) => ({ ...rebuilt, ...prev }));
              })
              .catch((err) => {
                console.warn("[WorkoutMode] Falha ao reconstruir progresso da sessão recuperada:", err);
              });
          }
        } else {
          session.startSession({ userId, coachId, workoutKey: day.key, periodizationWeek: isPeriodizationOn ? activeWeek : undefined });
        }
      })
      .catch((err) => {
        console.warn("[WorkoutMode] Falha ao localizar sessão ativa, iniciando uma nova:", err);
        if (!cancelled) {
          session.startSession({ userId, coachId, workoutKey: day.key, periodizationWeek: isPeriodizationOn ? activeWeek : undefined });
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, day?.key]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ activeWeek, completed, setDataMap, sessionId: session.sessionId, startedAt, restBaseSec, restSegStartedAt }));
  }, [activeWeek, completed, setDataMap, session.sessionId, startedAt, restBaseSec, restSegStartedAt]);

  // Pré-carrega o melhor histórico de cada exercício do dia — 1 query só,
  // usada para saber em tempo real se a série atual é um Recorde Pessoal.
  // Protegido com try/catch: se falhar (sessão ainda não pronta, rede etc.)
  // o Modo Treino não pode quebrar por causa de uma feature de bônus (PR).
  useEffect(() => {
    if (!exercises.length) return;
    let cancelled = false;
    session
      .getExerciseHistoryBatch(exercises.map((e: any) => e.name))
      .then((map) => { if (!cancelled) setHistoryMap(map ?? {}); })
      .catch((err) => { console.warn("getExerciseHistoryBatch falhou (PR tracking desativado nesta sessão):", err); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.key, exercises.length]);

  // Guarda contra clique duplo: `isRegisteringSetRef` é checado de forma
  // síncrona (não depende de re-render), então mesmo dois cliques disparados
  // antes do estado `isRegisteringSet` propagar (e o botão desabilitar de
  // fato) não conseguem entrar na função ao mesmo tempo.
  const isRegisteringSetRef = useRef(false);
  const [isRegisteringSet, setIsRegisteringSet] = useState(false);

  const handleFizASerie = async (effort: 1 | 2 | 3) => {
    if (isRegisteringSetRef.current || isFinishingRef.current) return;
    const currentSets = setDataMap[currentExKey] ?? [];
    const setIdx = currentSets.filter(s => s.done).length;
    if (setIdx >= setsMax) return;

    isRegisteringSetRef.current = true;
    setIsRegisteringSet(true);

    const newSets = [...currentSets];
    newSets[setIdx] = { weight: activeWeight, reps: activeReps, effort, done: true, skipped: false };
    setSetDataMap(prev => ({ ...prev, [currentExKey]: newSets }));

    // ── Detecção de PR: compara a carga contra o melhor histórico do exercício ──
    // Recompensa variável real (não cosmética) — só dispara quando há motivo de fato.
    // BUG CORRIGIDO: "bestPrevWeight" antes só olhava o histórico de sessões
    // anteriores (buscado 1x ao entrar no exercício) e nunca era atualizado com
    // as séries já feitas NESTA sessão. Resultado: a 2ª, 3ª... série do mesmo
    // exercício com a MESMA carga continuava batendo o número "congelado" do
    // histórico antigo e disparava "Novo Record" de novo a cada clique.
    // Agora o teto de comparação é o maior entre o histórico e as séries já
    // registradas aqui, no exercício atual, durante este treino.
    const history = historyMap[currentEx?.name] ?? [];
    const historyBestWeight = history.length ? Math.max(...history.map(h => h.weightKg)) : 0;
    const sessionBestWeightThisEx = currentSets.length ? Math.max(...currentSets.map(s => s.weight || 0)) : 0;
    const bestPrevWeight = Math.max(historyBestWeight, sessionBestWeightThisEx);
    const isPR = activeWeight > 0 && activeWeight > bestPrevWeight;

    if (isPR) {
      setSessionPRs(prev => {
        const withoutDup = prev.filter(p => p.exerciseName !== currentEx?.name);
        return [...withoutDup, { exerciseName: currentEx?.name, weightKg: activeWeight, reps: activeReps }];
      });
      setPrPulse(true);
      setTimeout(() => setPrPulse(false), 1400);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 120]); // padrão distinto de "conquista"
      toast.success(`🏆 NOVO RECORD! ${activeWeight}kg em ${currentEx?.name}`, { duration: 3500, icon: "🏆" });
    } else if (navigator.vibrate) {
      // Vibração tiered por esforço — reforça a escala em vez de feedback genérico
      navigator.vibrate(effort === 3 ? [20, 40, 20] : effort === 2 ? [30] : [15]);
    }

    setRestBaseSec(0);
    setRestSegStartedAt(Date.now());

    try {
      await session.registerSet({
        exerciseName: currentEx?.name ?? "—",
        setNumber: setIdx + 1,
        weightKg: activeWeight,
        reps: activeReps,
        perceivedEffort: effort,
        completed: true,
      });
      // Toast com ação "Desfazer" — reduz o custo de um clique errado
      if (!isPR) {
        toast.success(`Série ${setIdx + 1} registrada`, {
          duration: 4000,
          action: {
            label: "Desfazer",
            onClick: () => { void handleUndoLastSet(); },
          },
        });
      }
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao registrar série no servidor (mantida localmente):", err);
      toast.error("Sem conexão — série salva localmente e será sincronizada depois.", { duration: 2500 });
    } finally {
      isRegisteringSetRef.current = false;
      setIsRegisteringSet(false);
    }
  };

  const [activeWeight, setActiveWeight] = useState(0);
  const [activeReps, setActiveReps] = useState(0);
  // Hook de incremento adaptativo (hold-to-step 1 → 2.5 → 5 → 10 kg)
  const weightDec = useAdaptiveWeightStep(setActiveWeight);
  const weightInc = useAdaptiveWeightStep(setActiveWeight);
  const [editingSetIdx, setEditingSetIdx] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState(0);
  const [editReps, setEditReps] = useState(0);
  const doneSets = (setDataMap[currentExKey] ?? []).filter(s => s.done);
  const todasFeitas = doneSets.length >= setsMax;

  // Pré-preencher carga/reps do histórico ao trocar de exercício,
  // apenas se ainda não há nenhuma série feita neste exercício nesta sessão.
  useEffect(() => {
    const currentSets = setDataMap[currentExKey] ?? [];
    if (currentSets.some((s: any) => s.done)) return;
    const history = historyMap[currentEx?.name] ?? [];
    if (history.length > 0) {
      const last = history[0];
      if (last?.weightKg && !activeWeight) setActiveWeight(last.weightKg);
      if (last?.reps && !activeReps) setActiveReps(last.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, historyMap]);

  /** Desfaz a última série marcada: remove localmente, restaura inputs,
   * zera o timer de descanso e deleta no backend. */
  const handleUndoLastSet = useCallback(async () => {
    const currentSets = setDataMap[currentExKey] ?? [];
    let lastIdx = -1;
    for (let i = currentSets.length - 1; i >= 0; i--) {
      if (currentSets[i]?.done) { lastIdx = i; break; }
    }
    if (lastIdx < 0) return;
    const removed = currentSets[lastIdx];
    const next = currentSets.slice(0, lastIdx).concat(currentSets.slice(lastIdx + 1));
    setSetDataMap((prev) => ({ ...prev, [currentExKey]: next }));
    if (typeof removed?.weight === "number") setActiveWeight(removed.weight);
    if (typeof removed?.reps === "number") setActiveReps(removed.reps);
    setRestBaseSec(0);
    setRestSegStartedAt(null);
    try {
      await session.deleteSet(lastIdx + 1, currentEx?.name ?? "—");
    } catch (err) {
      console.warn("[WorkoutMode] deleteSet falhou no undo:", err);
    }
  }, [setDataMap, currentExKey, session, currentEx]);

  /** Marca a série atual como pulada e persiste no backend. */
  const handlePularSerie = useCallback(async () => {
    if (isRegisteringSetRef.current || isFinishingRef.current) return;
    const currentSets = setDataMap[currentExKey] ?? [];
    const setIdx = currentSets.filter((s) => s.done).length;
    if (setIdx >= setsMax) return;
    const newSets = [...currentSets];
    newSets[setIdx] = { weight: 0, reps: 0, effort: null, done: true, skipped: true };
    setSetDataMap((prev) => ({ ...prev, [currentExKey]: newSets }));
    setRestBaseSec(0);
    setRestSegStartedAt(Date.now());
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    try {
      await session.registerSet({
        exerciseName: currentEx?.name ?? "—",
        setNumber: setIdx + 1,
        weightKg: 0,
        reps: 0,
        completed: false,
        skipped: true,
      });
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao registrar série pulada:", err);
    }
    toast("Série pulada", { icon: "⏭️", duration: 1800 });
  }, [setDataMap, currentExKey, setsMax, session, currentEx]);

  /** Salva a edição de uma série já registrada (do Dialog de edição). */
  const handleSaveEditSet = useCallback(async () => {
    if (editingSetIdx == null) return;
    const currentSets = setDataMap[currentExKey] ?? [];
    const target = currentSets[editingSetIdx];
    if (!target) { setEditingSetIdx(null); return; }
    const nextSet = { ...target, weight: editWeight, reps: editReps };
    const nextArr = currentSets.map((s, i) => (i === editingSetIdx ? nextSet : s));
    setSetDataMap((prev) => ({ ...prev, [currentExKey]: nextArr }));
    try {
      await session.registerSet({
        exerciseName: currentEx?.name ?? "—",
        setNumber: editingSetIdx + 1,
        weightKg: editWeight,
        reps: editReps,
        perceivedEffort: target.effort ?? undefined,
        completed: !target.skipped,
        skipped: !!target.skipped,
      });
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao editar série:", err);
    }
    setEditingSetIdx(null);
  }, [editingSetIdx, editWeight, editReps, setDataMap, currentExKey, session, currentEx]);

  /** Remove uma série do Dialog. */
  const handleRemoveSet = useCallback(async () => {
    if (editingSetIdx == null) return;
    const currentSets = setDataMap[currentExKey] ?? [];
    const target = currentSets[editingSetIdx];
    const nextArr = currentSets.slice(0, editingSetIdx).concat(currentSets.slice(editingSetIdx + 1));
    setSetDataMap((prev) => ({ ...prev, [currentExKey]: nextArr }));
    try {
      await session.deleteSet(editingSetIdx + 1, currentEx?.name ?? "—");
    } catch (err) {
      console.warn("[WorkoutMode] deleteSet falhou no remove:", err);
    }
    if (typeof target?.weight === "number") setActiveWeight(target.weight);
    if (typeof target?.reps === "number") setActiveReps(target.reps);
    setEditingSetIdx(null);
  }, [editingSetIdx, setDataMap, currentExKey, session, currentEx]);

  const progressPct = Math.round((Object.values(completed).flat().length / (exercises.reduce((acc: number, ex: any) => acc + parseSetsMin(ex.sets), 0))) * 100);

  // Status de cada exercício para o "Mapa do Treino" (drawer) — estava sendo
  // chamada na linha do map() mas nunca foi declarada, o que derrubava a tela
  // inteira com "ReferenceError: getExStatus is not defined" ao abrir o mapa.
  const getExStatus = (i: number): "done" | "partial" | "pending" => {
    const ex = exercises[i];
    const key = `${day?.key}::${i}`;
    const doneCount = (setDataMap[key] ?? []).filter((s: any) => s.done).length;
    if (doneCount <= 0) return "pending";
    if (doneCount >= parseSetsMin(ex?.sets)) return "done";
    return "partial";
  };

  // ── Encerramento do treino ──────────────────────────────────────────────────
  // Persiste ended_at/workout_progress ANTES de trocar para a tela de conclusão
  // (em vez de só trocar o estado visual). Isso elimina a janela de corrida em
  // que o aluno podia fechar o modal antes do encerramento ser salvo — quando
  // chegamos à tela de conclusão, o encerramento já foi tentado.
  const handleFinishWorkout = async () => {
    // `isFinishing` (estado) só reflete no próximo render — dois cliques quase
    // simultâneos podem ler o valor antigo antes de o botão desabilitar de
    // fato. O ref é checado e travado de forma síncrona, então cobre essa janela.
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    setIsFinishing(true);
    try {
      await session.finishSession({ periodizationWeek: isPeriodizationOn ? activeWeek : undefined });
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao finalizar sessão:", err);
      toast.error("Não foi possível confirmar o encerramento no servidor. Seu progresso foi mantido localmente.");
    } finally {
      isFinishingRef.current = false;
      setIsFinishing(false);
      setPhase("conclusion");
    }
  };

  // Ao concluir: busca o streak real (substitui o `streak={0}` hardcoded) e
  // auto-revela o card de compartilhamento — reduzir a fricção do clique é o
  // maior ganho de conversão do efeito rede.
  useEffect(() => {
    if (phase !== "conclusion") return;
    session.getStreak(userId).then(setRealStreak).catch((err) => {
      console.warn("getStreak falhou (streak ficará 0 nesta tela):", err);
    });
    const t = setTimeout(() => setShowShare(true), 900); // deixa o troféu "aterrissar" antes
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "conclusion") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col items-center p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center space-y-6 py-12">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"><Trophy className="w-10 h-10 text-primary" /></div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter">Elite Prime Hub</h1>
          <p className="text-muted-foreground font-medium">Treino concluído com alta performance.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card p-4 rounded-2xl border border-border"><p className="text-[10px] uppercase font-bold text-muted-foreground">Tempo</p><p className="text-xl font-black">{fmtMMSS(elapsedSec)}</p></div>
            <div className="bg-card p-4 rounded-2xl border border-border"><p className="text-[10px] uppercase font-bold text-muted-foreground">Sets</p><p className="text-xl font-black">{Object.values(completed).flat().length}</p></div>
          </div>
          <Button onClick={() => setShowShare(true)} className="w-full h-14 rounded-2xl gap-2 text-lg font-black uppercase italic shadow-[0_0_20px_rgba(201,168,76,0.3)] border-2 border-primary/50"><Zap className="w-5 h-5" /> Compartilhar</Button>
          <Button onClick={onClose} variant="ghost" className="w-full text-white/40">Fechar</Button>
        </motion.div>
        {showShare && <WorkoutShareCard workoutName={day?.key} durationSec={elapsedSec} totalSets={Object.values(completed).flat().length} completedExercises={Object.keys(completed).length} totalExercises={exercises.length} coachName={coachName} teamName={teamName} streak={realStreak} coachId={coachId} studentId={userId} prs={sessionPRs} onClose={() => setShowShare(false)} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-40 flex flex-col">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-white/5 px-4 py-2 flex items-center gap-3">
        {/* Antes: onClose disparava direto, sem aviso — 1 toque acidental e o aluno saía sem entender que o progresso fica salvo. Reaproveita o useConfirm já importado (estava sem uso). */}
        <button
          onClick={async () => {
            const ok = await confirm({
              title: "Sair do treino?",
              description: "Seu progresso foi salvo. Você pode continuar de onde parou depois — ou finalizar agora pelo Mapa do Treino.",
              confirmLabel: "Sair",
              cancelLabel: "Continuar treinando",
            });
            if (ok) onClose();
          }}
          className="w-11 h-11 -ml-1 flex items-center justify-center text-white/60 active:text-white active:scale-90 transition-all"
        ><X className="w-6 h-6" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-sm truncate uppercase tracking-tight">Treino {day?.key} {day?.focus && `· ${day.focus}`}</h1>
          <p className="text-xs text-primary font-bold flex items-center gap-1"><Flame className="w-3 h-3" /> {fmtMMSS(elapsedSec)}</p>
        </div>
        {/* Barra de progresso ampliada + fração numérica — reforça senso de avanço em vista periférica */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[10px] font-black text-white/70 tabular-nums">{Object.values(completed).flat().length}/{exercises.reduce((acc: number, ex: any) => acc + parseSetsMin(ex.sets), 0)} séries</span>
          <div className="h-2 w-20 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-primary" animate={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full p-4 space-y-4 flex-1">
        <CompactWeekSelector isPeriodizationOn={isPeriodizationOn} weeks={weeks} activeWeek={activeWeek} onWeekChange={setActiveWeek} />

        {currentEx && (
          <motion.div key={currentExKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            
            {/* Cronômetro Dinâmico */}
            <div className={`bg-neutral-900 rounded-3xl p-6 border-2 transition-all duration-500 ${restRunning ? (restElapsed >= restRange.min ? "border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]" : "border-primary shadow-[0_0_15px_rgba(201,168,76,0.2)]") : "border-white/5"} relative overflow-hidden`}>
              <div className="text-center space-y-1 relative z-10">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[9px] uppercase font-black ${restElapsed >= restRange.min ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-primary/10 text-primary border-primary/20"}`}>
                    {restRunning ? (restElapsed >= restRange.min ? "Janela Aberta" : "Recuperando") : "Aguardando Série"}
                  </Badge>
                  <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">{restRange.min}-{restRange.max}s</span>
                </div>
                <h3 className={`text-7xl font-black tabular-nums tracking-tighter transition-colors ${restRunning && (restRange.max - restElapsed <= 5) ? "text-red-500 animate-pulse" : "text-white"}`}>{fmtMMSS(restElapsed)}</h3>
                {restRunning && (
                  /* Botões com altura mínima de 44px (h-11) — antes h-9/36px, insuficiente para toque em movimento */
                  <div className="flex justify-center gap-3 mt-4">
                    <Button onClick={() => setRestSegStartedAt(null)} variant="secondary" size="sm" className="rounded-full h-11 px-7 text-xs font-black uppercase active:scale-95">Pausar</Button>
                    <Button onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }} size="sm" className="rounded-full h-11 px-7 text-xs font-black uppercase active:scale-95">Zerar</Button>
                  </div>
                )}
                {/* Aparece assim que a última série do exercício é marcada — avisa o próximo
                    exercício com antecedência para o aluno já ir se posicionando durante o
                    descanso. A troca automática só ocorre quando o descanso máximo terminar. */}
                {todasFeitas && currentExIdx < exercises.length - 1 && (
                  <motion.p
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-bold text-primary/90 mt-3"
                  >
                    Próximo: <span className="text-white">{exercises[currentExIdx + 1]?.name}</span> — use o descanso para se posicionar.
                  </motion.p>
                )}
              </div>
            </div>

            {/* Exercício Info */}
            <div className="bg-neutral-900 rounded-3xl p-4 border border-white/5 space-y-4">
              <div className="flex items-center gap-4">
                {gifUrl && (
                  <button onClick={() => setShowGifDialog(true)} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0"><img src={gifUrl} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Maximize2 className="w-4 h-4 text-white" /></div></button>
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-black leading-tight uppercase italic">{currentEx.name}</h2>
                  <p className="text-[11px] text-white/60 font-bold uppercase tracking-[0.2em] mt-1">{currentEx.sets} · {currentEx.reps} · {currentEx.rest}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {/* Círculos maiores (44px, antes 36px) + "pop" ao marcar — recompensa imediata em toda série, não só no PR */}
                {Array.from({ length: setsMax }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={doneSets[i] ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                    className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-black text-sm transition-all ${doneSets[i] ? "bg-green-500 border-green-500 text-black" : i === doneSets.length ? "border-primary text-primary scale-110" : "border-white/15 text-white/30"}`}
                  >{doneSets[i] ? <Check className="w-5 h-5" strokeWidth={3} /> : i + 1}</motion.div>
                ))}
              </div>
            </div>

            {/* Overlay de Novo Record */}
            <AnimatePresence>
              {prPulse && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
                >
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: [0, -8, 8, -4, 0] }}
                      transition={{ duration: 0.6 }}
                      className="text-6xl mb-2"
                    >🏆</motion.div>
                    <p className="text-2xl font-black italic uppercase text-primary drop-shadow-[0_0_20px_rgba(201,168,76,0.6)]">
                      Novo Record!
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inputs */}
            {!todasFeitas && (
              <div className="bg-neutral-900 rounded-3xl p-5 border border-white/5 space-y-4">
                {/*
                  Carga/Reps: teclado numérico exige precisão de toque + visão de perto — ruim com mãos
                  suadas/em movimento. Adicionados botões +/- (48px) como via alternativa de ajuste rápido
                  sem precisar digitar; o input de texto continua disponível para valores exatos/atípicos.
                */}
              <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] uppercase font-black text-white/60 ml-1">Carga (kg)</label>
                    <div className="flex items-stretch gap-1.5">
                      <button type="button" onClick={() => setActiveWeight(w => Math.max(0, w - 2.5))} className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all">–</button>
                      <input type="text" inputMode="numeric" value={activeWeight || ""} onChange={e => setActiveWeight(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black outline-none focus:border-primary/50" />
                      <button type="button" onClick={() => setActiveWeight(w => w + 2.5)} className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all">+</button>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] uppercase font-black text-white/60 ml-1">Reps</label>
                    <div className="flex items-stretch gap-1.5">
                      <button type="button" onClick={() => setActiveReps(r => Math.max(0, r - 1))} className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all">–</button>
                      <input type="text" inputMode="numeric" value={activeReps || ""} onChange={e => setActiveReps(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black outline-none focus:border-primary/50" />
                      <button type="button" onClick={() => setActiveReps(r => r + 1)} className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all">+</button>
                    </div>
                  </div>
                </div>
                {/* Botões de esforço maiores (min-h-20, antes py-3/~52px) — alvo de toque confortável em movimento */}
                <div className="grid grid-cols-3 gap-2">
                  {EFFORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleFizASerie(opt.value)} disabled={isRegisteringSet || isFinishing} className="flex flex-col items-center justify-center min-h-20 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none" style={{ borderColor: opt.color, backgroundColor: opt.bg, color: opt.color }}><span className="text-2xl">{opt.emoji}</span><span className="text-[10px] font-black uppercase mt-1">{opt.label}</span></button>
                  ))}
                </div>
                {/* Microcopy apenas na primeiríssima série do treino — orienta o iniciante sem infantilizar a UI nas séries seguintes */}
                {currentExIdx === 0 && doneSets.length === 0 && (
                  <p className="text-center text-[10px] text-white/40 font-medium -mt-1">Ajuste carga e reps, depois toque em como foi a série</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Navegação Inferior Fixa */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-white/10 p-4 pb-8">
        <div className="flex gap-3 max-w-2xl mx-auto">
          {/* Contraste condicional: esmaecido só quando de fato desabilitado (1º exercício); antes era sempre white/40, parecendo inativo mesmo quando clicável */}
          <Button variant="ghost" onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0} className={`flex-1 h-12 rounded-2xl font-bold ${currentExIdx === 0 ? "text-white/25" : "text-white/70"}`}>Anterior</Button>
          <Button onClick={() => setShowExList(true)} variant="secondary" className="flex-1 h-12 rounded-2xl font-black uppercase italic tracking-tighter gap-2"><ListTodo className="w-4 h-4" /> Mapa</Button>
          <Button onClick={() => currentExIdx === exercises.length - 1 ? handleFinishWorkout() : setCurrentExIdx(i => i + 1)} disabled={isFinishing} className="flex-[1.5] h-12 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90 gap-2">{currentExIdx === exercises.length - 1 ? (isFinishing ? "Salvando..." : "Finalizar") : "Próximo"} <ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Drawer de Exercícios */}
      <Dialog open={showExList} onOpenChange={setShowExList}>
        <DialogContent className="max-w-md bg-black border-white/10 p-0 overflow-hidden rounded-t-3xl sm:rounded-3xl">
          <DialogHeader className="p-6 border-b border-white/5"><DialogTitle className="text-xl font-black italic uppercase">Mapa do Treino</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
            {exercises.map((ex: any, i: number) => {
              const status = getExStatus(i);
              const isCurrent = currentExIdx === i;
              return (
                <button key={i} onClick={() => { setCurrentExIdx(i); setShowExList(false); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${isCurrent ? "bg-primary/10 border-primary" : "bg-white/5 border-white/5"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${status === "done" ? "bg-green-500 text-black" : status === "partial" ? "bg-primary/20 text-primary" : "bg-white/10 text-white/40"}`}>{status === "done" ? <Check className="w-4 h-4" /> : i + 1}</div>
                  <div className="flex-1 text-left min-w-0"><p className={`font-black text-sm truncate uppercase italic ${isCurrent ? "text-primary" : "text-white"}`}>{ex.name}</p><p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">{ex.sets} · {ex.reps}</p></div>
                </button>
              );
            })}
          </div>
          {/* Antes só era possível finalizar chegando na última série do último exercício.
              Agora, a qualquer momento do treino, o aluno pode abrir o Mapa e finalizar
              direto — útil quando decide encurtar o treino ou já fez o suficiente. */}
          <div className="p-4 bg-white/5 border-t border-white/5 space-y-2">
            <Button
              onClick={async () => {
                const totalDone = Object.values(completed).flat().length;
                const totalPlanned = exercises.reduce((acc: number, ex: any) => acc + parseSetsMin(ex.sets), 0);
                const ok = await confirm({
                  title: "Finalizar treino agora?",
                  description: `Você registrou ${totalDone} de ${totalPlanned} séries previstas. Isso vai encerrar o treino e mostrar seu resumo.`,
                  confirmLabel: "Finalizar",
                  cancelLabel: "Continuar treinando",
                });
                if (ok) { setShowExList(false); handleFinishWorkout(); }
              }}
              disabled={isFinishing}
              className="w-full h-12 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90"
            >{isFinishing ? "Salvando..." : "Finalizar Treino Agora"}</Button>
            <Button onClick={() => setShowExList(false)} variant="ghost" className="w-full font-bold uppercase text-[10px] tracking-widest">Fechar Mapa</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal GIF */}
      <Dialog open={showGifDialog} onOpenChange={setShowGifDialog}>
        <DialogContent className="max-w-sm p-2 bg-black border-white/10 rounded-3xl overflow-hidden">
          {gifUrl && <img src={gifUrl} className="w-full h-auto rounded-2xl shadow-2xl" />}
          <div className="p-4 text-center"><h3 className="font-black text-lg italic uppercase">{currentEx?.name}</h3><Button onClick={() => setShowGifDialog(false)} variant="secondary" className="w-full mt-4 rounded-xl font-bold uppercase text-[10px]">Fechar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
