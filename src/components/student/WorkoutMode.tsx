// src/components/student/WorkoutMode.tsx
// Modo Treino — Otimizado para UX, Retenção e Dopamina (Sprint 6)

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
  TrendingUp,
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
import { effortLabel, toExerciseKey } from "@/lib/workoutTypes";
import { useLoadProgression } from "@/hooks/useLoadProgression";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { CompactWeekSelector } from "./CompactWeekSelector";

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

interface Exercise {
  name: string;
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  notes?: string;
  gifKey?: string;
}
interface WorkoutDay {
  key: string;
  focus?: string;
  exercises?: Exercise[];
}
interface WeekMeta {
  label: string;
  sets: string;
  reps: string;
  rest: string;
  cadence: string;
}
interface Periodization {
  enabled?: boolean;
  weeks?: WeekMeta[];
  overrides?: Record<string, Record<string, Partial<Exercise>>>;
}
interface Props {
  workouts: WorkoutDay[];
  userId: string;
  coachId?: string;
  coachName?: string;
  teamName?: string;
  initialDay?: string;
  initialWeek?: number;
  periodization?: Periodization;
  onClose: () => void;
}

/* ── Constantes ─────────────────────────────────────────────────────────────── */

const GOLD = "#C9A84C";
const DEFAULT_WEEKS: WeekMeta[] = [
  { label: "Semana 1 — Carga Máxima",            sets: "4 a 5 séries", reps: "5 a 8 reps",   rest: "2 min",     cadence: "1s conc / 2s exc" },
  { label: "Semana 2 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 3 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 4 — Estresse Metabólico",     sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30s a 45s", cadence: "1s conc / 1s exc" },
];

const EFFORT_OPTIONS: {
  value: 1 | 2 | 3;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  emoji: string;
}[] = [
  { value: 1, label: "Limpo",  sublabel: "RIR 3+",  color: "#22c55e", bg: "rgba(34,197,94,0.14)",  emoji: "✅" },
  { value: 2, label: "Pesado", sublabel: "RIR 1-2", color: GOLD,      bg: "rgba(201,168,76,0.14)", emoji: "🔥" },
  { value: 3, label: "Falhei", sublabel: "Falha",   color: "#CC0000", bg: "rgba(204,0,0,0.14)",    emoji: "💀" },
];

/* ── Partículas de recompensa ── */
const PARTICLES = Array.from({ length: 8 }, (_, i) => i);
const BurstParticles = memo(function BurstParticles({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {PARTICLES.map((i) => {
        const angle = (i / PARTICLES.length) * 360;
        const rad   = (angle * Math.PI) / 180;
        const dx    = Math.cos(rad) * 28;
        const dy    = Math.sin(rad) * 28;
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: dx, y: dy, opacity: 0, scale: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            style={{ position: "absolute", width: 6, height: 6, borderRadius: "50%", backgroundColor: color }}
          />
        );
      })}
    </div>
  );
});

/* ── Beep sonoro & Som de Vitória ── */
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
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "end") {
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.16);
      osc.frequency.setValueAtTime(880, now + 0.22);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.24);
      gain.gain.linearRampToValueAtTime(0, now + 0.38);
      osc.start(now); osc.stop(now + 0.4);
    } else {
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now); osc.stop(now + 0.16);
    }
  } catch {}
}

