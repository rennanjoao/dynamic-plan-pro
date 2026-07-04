// src/components/student/WorkoutMode.tsx
// Modo Treino — Cronômetro Dinâmico por Janela de Descanso (Sprint 11)

import {
  useEffect,
  useRef,
  useState,
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
import { supabase } from "@/integrations/supabase/client";
import type { ExerciseHistory } from "@/lib/workoutTypes";
import { effortLabel } from "@/lib/workoutTypes";
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
  const [completed, setCompleted] = useState<Record<string, number[]>>(_saved?.completed ?? {});
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
      toast.success("Janela de descanso aberta! Pode iniciar.", { icon: "🔥", duration: 2000 });
    }
    
    // Alerta no Limite Superior (Max) e Parada
    if (restElapsed >= restRange.max && lastAlertRef.current !== restRange.max) {
      playBeep("end");
      lastAlertRef.current = restRange.max;
      setRestSegStartedAt(null);
      setRestBaseSec(restRange.max);
      toast.error("Limite de descanso atingido! Inicie agora.", { icon: "💀", duration: 3000 });
    }
  }, [restElapsed, restRunning, restRange]);

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

  const handleFizASerie = async (effort: 1 | 2 | 3) => {
    const currentSets = setDataMap[currentExKey] ?? [];
    const setIdx = currentSets.filter(s => s.done).length;
    if (setIdx >= setsMax) return;

    const newSets = [...currentSets];
    newSets[setIdx] = { weight: activeWeight, reps: activeReps, effort, done: true, skipped: false };
    setSetDataMap(prev => ({ ...prev, [currentExKey]: newSets }));
    setCompleted(prev => ({ ...prev, [currentExKey]: [...(prev[currentExKey] ?? []), setIdx] }));

    // ── Detecção de PR: compara a carga contra o melhor histórico do exercício ──
    // Recompensa variável real (não cosmética) — só dispara quando há motivo de fato.
    const history = historyMap[currentEx?.name] ?? [];
    const bestPrevWeight = history.length ? Math.max(...history.map(h => h.weightKg)) : 0;
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

    await session.registerSet({
      exerciseName: currentEx?.name ?? "—",
      setNumber: setIdx + 1,
      weightKg: activeWeight,
      reps: activeReps,
      perceivedEffort: effort,
      completed: true,
    });
  };

  const [activeWeight, setActiveWeight] = useState(0);
  const [activeReps, setActiveReps] = useState(0);
  const doneSets = (setDataMap[currentExKey] ?? []).filter(s => s.done);
  const todasFeitas = doneSets.length >= setsMax;
  const progressPct = Math.round((Object.values(completed).flat().length / (exercises.reduce((acc: number, ex: any) => acc + parseSetsMin(ex.sets), 0))) * 100);

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
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-white/40"><X className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-sm truncate uppercase tracking-tight">Treino {day?.key} {day?.focus && `· ${day.focus}`}</h1>
          <p className="text-[10px] text-primary font-bold flex items-center gap-1"><Flame className="w-2.5 h-2.5" /> {fmtMMSS(elapsedSec)}</p>
        </div>
        <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary" animate={{ width: `${progressPct}%` }} />
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
                  <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">{restRange.min}-{restRange.max}s</span>
                </div>
                <h3 className={`text-7xl font-black tabular-nums tracking-tighter transition-colors ${restRunning && (restRange.max - restElapsed <= 5) ? "text-red-500 animate-pulse" : "text-white"}`}>{fmtMMSS(restElapsed)}</h3>
                {restRunning && (
                  <div className="flex justify-center gap-3 mt-4">
                    <Button onClick={() => setRestSegStartedAt(null)} variant="secondary" size="sm" className="rounded-full h-9 px-6 text-[10px] font-black uppercase">Pausar</Button>
                    <Button onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }} size="sm" className="rounded-full h-9 px-6 text-[10px] font-black uppercase">Zerar</Button>
                  </div>
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
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em] mt-1">{currentEx.sets} · {currentEx.reps} · {currentEx.rest}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: setsMax }).map((_, i) => (
                  <div key={i} className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-black text-sm transition-all ${doneSets[i] ? "bg-green-500 border-green-500 text-black" : i === doneSets.length ? "border-primary text-primary scale-110" : "border-white/10 text-white/20"}`}>{doneSets[i] ? <Check className="w-5 h-5" strokeWidth={3} /> : i + 1}</div>
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
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1"><label className="text-[9px] uppercase font-black text-white/40 ml-1">Carga (kg)</label><input type="text" inputMode="numeric" value={activeWeight || ""} onChange={e => setActiveWeight(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black outline-none focus:border-primary/50" /></div>
                  <div className="flex-1 space-y-1"><label className="text-[9px] uppercase font-black text-white/40 ml-1">Reps</label><input type="text" inputMode="numeric" value={activeReps || ""} onChange={e => setActiveReps(parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0)} className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black outline-none focus:border-primary/50" /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {EFFORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleFizASerie(opt.value)} className="flex flex-col items-center py-3 rounded-2xl border-2 transition-all active:scale-95" style={{ borderColor: opt.color, backgroundColor: opt.bg, color: opt.color }}><span className="text-xl">{opt.emoji}</span><span className="text-[9px] font-black uppercase mt-1">{opt.label}</span></button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Navegação Inferior Fixa */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-white/10 p-4 pb-8">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0} className="flex-1 h-12 rounded-2xl font-bold text-white/40">Anterior</Button>
          <Button onClick={() => setShowExList(true)} variant="secondary" className="flex-1 h-12 rounded-2xl font-black uppercase italic tracking-tighter gap-2"><ListTodo className="w-4 h-4" /> Mapa</Button>
          <Button onClick={() => currentExIdx === exercises.length - 1 ? setPhase("conclusion") : setCurrentExIdx(i => i + 1)} className="flex-[1.5] h-12 rounded-2xl font-black uppercase italic tracking-tighter bg-primary text-black hover:bg-primary/90 gap-2">{currentExIdx === exercises.length - 1 ? "Finalizar" : "Próximo"} <ChevronRight className="w-4 h-4" /></Button>
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
          <div className="p-4 bg-white/5 border-t border-white/5"><Button onClick={() => setShowExList(false)} variant="ghost" className="w-full font-bold uppercase text-[10px] tracking-widest">Fechar Mapa</Button></div>
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
