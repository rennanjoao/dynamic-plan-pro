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
  Repeat,
  Loader2,
  Video,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import WorkoutShareCard from "./WorkoutShareCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWorkoutSession, isSessionStale } from "@/hooks/useWorkoutSession";
import { useAdaptiveWeightStep } from "@/hooks/useAdaptiveWeightStep";
import { supabase } from "@/integrations/supabase/client";
import type { ExerciseHistory } from "@/lib/workoutTypes";
import { effortLabel, toExerciseKey } from "@/lib/workoutTypes";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { isMobilityExercise } from "@/lib/protocolSchema";
import { parseExerciseNotes } from "@/lib/parseExerciseNotes";
import { ExerciseVideoSheet } from "./ExerciseVideoSheet";
import { CompactWeekSelector } from "./CompactWeekSelector";
import { DEFAULT_WEEKS, parseRepsMin, parseRepsMax } from "@/lib/periodizationDefaults";
import { buildPeriodizationKey, workoutStateStorageKey } from "@/lib/periodizationKey";
import {
  getLibraryEntry,
  listExercisesByMuscleGroup,
  type LibraryEntry,
} from "@/lib/exerciseLibrary";
import { classifyExerciseByName, MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/muscleGroupClassifier";
import { parseRestTime } from "@/lib/timeParser";

/* ── Constantes ─────────────────────────────────────────────────────────────── */
const GOLD = "#C9A84C";

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
  } catch {
    // bipe é cosmético; se o WebAudio falhar (navegador/contexto sem suporte), ignora.
  }
}