function playVictorySound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const notes = [262, 330, 392, 523]; // C4, E4, G4, C5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.3);
      osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.4);
    });
  } catch {}
}

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
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/* ── NumericField Component ── */
interface NumericFieldProps {
  label: string; unit: string; value: number; suggestedValue: number;
  onChange: (val: number) => void; onUserEdited?: () => void; accent?: boolean;
}
const NumericField = memo(function NumericField({
  label, unit, value, suggestedValue, onChange, onUserEdited, accent = false,
}: NumericFieldProps) {
  const [touched, setTouched] = useState(false);
  const isSuggested = !touched && value === suggestedValue && suggestedValue > 0;
  const displayVal  = value > 0 ? String(value) : "";
  return (
    <div className="flex-1 flex flex-col gap-1.5">
      <label className="text-[9px] uppercase tracking-[0.18em] font-bold" style={{ color: accent ? GOLD : "rgba(255,255,255,0.4)" }}>
        {label} {isSuggested && <span className="ml-1.5 text-[8px] normal-case" style={{ color: GOLD + "aa" }}>sugerido</span>}
      </label>
      <div className="flex items-center rounded-xl overflow-hidden transition-all" style={{
        border: isSuggested ? `1.5px solid ${GOLD}cc` : accent ? `1.5px solid ${GOLD}66` : "1.5px solid rgba(255,255,255,0.12)",
        background: isSuggested ? `${GOLD}0A` : "rgba(255,255,255,0.05)", minHeight: "64px"
      }}>
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={displayVal} placeholder={String(suggestedValue || 0)}
          onChange={(e) => {
            const val = parseFloat(e.target.value.replace(/[^0-9.]/g, ""));
            setTouched(true); onUserEdited?.(); onChange(isNaN(val) ? 0 : val);
          }}
          onFocus={() => !touched && suggestedValue > 0 && setTouched(true)}
          className="flex-1 bg-transparent text-center text-3xl font-black text-white py-3 outline-none w-0 min-w-0 tabular-nums"
        />
        <span className="pr-3 text-sm font-semibold text-white/30">{unit}</span>
      </div>
    </div>
  );
});

/* ── Main Component ── */
type Phase = "training" | "conclusion";
interface SetData { weight: number; reps: number; effort?: 1 | 2 | 3; done: boolean; skipped: boolean; }

