// src/components/student/WorkoutMode.tsx
// Modo Treino — Otimizado para UX, Retenção, Dopamina e Navegação Tátil (Sprint 8)

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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
function fmtMMSS(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ── NumericField ── */
const NumericField = memo(({ label, unit, value, suggestedValue, onChange, accent = false }: any) => {
  const displayVal = value > 0 ? String(value) : "";
  return (
    <div className="flex-1 flex flex-col gap-1">
      <label className="text-[9px] uppercase font-bold text-white/40 tracking-wider">{label}</label>
      <div className="flex items-center rounded-xl bg-white/5 border border-white/10 overflow-hidden h-14 transition-all focus-within:border-primary/50">
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={displayVal} placeholder={String(suggestedValue || 0)}
          onChange={(e) => {
            const val = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
            onChange(isNaN(val) ? 0 : val);
          }}
          className="flex-1 bg-transparent text-center text-2xl font-black text-white outline-none w-0"
        />
        <span className="pr-3 text-[10px] font-bold text-white/20 uppercase">{unit}</span>
      </div>
    </div>
  );
});

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
  const [streak, setStreak] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const [showGifDialog, setShowGifDialog] = useState(false);

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
  
  // Timer logic
  const [restBaseSec, setRestBaseSec] = useState(_saved?.restBaseSec ?? 0);
  const [restSegStartedAt, setRestSegStartedAt] = useState<number | null>(_saved?.restSegStartedAt ?? null);
  const restElapsed = restBaseSec + (restSegStartedAt ? Math.floor((now - restSegStartedAt) / 1000) : 0);
  const restRunning = restSegStartedAt !== null;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ activeWeek, completed, setDataMap, sessionId: session.sessionId, startedAt, restBaseSec, restSegStartedAt }));
  }, [activeWeek, completed, setDataMap, session.sessionId, startedAt, restBaseSec, restSegStartedAt]);

  const handleFizASerie = async (effort: 1 | 2 | 3) => {
    const currentSets = setDataMap[currentExKey] ?? [];
    const setIdx = currentSets.filter(s => s.done).length;
    if (setIdx >= setsMax) return;

    const newSets = [...currentSets];
    newSets[setIdx] = { weight: activeWeight, reps: activeReps, effort, done: true, skipped: false };
    setSetDataMap(prev => ({ ...prev, [currentExKey]: newSets }));
    setCompleted(prev => ({ ...prev, [currentExKey]: [...(prev[currentExKey] ?? []), setIdx] }));
    
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

  const getExStatus = (idx: number) => {
    const key = `${day?.key}::${idx}`;
    const sets = setDataMap[key] ?? [];
    const done = sets.filter(s => s.done).length;
    const total = parseSetsMin(exercises[idx].sets);
    if (done >= total) return "done";
    if (done > 0) return "partial";
    return "pending";
  };

  if (phase === "conclusion") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col items-center p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center space-y-6 py-12">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-black">Missão Cumprida!</h1>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card p-4 rounded-2xl border border-border">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Tempo</p>
              <p className="text-xl font-black">{fmtMMSS(elapsedSec)}</p>
            </div>
            <div className="bg-card p-4 rounded-2xl border border-border">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Sequência</p>
              <p className="text-xl font-black">{streak} dias 🔥</p>
            </div>
          </div>
          <Button onClick={() => setShowShare(true)} className="w-full h-14 rounded-2xl gap-2 text-lg font-bold">
            <Zap className="w-5 h-5" /> Compartilhar Resultado
          </Button>
          <Button onClick={onClose} variant="ghost" className="w-full text-white/40">Fechar</Button>
        </motion.div>
        {showShare && <WorkoutShareCard workoutName={day?.key} durationSec={elapsedSec} totalSets={Object.values(completed).flat().length} completedExercises={Object.keys(completed).length} totalExercises={exercises.length} coachName={coachName} teamName={teamName} streak={streak} coachId={coachId} onClose={() => setShowShare(false)} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-32 flex flex-col">
      {/* ── Header ── */}
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

      {/* ── Barra de Navegação Horizontal (Quick Switcher) ── */}
      <nav className="sticky top-[52px] z-20 bg-background/95 backdrop-blur border-b border-white/5 flex items-center overflow-x-auto no-scrollbar py-2 px-4 gap-2">
        {exercises.map((ex: any, i: number) => {
          const status = getExStatus(i);
          const isCurrent = currentExIdx === i;
          return (
            <button key={i} onClick={() => setCurrentExIdx(i)} className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isCurrent ? "bg-primary border-primary text-primary-foreground" : "bg-white/5 border-white/10 text-white/40"}`}>
              <span className="text-[10px] font-black">{i + 1}</span>
              {status === "done" && <Check className="w-3 h-3" />}
              {isCurrent && <span className="text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap">{ex.name}</span>}
            </button>
          );
        })}
      </nav>

      <main className="max-w-2xl mx-auto w-full p-4 space-y-4 flex-1">
        <CompactWeekSelector isPeriodizationOn={isPeriodizationOn} weeks={weeks} activeWeek={activeWeek} onWeekChange={setActiveWeek} />

        {/* ── Exercício Atual ── */}
        {currentEx && (
          <motion.div key={currentExKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            
            {/* GIF + Nome */}
            <div className="bg-neutral-900 rounded-3xl p-4 border border-white/5 space-y-4">
              <div className="flex items-center gap-4">
                {gifUrl ? (
                  <button onClick={() => setShowGifDialog(true)} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0 group">
                    <img src={gifUrl} alt="Execução" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="w-5 h-5 text-white" />
                    </div>
                  </button>
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Play className="w-6 h-6 text-white/20" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black leading-tight">{currentEx.name}</h2>
                  <p className="text-[11px] text-primary font-bold uppercase tracking-widest mt-1">
                    {currentEx.sets} · {currentEx.reps} · {currentEx.rest}
                  </p>
                </div>
              </div>

              {/* Bolhas de Séries */}
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: setsMax }).map((_, i) => (
                  <div key={i} className={`w-9 h-9 rounded-full border-2 flex items-center justify-center font-black text-sm transition-all ${doneSets[i] ? "bg-green-500 border-green-500 text-black" : i === doneSets.length ? "border-primary text-primary scale-110" : "border-white/10 text-white/20"}`}>
                    {doneSets[i] ? <Check className="w-5 h-5" strokeWidth={3} /> : i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Timer + Inputs */}
            <div className="bg-neutral-900 rounded-3xl p-5 border border-white/5 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-[9px] uppercase font-black text-white/30 tracking-[0.2em]">{restRunning ? "Descanso em curso" : `Série ${doneSets.length + 1} de ${setsMax}`}</p>
                <h3 className="text-6xl font-black tabular-nums tracking-tighter">{fmtMMSS(restElapsed)}</h3>
                {restRunning && (
                  <div className="flex justify-center gap-2 mt-2">
                    <Button onClick={() => setRestSegStartedAt(null)} variant="secondary" size="sm" className="rounded-full h-8 px-4 text-[10px] font-bold uppercase">Pausar</Button>
                    <Button onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }} size="sm" className="rounded-full h-8 px-4 text-[10px] font-bold uppercase">Pular</Button>
                  </div>
                )}
              </div>

              {!todasFeitas && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <div className="flex gap-3">
                    <NumericField label="Carga" unit="kg" value={activeWeight} suggestedValue={0} onChange={setActiveWeight} />
                    <NumericField label="Reps" unit="reps" value={activeReps} suggestedValue={0} onChange={setActiveReps} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {EFFORT_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => handleFizASerie(opt.value)} className="flex flex-col items-center py-3 rounded-2xl border-2 transition-all active:scale-95" style={{ borderColor: opt.color, backgroundColor: opt.bg, color: opt.color }}>
                        <span className="text-xl">{opt.emoji}</span>
                        <span className="text-[10px] font-black uppercase mt-1">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Navegação Inferior */}
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0} className="flex-1 h-12 rounded-2xl font-bold text-white/40">Anterior</Button>
              <Button onClick={() => currentExIdx === exercises.length - 1 ? setPhase("conclusion") : setCurrentExIdx(i => i + 1)} className="flex-[2] h-12 rounded-2xl font-black gap-2">
                {currentExIdx === exercises.length - 1 ? "Finalizar Treino" : "Próximo"}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modal da GIF Expandida */}
      <Dialog open={showGifDialog} onOpenChange={setShowGifDialog}>
        <DialogContent className="max-w-sm p-2 bg-black border-white/10 rounded-3xl overflow-hidden">
          {gifUrl && <img src={gifUrl} alt="Execução" className="w-full h-auto rounded-2xl" />}
          <div className="p-4 text-center">
            <h3 className="font-black text-lg">{currentEx?.name}</h3>
            <Button onClick={() => setShowGifDialog(false)} variant="secondary" className="w-full mt-4 rounded-xl font-bold">Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