/* ── Main Component ── */
export default function WorkoutMode({ workouts, userId, coachId, coachName, teamName, studentName, initialDay, initialWeek, periodization, onClose }: any) {
  const confirm = useConfirm();
  const session = useWorkoutSession();
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks = periodization?.weeks?.length === 4 ? periodization.weeks : DEFAULT_WEEKS;

  const dayKeyForStorage = initialDay ?? workouts[0]?.key ?? "A";

  const periodizationKeyOf = (weekIdx: number): string | null =>
    buildPeriodizationKey({
      enabled: isPeriodizationOn,
      reps: weeks[weekIdx]?.reps,
      label: weeks[weekIdx]?.label,
      isDeload: weeks[weekIdx]?.isDeload,
    });

  const initialPeriodizationKey = periodizationKeyOf(initialWeek ?? 0);
  const initialStorageKey = workoutStateStorageKey(userId, dayKeyForStorage, initialPeriodizationKey);

  const _saved = (() => { try { return JSON.parse(localStorage.getItem(initialStorageKey) ?? "null"); } catch { return null; } })();

  const [activeWeek, setActiveWeek] = useState<number>(_saved?.activeWeek ?? initialWeek ?? 0);
  const periodizationKey = periodizationKeyOf(activeWeek);
  const storageKey = workoutStateStorageKey(userId, dayKeyForStorage, periodizationKey);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [phase, setPhase] = useState<"training" | "conclusion">("training");
  const [setDataMap, setSetDataMap] = useState<Record<string, any[]>>(_saved?.setDataMap ?? {});
  
  const completed = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const key of Object.keys(setDataMap)) {
      const doneIdx = (setDataMap[key] ?? [])
        .reduce((acc: number[], s: any, idx: number) => { if (s?.done) acc.push(idx); return acc; }, []);
      if (doneIdx.length) map[key] = doneIdx;
    }
    return map;
  }, [setDataMap]);
  
  const totalVolumeKg = useMemo(() => {
    let total = 0;
    for (const key of Object.keys(setDataMap)) {
      for (const s of setDataMap[key] ?? []) {
        if (s?.done && !s?.skipped) {
          const w = Number(s?.weight) || 0;
          const r = Number(s?.reps) || 0;
          total += w * r;
        }
      }
    }
    return Math.round(total);
  }, [setDataMap]);

  const [startedAt, setStartedAt] = useState<number>(_saved?.startedAt ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [showShare, setShowShare] = useState(false);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const [showExList, setShowExList] = useState(false);
  
  const [swapMap, setSwapMap] = useState<Record<string, { name: string; gifKey?: string }>>(_saved?.swapMap ?? {});
  const [showSwap, setShowSwap] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapGroup, setSwapGroup] = useState<MuscleGroup | null>(null);
  const [swapOptions, setSwapOptions] = useState<LibraryEntry[]>([]);
  const [swapCurated, setSwapCurated] = useState(false);

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
  const dayExercises = ((day?.exercises ?? []) as any[]).filter((ex: any) => !isMobilityExercise(ex));
  const exercises = dayExercises.map((ex: any, idx: number) => {
    if (!isPeriodizationOn) return ex;
    const override = periodization?.overrides?.[String(activeWeek)]?.[`${day!.key}_${idx}`] ?? {};
    const wm = weeks[activeWeek];
    return { ...ex, sets: override.sets ?? wm.sets ?? ex.sets, reps: override.reps ?? wm.reps ?? ex.reps, rest: override.rest ?? wm.rest ?? ex.rest };
  }).map((ex: any, idx: number) => {
    const sw = swapMap[`${day?.key}::${idx}`];
    return sw ? { ...ex, name: sw.name, gifKey: sw.gifKey, swappedFrom: dayExercises[idx]?.name } : ex;
  });

  const currentEx = exercises[currentExIdx];
  const currentExKey = `${day?.key}::${currentExIdx}`;
  const gifUrl = useExerciseGif(currentEx?.name, currentEx?.gifKey);
  const setsMax = parseSetsMax(currentEx?.sets);
  
  // PARSER DE TEMPO INTELIGENTE (Substitui o antigo parseRestRange)
  const restMilestones = useMemo(() => {
    const parsed = parseRestTime(currentEx?.rest);
    return parsed.length > 0 ? parsed : [60, 90];
  }, [currentEx?.rest]);
  
  const minRest = restMilestones[0];
  const maxRest = restMilestones[restMilestones.length - 1];

  const parsedNotes = useMemo(() => parseExerciseNotes(currentEx?.notes), [currentEx?.notes]);

  useEffect(() => {
    setShowVideoSheet(false);
  }, [currentExKey]);

  // Timer Dinâmico por Janela
  const [restBaseSec, setRestBaseSec] = useState(_saved?.restBaseSec ?? 0);
  const [restSegStartedAt, setRestSegStartedAt] = useState<number | null>(_saved?.restSegStartedAt ?? null);
  const restElapsed = restBaseSec + (restSegStartedAt ? Math.floor((now - restSegStartedAt) / 1000) : 0);
  const restRunning = restSegStartedAt !== null;

  const triggeredAlertsRef = useRef<Set<number>>(new Set());
  
  useEffect(() => {
    if (!restRunning) { 
      triggeredAlertsRef.current.clear(); 
      return; 
    }
    
    // Alertas intermediários (Janela Aberta) - acionado em todos os milestones, exceto o último
    for (let i = 0; i < restMilestones.length - 1; i++) {
      const ms = restMilestones[i];
      if (restElapsed >= ms && !triggeredAlertsRef.current.has(ms)) {
        playBeep("warn");
        triggeredAlertsRef.current.add(ms);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
        toast.success("Janela de descanso aberta! Pode iniciar.", { icon: "🔥", duration: 2000 });
      }
    }
    
    // Alerta no Limite Superior (Max) e Parada
    if (restElapsed >= maxRest && !triggeredAlertsRef.current.has(maxRest)) {
      playBeep("end");
      triggeredAlertsRef.current.add(maxRest);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([50, 40, 50]);
      setRestSegStartedAt(null);
      setRestBaseSec(maxRest);

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
  }, [restElapsed, restRunning, restMilestones, maxRest, setDataMap, currentExKey, setsMax, currentExIdx, exercises]);

  // ── Ciclo de vida da sessão de treino ───────────────────────────────────────
  const [isFinishing, setIsFinishing] = useState(false);
  const [showPostWorkoutMetrics, setShowPostWorkoutMetrics] = useState(false);
  const [pwSleep, setPwSleep] = useState<1 | 2 | 3 | 4 | null>(null);
  const [pwFeeling, setPwFeeling] = useState<1 | 2 | 3 | 4 | null>(null);
  const isFinishingRef = useRef(false);
  const sessionBootstrapped = useRef(false);

  useEffect(() => {
    if (sessionBootstrapped.current || !userId || !day?.key) return;
    sessionBootstrapped.current = true;
    let cancelled = false;

    const beginNew = () => {
      session.startSession({
        userId,
        coachId,
        workoutKey: day.key,
        periodizationWeek: isPeriodizationOn ? activeWeek : undefined,
        periodizationKey,
        isDeloadWeek: periodizationKey === "deload",
      });
    };

    const askResume = async (startedAt: number) => {
      const hours = Math.floor((Date.now() - startedAt) / 3_600_000);
      const quando = hours >= 24 ? `${Math.floor(hours / 24)} dia(s)` : `${Math.max(hours, 1)} hora(s)`;
      return confirm({
        title: "Treino em aberto",
        description: `Você tem um treino iniciado há ${quando} e não finalizado. Quer continuar de onde parou ou começar um treino novo?`,
        confirmLabel: "Continuar de onde parei",
        cancelLabel: "Começar novo",
      });
    };

    const resetLocalProgress = () => {
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
      setSetDataMap({});
    };

    const rebuildFromServer = (activeSessionId: string) => {
      session
        .getSessionSets(activeSessionId)
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
          setSetDataMap((prev) => ({ ...rebuilt, ...prev }));
        })
        .catch((err) => {
          console.warn("[WorkoutMode] Falha ao reconstruir progresso:", err);
        });
    };

    (async () => {
      try {
        if (_saved?.sessionId && !String(_saved.sessionId).startsWith("local_")) {
          const startedAt = _saved.startedAt ?? Date.now();
          if (isSessionStale(startedAt)) {
            const keep = await askResume(startedAt);
            if (cancelled) return;
            if (!keep) {
              await session.abandonSession(String(_saved.sessionId));
              if (cancelled) return;
              resetLocalProgress();
              beginNew();
              return;
            }
          }
          session.resumeSession({ sessionId: _saved.sessionId, userId, workoutKey: day.key, startedAt, periodizationKey });
          return;
        }

        const active = await session.findActiveSession(userId, day.key);
        if (cancelled) return;
        if (!active) { beginNew(); return; }

        if (active.isStale) {
          const keep = await askResume(active.startedAt);
          if (cancelled) return;
          if (!keep) {
            await session.abandonSession(active.sessionId);
            if (cancelled) return;
            resetLocalProgress();
            beginNew();
            return;
          }
        }

        session.resumeSession({
          sessionId: active.sessionId,
          userId,
          workoutKey: day.key,
          startedAt: active.startedAt,
          periodizationKey: active.periodizationKey,
        });
        const hasLocalProgress = _saved?.setDataMap && Object.keys(_saved.setDataMap).length > 0;
        if (!hasLocalProgress) rebuildFromServer(active.sessionId);
      } catch (err) {
        console.warn("[WorkoutMode] Falha ao localizar sessão:", err);
        if (!cancelled) beginNew();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, day?.key]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ activeWeek, completed, setDataMap, swapMap, sessionId: session.sessionId, startedAt, restBaseSec, restSegStartedAt }));
  }, [activeWeek, completed, setDataMap, swapMap, session.sessionId, startedAt, restBaseSec, restSegStartedAt]);

  const openSwapDialog = useCallback(async () => {
    setShowSwap(true);
    setSwapLoading(true);
    try {
      const allowed: string[] = (currentEx as any)?.allowed_substitutes ?? [];
      if (allowed.length > 0) {
        const entries = (await Promise.all(allowed.map((k) => getLibraryEntry(null, k))))
          .filter(Boolean) as LibraryEntry[];
        setSwapCurated(true);
        setSwapGroup(null);
        setSwapOptions(entries);
        return;
      }
      setSwapCurated(false);
      const entry = await getLibraryEntry(currentEx?.name, currentEx?.gifKey);
      const group =
        entry?.primaryMuscleGroup ??
        classifyExerciseByName(currentEx?.name ?? "").primary ??
        null;
      setSwapGroup(group);
      setSwapOptions(group ? await listExercisesByMuscleGroup(group, entry?.key ?? null) : []);
    } catch {
      setSwapGroup(null);
      setSwapOptions([]);
    } finally {
      setSwapLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEx?.name, currentEx?.gifKey, (currentEx as any)?.allowed_substitutes]);

  useEffect(() => {
    if (!exercises.length) return;
    let cancelled = false;
    session
      .getExerciseHistoryBatch(exercises.map((e: any) => e.name), periodizationKey)
      .then((map) => { if (!cancelled) setHistoryMap(map ?? {}); })
      .catch((err) => { console.warn("getExerciseHistoryBatch falhou:", err); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.key, exercises.length, periodizationKey]);

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
      if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 120]);
      toast.success(`🏆 NOVO RECORD! ${activeWeight}kg em ${currentEx?.name}`, { duration: 3500, icon: "🏆" });
    } else if (navigator.vibrate) {
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
        repsTargetMin: parseRepsMin(currentEx?.reps),
        repsTargetMax: parseRepsMax(currentEx?.reps),
        perceivedEffort: effort,
        completed: true,
        swappedFromName: currentEx?.swappedFrom ?? null,
        periodizationKey,
      });
      if (!isPR) {
        toast.success(`Série ${setIdx + 1} registrada`, { duration: 2200 });
      }
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao registrar série:", err);
      toast.error("Sem conexão — série salva localmente e será sincronizada depois.", { duration: 2500 });
    } finally {
      isRegisteringSetRef.current = false;
      setIsRegisteringSet(false);
    }
  };

  const [activeWeight, setActiveWeight] = useState(0);
  const [activeReps, setActiveReps] = useState(0);
  const weightDec = useAdaptiveWeightStep(setActiveWeight);
  const weightInc = useAdaptiveWeightStep(setActiveWeight);
  const [editingSetIdx, setEditingSetIdx] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState(0);
  const [editReps, setEditReps] = useState(0);
  const doneSets = (setDataMap[currentExKey] ?? []).filter(s => s.done);
  const todasFeitas = doneSets.length >= setsMax;

  const lastPrefillKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prefillIdentity = `${currentExKey}@@${periodizationKey ?? "legacy"}`;
    const keyChanged = lastPrefillKeyRef.current !== prefillIdentity;
    lastPrefillKeyRef.current = prefillIdentity;

    const currentSets = setDataMap[currentExKey] ?? [];
    const hasDoneSets = currentSets.some((s: any) => s.done);

    const weight = keyChanged ? 0 : activeWeight;
    const reps = keyChanged ? 0 : activeReps;
    if (keyChanged) { setActiveWeight(0); setActiveReps(0); }

    if (hasDoneSets) return;
    const history = historyMap[currentEx?.name] ?? [];
    if (history.length > 0) {
      const last = history[0];
      if (last?.weightKg && !weight) setActiveWeight(last.weightKg);
      if (last?.reps && !reps) setActiveReps(last.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, historyMap, periodizationKey]);

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
      console.warn("[WorkoutMode] deleteSet falhou:", err);
    }
  }, [setDataMap, currentExKey, session, currentEx]);

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
        repsTargetMin: parseRepsMin(currentEx?.reps),
        repsTargetMax: parseRepsMax(currentEx?.reps),
        completed: false,
        skipped: true,
        swappedFromName: currentEx?.swappedFrom ?? null,
      });
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao registrar série pulada:", err);
    }
    toast("Série pulada", { icon: "⏭️", duration: 1800 });
  }, [setDataMap, currentExKey, setsMax, session, currentEx]);

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
        repsTargetMin: parseRepsMin(currentEx?.reps),
        repsTargetMax: parseRepsMax(currentEx?.reps),
        perceivedEffort: target.effort ?? undefined,
        completed: !target.skipped,
        skipped: !!target.skipped,
        swappedFromName: currentEx?.swappedFrom ?? null,
      });
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao editar série:", err);
    }
    setEditingSetIdx(null);
  }, [editingSetIdx, editWeight, editReps, setDataMap, currentExKey, session, currentEx]);

  const handleRemoveSet = useCallback(async () => {
    if (editingSetIdx == null) return;
    const currentSets = setDataMap[currentExKey] ?? [];
    const target = currentSets[editingSetIdx];
    const nextArr = currentSets.slice(0, editingSetIdx).concat(currentSets.slice(editingSetIdx + 1));
    setSetDataMap((prev) => ({ ...prev, [currentExKey]: nextArr }));
    try {
      await session.deleteSet(editingSetIdx + 1, currentEx?.name ?? "—");
    } catch (err) {
      console.warn("[WorkoutMode] deleteSet falhou:", err);
    }
    if (typeof target?.weight === "number") setActiveWeight(target.weight);
    if (typeof target?.reps === "number") setActiveReps(target.reps);
    setEditingSetIdx(null);
  }, [editingSetIdx, setDataMap, currentExKey, session, currentEx]);

  const progressPct = Math.round((Object.values(completed).flat().length / (exercises.reduce((acc: number, ex: any) => acc + parseSetsMin(ex.sets), 0))) * 100);

  const getExStatus = (i: number): "done" | "partial" | "pending" => {
    const ex = exercises[i];
    const key = `${day?.key}::${i}`;
    const doneCount = (setDataMap[key] ?? []).filter((s: any) => s.done).length;
    if (doneCount <= 0) return "pending";
    if (doneCount >= parseSetsMin(ex?.sets)) return "done";
    return "partial";
  };

  const handleFinishWorkout = () => {
    if (isFinishingRef.current) return;
    setPwSleep(null);
    setPwFeeling(null);
    setShowPostWorkoutMetrics(true);
  };

  const confirmFinishWorkout = async () => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    setIsFinishing(true);
    try {
      await session.finishSession({
        periodizationWeek: isPeriodizationOn ? activeWeek : undefined,
        sleepQuality: pwSleep,
        generalFeeling: pwFeeling,
      });
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
      setShowPostWorkoutMetrics(false);
      setPhase("conclusion");
    } catch (err) {
      console.warn("[WorkoutMode] Falha ao finalizar sessão:", err);
      toast.error("Não foi possível confirmar o encerramento no servidor. Seu progresso foi mantido localmente.");
      setShowPostWorkoutMetrics(false);
      setPhase("conclusion");
    } finally {
      isFinishingRef.current = false;
      setIsFinishing(false);
    }
  };

  useEffect(() => {
    if (phase !== "conclusion") return;
    session.getStreak(userId).then(setRealStreak).catch((err) => {
      console.warn("getStreak falhou:", err);
    });
    const t = setTimeout(() => setShowShare(true), 900);
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
        {showShare && <WorkoutShareCard workoutName={day?.key} durationSec={elapsedSec} totalSets={Object.values(completed).flat().length} completedExercises={Object.keys(completed).length} totalExercises={exercises.length} coachName={coachName} teamName={teamName} studentName={studentName} totalVolumeKg={totalVolumeKg} streak={realStreak} coachId={coachId} studentId={userId} prs={sessionPRs} onClose={() => setShowShare(false)} />}
      </div>
    );
  }

  // Prepara o display UI de tempo, resolvendo array de milestones
  const isWindowOpen = restMilestones.length > 1 && restElapsed >= minRest;
  const restDisplay = restMilestones.length > 1 
      ? `${restMilestones[0]}-${restMilestones[restMilestones.length - 1]}s` 
      : `${restMilestones[0]}s`;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-40 flex flex-col">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-white/5 px-4 py-2 flex items-center gap-3">
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
            
            {/* Cronômetro Dinâmico Integrado com timeParser */}
            <div className={`bg-neutral-900 rounded-3xl p-6 border-2 transition-all duration-500 ${restRunning ? (isWindowOpen ? "border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]" : "border-primary shadow-[0_0_15px_rgba(201,168,76,0.2)]") : "border-white/5"} relative overflow-hidden`}>
              <div className="text-center space-y-1 relative z-10">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[9px] uppercase font-black ${isWindowOpen ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-primary/10 text-primary border-primary/20"}`}>
                    {restRunning ? (isWindowOpen ? "Janela Aberta" : "Recuperando") : "Aguardando Série"}
                  </Badge>
                  <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">{restDisplay}</span>
                </div>
                <h3 className={`text-7xl font-black tabular-nums tracking-tighter transition-colors ${restRunning && (maxRest - restElapsed <= 5) ? "text-red-500 animate-pulse" : "text-white"}`}>{fmtMMSS(restElapsed)}</h3>
                {restRunning && (
                  <div className="flex justify-center gap-3 mt-4">
                    <Button onClick={() => setRestSegStartedAt(null)} variant="secondary" size="sm" className="rounded-full h-11 px-7 text-xs font-black uppercase active:scale-95">Pausar</Button>
                    <Button onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }} size="sm" className="rounded-full h-11 px-7 text-xs font-black uppercase active:scale-95">Zerar</Button>
                  </div>
                )}
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
                  {currentEx.swappedFrom && (
                    <p className="text-[10px] text-amber-400 mt-1">Substituindo: {currentEx.swappedFrom}</p>
                  )}
                  <button
                    type="button"
                    onClick={openSwapDialog}
                    className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white border border-white/10 rounded-full px-2.5 py-1"
                  >
                    <Repeat className="w-3 h-3" /> Trocar exercício
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: setsMax }).map((_, i) => {
                  const s = doneSets[i];
                  const isCurrent = i === doneSets.length;
                  const isSkipped = s?.skipped;
                  const cls = s
                    ? isSkipped
                      ? "bg-transparent border-white/40 border-dashed text-white/50"
                      : "bg-green-500 border-green-500 text-black"
                    : isCurrent
                      ? "border-primary text-primary scale-110"
                      : "border-white/15 text-white/30";
                  return (
                    <motion.button
                      key={i}
                      type="button"
                      initial={false}
                      animate={s && !isSkipped ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35 }}
                      disabled={!s}
                      onClick={() => {
                        if (!s) return;
                        setEditingSetIdx(i);
                        setEditWeight(s.weight ?? 0);
                        setEditReps(s.reps ?? 0);
                      }}
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-black text-sm transition-all disabled:cursor-default ${cls}`}
                      aria-label={s ? `Editar série ${i + 1}` : `Série ${i + 1} pendente`}
                    >
                      {s ? (isSkipped ? "–" : <Check className="w-5 h-5" strokeWidth={3} />) : i + 1}
                    </motion.button>
                  );
                })}
              </div>
              {(parsedNotes.text || parsedNotes.rawUrl) && (
                <div className="space-y-2 pt-1 border-t border-white/5">
                  {parsedNotes.text && (
                    <p className="text-xs text-white/70 leading-relaxed whitespace-pre-line">{parsedNotes.text}</p>
                  )}
                  {parsedNotes.rawUrl && (
                    <button
                      type="button"
                      onClick={() => setShowVideoSheet(true)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-primary bg-primary/10 border border-primary/30 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
                    >
                      <Video className="w-3.5 h-3.5" /> Ver Vídeo de Execução
                    </button>
                  )}
                </div>
              )}
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
              <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] uppercase font-black text-white/60 ml-1">Carga (kg)</label>
                    <div className="flex items-stretch gap-1.5">
                      <button
                        type="button"
                        onPointerDown={weightDec.onPointerDown(-1)}
                        onPointerUp={weightDec.onPointerUp}
                        onPointerLeave={weightDec.onPointerLeave}
                        className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all"
                        aria-label="Diminuir carga (mantenha pressionado para acelerar)"
                      >–</button>
                      <input type="text" inputMode="numeric" value={activeWeight || ""} onChange={e => setActiveWeight(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black outline-none focus:border-primary/50" />
                      <button
                        type="button"
                        onPointerDown={weightInc.onPointerDown(1)}
                        onPointerUp={weightInc.onPointerUp}
                        onPointerLeave={weightInc.onPointerLeave}
                        className="w-12 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-white/70 active:bg-white/10 active:scale-95 transition-all"
                        aria-label="Aumentar carga (mantenha pressionado para acelerar)"
                      >+</button>
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
                <div className="grid grid-cols-3 gap-2">
                  {EFFORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleFizASerie(opt.value)} disabled={isRegisteringSet || isFinishing} className="flex flex-col items-center justify-center min-h-20 rounded-2xl border-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none" style={{ borderColor: opt.color, backgroundColor: opt.bg, color: opt.color }}><span className="text-2xl">{opt.emoji}</span><span className="text-[10px] font-black uppercase mt-1">{opt.label}</span></button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handlePularSerie}
                  disabled={isRegisteringSet || isFinishing}
                  className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-white/15 text-white/60 text-xs font-black uppercase tracking-wider hover:text-white hover:border-white/30 active:scale-95 transition-all disabled:opacity-50"
                >
                  <SkipForward className="w-4 h-4" /> Pular série
                </button>
                {currentExIdx === 0 && doneSets.length === 0 && (
                  <p className="text-center text-[10px] text-white/40 font-medium -mt-1">Ajuste carga e reps, depois toque em como foi a série</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </main>

      <Dialog open={editingSetIdx !== null} onOpenChange={(o) => { if (!o) setEditingSetIdx(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Série {editingSetIdx != null ? editingSetIdx + 1 : ""} · {currentEx?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] uppercase font-black text-white/60">Carga (kg)</label>
                <input
                  type="number"
                  step="0.5"
                  value={editWeight || ""}
                  onChange={(e) => setEditWeight(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl text-center text-lg font-black outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] uppercase font-black text-white/60">Reps</label>
                <input
                  type="number"
                  value={editReps || ""}
                  onChange={(e) => setEditReps(parseFloat(e.target.value) || 0)}
                  className="w-full h-12 bg-white/5 border border-white/10 rounded-xl text-center text-lg font-black outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="destructive" onClick={handleRemoveSet} className="flex-1">
                Remover
              </Button>
              <Button onClick={handleSaveEditSet} className="flex-1">
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-white/10 p-4 pb-8">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0} className={`flex-1 h-12 rounded-2xl font-bold ${currentExIdx === 0 ? "text-white/25" : "text-white/70"}`}>Anterior</Button>
          <Button onClick={() => setShowExList(true)} variant="secondary" className="flex-1 h-12 rounded-2xl font-black uppercase italic tracking-tighter gap-2"><ListTodo className="w-4 h-4" /> Mapa</Button>
          <Button onClick={() => currentExIdx === exercises.length - 1 ? handleFinishWorkout() : setCurrentExIdx(i => i + 1)} disabled={isFinishing} className="flex-[1.5] h-12 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90 gap-2">{currentExIdx === exercises.length - 1 ? (isFinishing ? "Salvando..." : "Finalizar") : "Próximo"} <ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <Dialog open={showSwap} onOpenChange={setShowSwap}>
        <DialogContent className="max-w-md bg-neutral-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black italic uppercase">Trocar exercício</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-white/60 -mt-2">
            {swapCurated
              ? "Alternativas liberadas pelo seu coach para este exercício."
              : swapGroup
              ? `Alternativas de ${MUSCLE_GROUP_LABELS[swapGroup]} — o estímulo prescrito é mantido.`
              : "Não identificamos o grupo muscular deste exercício."}
          </p>
          <div className="max-h-[50vh] overflow-y-auto space-y-1.5 mt-2">
            {swapLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : swapOptions.length === 0 ? (
              <p className="text-xs text-white/50 py-6 text-center">Nenhuma alternativa disponível na biblioteca.</p>
            ) : (
              swapOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    const originalName = dayExercises[currentExIdx]?.name ?? currentEx?.name;
                    setSwapMap((prev) => ({ ...prev, [currentExKey]: { name: opt.displayName, gifKey: opt.key } }));
                    setShowSwap(false);
                    toast.success(`Exercício trocado por ${opt.displayName}`);
                    if (coachId) {
                      supabase.from("coach_notifications").insert({
                        coach_id: coachId,
                        student_id: userId,
                        student_name: studentName ?? "Aluno",
                        context: "exercise_swap",
                        message: `Trocou "${originalName}" por "${opt.displayName}" no treino ${day?.key ?? ""}.`,
                      }).then(({ error }) => {
                        if (error) console.warn("[troca-exercicio] alerta ao coach falhou:", error.message);
                      });
                    }
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl border border-white/10 hover:border-primary/60 text-left"
                >
                  <img src={opt.url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" loading="lazy" />
                  <span className="text-sm font-bold">{opt.displayName}</span>
                </button>
              ))
            )}
          </div>
          {swapMap[currentExKey] && (
            <Button
              variant="ghost"
              className="w-full text-xs"
              onClick={() => {
                setSwapMap((prev) => { const n = { ...prev }; delete n[currentExKey]; return n; });
                setShowSwap(false);
              }}
            >
              Voltar ao exercício original
            </Button>
          )}
        </DialogContent>
      </Dialog>

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

      <Dialog open={showPostWorkoutMetrics} onOpenChange={(o) => { if (!o && !isFinishing) setShowPostWorkoutMetrics(false); }}>
        <DialogContent className="max-w-md bg-black/90 backdrop-blur-md border border-white/10 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black italic uppercase tracking-tight">
              Como foi este treino?
            </DialogTitle>
            <p className="text-xs text-white/50 -mt-1">Opcional — ajuda seu coach, mas não é obrigatório pra finalizar.</p>
          </DialogHeader>
          <div className="space-y-6 mt-2">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-white/50">Qualidade do sono</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 1, emoji: "🔴", label: "Ruim",      color: "#ef4444", bg: "rgba(239,68,68,0.10)" },
                  { v: 2, emoji: "🟡", label: "Regular",   color: "#eab308", bg: "rgba(234,179,8,0.10)" },
                  { v: 3, emoji: "🟢", label: "Boa",       color: "#3b82f6", bg: "rgba(59,130,246,0.10)" },
                  { v: 4, emoji: "✨", label: "Excelente", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
                ].map((opt) => {
                  const active = pwSleep === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPwSleep(opt.v as 1 | 2 | 3 | 4)}
                      className="flex items-center gap-2 h-14 rounded-2xl border-2 px-3 text-left transition-all active:scale-95"
                      style={{
                        borderColor: active ? opt.color : "rgba(255,255,255,0.10)",
                        background: active ? opt.bg : "rgba(255,255,255,0.03)",
                        color: active ? opt.color : "rgba(255,255,255,0.75)",
                      }}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <span className="text-sm font-black uppercase tracking-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-white/50">Sensação no treino</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 1, emoji: "🥱", label: "Cansado",  color: "#eab308", bg: "rgba(234,179,8,0.10)" },
                  { v: 2, emoji: "😐", label: "Normal",   color: "#3b82f6", bg: "rgba(59,130,246,0.10)" },
                  { v: 3, emoji: "🔥", label: "Disposto", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
                  { v: 4, emoji: "💀", label: "Exaurido", color: "#ef4444", bg: "rgba(239,68,68,0.10)" },
                ].map((opt) => {
                  const active = pwFeeling === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPwFeeling(opt.v as 1 | 2 | 3 | 4)}
                      className="flex items-center gap-2 h-14 rounded-2xl border-2 px-3 text-left transition-all active:scale-95"
                      style={{
                        borderColor: active ? opt.color : "rgba(255,255,255,0.10)",
                        background: active ? opt.bg : "rgba(255,255,255,0.03)",
                        color: active ? opt.color : "rgba(255,255,255,0.75)",
                      }}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <span className="text-sm font-black uppercase tracking-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={confirmFinishWorkout}
              disabled={isFinishing}
              className="w-full h-14 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90 disabled:opacity-40"
            >
              {isFinishing ? "Salvando..." : "Confirmar e Finalizar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGifDialog} onOpenChange={setShowGifDialog}>
        <DialogContent className="max-w-sm p-2 bg-black border-white/10 rounded-3xl overflow-hidden">
          {gifUrl && <img src={gifUrl} className="w-full h-auto rounded-2xl shadow-2xl" />}
          <div className="p-4 text-center"><h3 className="font-black text-lg italic uppercase">{currentEx?.name}</h3><Button onClick={() => setShowGifDialog(false)} variant="secondary" className="w-full mt-4 rounded-xl font-bold uppercase text-[10px]">Fechar</Button></div>
        </DialogContent>
      </Dialog>

      <ExerciseVideoSheet
        open={showVideoSheet}
        onOpenChange={setShowVideoSheet}
        embedUrl={parsedNotes.embedUrl}
        rawUrl={parsedNotes.rawUrl}
        provider={parsedNotes.provider}
        exerciseName={currentEx?.name}
      />
    </div>
  );
}