export default function WorkoutMode({
  workouts, userId, coachId, coachName, teamName, initialDay, initialWeek, periodization, onClose,
}: Props) {
  const confirm = useConfirm();
  const session = useWorkoutSession();
  const storageKey = `workout_session_${userId}_${initialDay ?? workouts[0]?.key ?? "A"}`;
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks = periodization?.weeks?.length === 4 ? periodization.weeks : DEFAULT_WEEKS;

  const _saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { return null; } })();

  const [activeWeek, setActiveWeek] = useState<number>(_saved?.activeWeek ?? initialWeek ?? 0);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("training");
  const [setDataMap, setSetDataMap] = useState<Record<string, SetData[]>>(_saved?.setDataMap ?? {});
  const [completed, setCompleted] = useState<Record<string, number[]>>(_saved?.completed ?? {});
  const [startedAt, setStartedAt] = useState<number>(_saved?.startedAt ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [historyMap, setHistoryMap] = useState<Record<string, ExerciseHistory[]>>({});
  const [burstKey, setBurstKey] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "conclusion") playVictorySound();
  }, [phase]);

  // Fetch Streak
  useEffect(() => {
    const fetchStreak = async () => {
      const { data } = await supabase.from("workout_sessions").select("started_at").eq("user_id", userId).order("started_at", { ascending: false }).limit(30);
      if (!data) return;
      let s = 0; let last = new Date(); last.setHours(0,0,0,0);
      for (const sess of data) {
        const d = new Date(sess.started_at); d.setHours(0,0,0,0);
        const diff = Math.floor((last.getTime() - d.getTime()) / 86400000);
        if (diff === 0) continue;
        if (diff === 1) { s++; last = d; } else break;
      }
      setStreak(s);
    };
    fetchStreak();
  }, [userId]);

  const elapsedSec = Math.floor((now - startedAt) / 1000);
  const day = workouts.find(d => d.key === (initialDay ?? workouts[0]?.key)) ?? workouts[0];
  const exercises = (day?.exercises ?? []).map((ex, idx) => {
    if (!isPeriodizationOn) return ex;
    const override = periodization?.overrides?.[String(activeWeek)]?.[`${day!.key}_${idx}`] ?? {};
    const wm = weeks[activeWeek];
    return { ...ex, sets: override.sets ?? wm.sets ?? ex.sets, reps: override.reps ?? wm.reps ?? ex.reps, rest: override.rest ?? wm.rest ?? ex.rest, cadence: override.cadence ?? wm.cadence ?? ex.cadence };
  });

  const currentEx = exercises[currentExIdx];
  const gifUrl = useExerciseGif(currentEx?.name, currentEx?.gifKey);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const currentExKey = `${day?.key}::${currentExIdx}`;
  const setsMax = parseSetsMax(currentEx?.sets);
  const setsMin = parseSetsMin(currentEx?.sets);
  const restRange = parseRestRange(currentEx?.rest);

  // Resume/Start Session
  useEffect(() => {
    const init = async () => {
      if (_saved?.sessionId) {
        session.resumeSession({ sessionId: _saved.sessionId, userId, workoutKey: day?.key ?? "A", startedAt: _saved.startedAt });
      } else {
        const active = await session.findActiveSession(userId, day?.key ?? "A");
        if (active) {
          setStartedAt(active.startedAt);
          session.resumeSession({ sessionId: active.sessionId, userId, workoutKey: day?.key ?? "A", startedAt: active.startedAt });
        } else {
          session.startSession({ userId, coachId, workoutKey: day?.key ?? "A", workoutLabel: day?.focus, periodizationWeek: isPeriodizationOn ? activeWeek + 1 : undefined });
        }
      }
    };
    init();
  }, []);

  // Timer logic
  const [restBaseSec, setRestBaseSec] = useState(_saved?.restBaseSec ?? 0);
  const [restSegStartedAt, setRestSegStartedAt] = useState<number | null>(_saved?.restSegStartedAt ?? null);
  const restElapsed = restBaseSec + (restSegStartedAt ? Math.floor((now - restSegStartedAt) / 1000) : 0);
  const restRunning = restSegStartedAt !== null;

  // Persist
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ activeWeek, completed, setDataMap, sessionId: session.sessionId, startedAt, restBaseSec, restSegStartedAt }));
  }, [activeWeek, completed, setDataMap, session.sessionId, startedAt, restBaseSec, restSegStartedAt]);

  const handleFizASerie = async (effort: 1 | 2 | 3) => {
    const currentSets = setDataMap[currentExKey] ?? [];
    const setIdx = currentSets.filter(s => s.done).length;
    if (setIdx >= setsMax) return;

    const weight = activeWeight;
    const reps = activeReps;

    const newSets = [...currentSets];
    newSets[setIdx] = { weight, reps, effort, done: true, skipped: false };
    setSetDataMap(prev => ({ ...prev, [currentExKey]: newSets }));
    setCompleted(prev => ({ ...prev, [currentExKey]: [...(prev[currentExKey] ?? []), setIdx] }));

    setBurstColor(effort === 1 ? "#22c55e" : effort === 2 ? GOLD : "#CC0000");
    setBurstKey(`${currentExKey}_${setIdx}_${Date.now()}`);
    
    setRestBaseSec(0);
    setRestSegStartedAt(Date.now());

    await session.registerSet({
      exerciseName: currentEx?.name ?? "—",
      setNumber: setIdx + 1,
      weightKg: weight,
      reps: reps,
      repsTargetMin: parseRepsMin(currentEx?.reps),
      repsTargetMax: parseRepsMax(currentEx?.reps),
      perceivedEffort: effort,
      completed: true,
    });
  };

  const handleClose = async () => {
    if (Object.keys(completed).length > 0 && !(await confirm({ title: "Sair do treino", description: "Seu progresso está salvo. Você pode retomar quando quiser.", confirmLabel: "Sair" }))) return;
    localStorage.setItem(`${storageKey}_paused_at`, new Date().toISOString());
    onClose();
  };

  const [activeWeight, setActiveWeight] = useState(0);
  const [activeReps, setActiveReps] = useState(0);
  const doneSets = (setDataMap[currentExKey] ?? []).filter(s => s.done);
  const serieAtualNum = Math.min(doneSets.length + 1, setsMax);
  const todasFeitas = doneSets.length >= setsMax;
  const progressPct = Math.round((Object.values(completed).flat().length / (exercises.reduce((acc, ex) => acc + parseSetsMin(ex.sets), 0))) * 100);

  if (phase === "conclusion") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col items-center p-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md text-center space-y-6 py-12">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-3xl font-black">Treino Concluído!</h1>
          <p className="text-muted-foreground">Você destruiu hoje. Consistência é a chave.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card p-4 rounded-2xl border border-border">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Duração</p>
              <p className="text-xl font-black">{fmtMMSS(elapsedSec)}</p>
            </div>
            <div className="bg-card p-4 rounded-2xl border border-border">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Sequência</p>
              <p className="text-xl font-black">{streak} dias 🔥</p>
            </div>
          </div>

          <Button onClick={() => setPhase("training")} variant="outline" className="w-full h-12 rounded-2xl">Voltar ao Treino</Button>
          <Button onClick={() => setShowShare(true)} className="w-full h-12 rounded-2xl gap-2">
            <Zap className="w-4 h-4" /> Compartilhar Resultado
          </Button>
          <Button onClick={onClose} variant="ghost" className="w-full">Fechar</Button>
        </motion.div>
        {showShare && (
          <WorkoutShareCard
            workoutName={day?.key ?? "Treino"}
            durationSec={elapsedSec}
            totalSets={Object.values(completed).flat().length}
            completedExercises={Object.keys(completed).length}
            totalExercises={exercises.length}
            coachName={coachName}
            teamName={teamName}
            streak={streak}
            coachId={coachId}
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-32">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex items-center gap-2 relative">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
          <motion.div className="h-full" style={{ background: GOLD }} animate={{ width: `${progressPct}%` }} />
        </div>
        <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm truncate">Treino {day?.key} {day?.focus && `· ${day.focus}`}</h1>
          <p className="text-[10px] text-white/40 flex items-center gap-1"><Flame className="w-2.5 h-2.5" /> {fmtMMSS(elapsedSec)}</p>
        </div>
        <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[9px]">ATIVO</Badge>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        <CompactWeekSelector isPeriodizationOn={isPeriodizationOn} weeks={weeks} activeWeek={activeWeek} onWeekChange={setActiveWeek} />

        <div className="rounded-2xl p-6 text-center bg-gradient-to-br from-neutral-900 to-black border border-white/5 relative overflow-hidden">
          {restRunning && <div className="absolute inset-0 bg-primary/5 animate-pulse" />}
          <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold mb-2">
            {todasFeitas ? "Exercício Completo!" : restRunning ? "Descansando..." : `Série ${serieAtualNum} de ${setsMax}`}
          </p>
          <h2 className="text-6xl font-black tabular-nums">{fmtMMSS(restElapsed)}</h2>
          {restRunning && (
            <div className="flex justify-center gap-2 mt-4">
              <Button onClick={() => setRestSegStartedAt(null)} size="sm" variant="secondary" className="rounded-full">Pausar</Button>
              <Button onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }} size="sm" className="rounded-full">Pular</Button>
            </div>
          )}
        </div>

        {currentEx && (
          <motion.div key={currentExKey} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-neutral-900 rounded-2xl p-4 border border-red-900/30 space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-bold">{currentEx.name}</h2>
              <span className="text-xs text-white/30">{doneSets.length}/{setsMax} séries</span>
            </div>

            <div className="flex gap-2">
              {Array.from({ length: setsMax }).map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs ${doneSets[i] ? "bg-green-500 border-green-500 text-black" : i === doneSets.length ? "border-primary text-primary" : "border-white/10 text-white/20"}`}>
                  {doneSets[i] ? <Check className="w-4 h-4" /> : i + 1}
                </div>
              ))}
            </div>

            {!todasFeitas && (
              <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
                <div className="grid grid-cols-2 gap-3">
                  <NumericField label="Carga" unit="kg" value={activeWeight} suggestedValue={0} onChange={setActiveWeight} accent />
                  <NumericField label="Reps" unit="reps" value={activeReps} suggestedValue={0} onChange={setActiveReps} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {EFFORT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleFizASerie(opt.value)} className="flex flex-col items-center py-3 rounded-xl border-2 transition-all active:scale-95" style={{ borderColor: opt.color, backgroundColor: opt.bg, color: opt.color }}>
                      <span className="text-xl">{opt.emoji}</span>
                      <span className="text-[10px] font-bold uppercase mt-1">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentExIdx(i => Math.max(0, i - 1))} disabled={currentExIdx === 0}>Anterior</Button>
              {todasFeitas ? (
                <Button size="sm" onClick={() => currentExIdx === exercises.length - 1 ? setPhase("conclusion") : setCurrentExIdx(i => i + 1)}>
                  {currentExIdx === exercises.length - 1 ? "Finalizar Treino" : "Próximo Exercício"}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setCurrentExIdx(i => Math.min(exercises.length - 1, i + 1))} disabled={currentExIdx === exercises.length - 1}>Pular</Button>
              )}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
