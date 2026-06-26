// src/components/student/WorkoutMode.tsx
// Modo Treino com logbook de cargas, "Última vez", percepção de esforço
// e perguntas de conclusão (Sprint 1 + Sprint 2)

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Pause, RotateCcw, Check, SkipForward,
  Flame, Share2, ChevronLeft, ChevronRight,
  Minus, Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import WorkoutShareCard from "./WorkoutShareCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import type { ExerciseHistory } from "@/lib/workoutTypes";
import { effortLabel } from "@/lib/workoutTypes";

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

interface Exercise {
  name: string;
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  notes?: string;
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
  coachName?: string;
  teamName?: string;
  initialDay?: string;
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

const EFFORT_OPTIONS: { value: 1 | 2 | 3; label: string; color: string; bg: string }[] = [
  { value: 1, label: "Limpo",  color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
  { value: 2, label: "Pesado", color: GOLD,      bg: "rgba(201,168,76,0.12)" },
  { value: 3, label: "Falhei", color: "#CC0000", bg: "rgba(204,0,0,0.12)"   },
];

const FEELING_OPTIONS: { value: 1 | 2 | 3; emoji: string; label: string }[] = [
  { value: 1, emoji: "😓", label: "Pesado" },
  { value: 2, emoji: "😊", label: "Bom"    },
  { value: 3, emoji: "💪", label: "Top"    },
];

const SLEEP_OPTIONS: { value: 1 | 2 | 3; emoji: string; label: string }[] = [
  { value: 1, emoji: "😴", label: "Mal"    },
  { value: 2, emoji: "😊", label: "Normal" },
  { value: 3, emoji: "🌙", label: "Bem"    },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function parseSetsMax(s?: string): number {
  if (!s) return 3;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 3;
  return Math.max(1, Math.max(...nums.map(Number)));
}
function parseSetsMin(s?: string): number {
  if (!s) return 3;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 3;
  return Math.max(1, Math.min(...nums.map(Number)));
}
function parseSetsLabel(s?: string): string {
  if (!s) return "3";
  const nums = String(s).match(/\d+/g);
  if (!nums) return "3";
  const mn = Math.min(...nums.map(Number));
  const mx = Math.max(...nums.map(Number));
  return mn === mx ? String(mn) : `${mn} a ${mx}`;
}
function parseRepsLabel(s?: string): string {
  if (!s) return "—";
  const nums = String(s).match(/\d+/g);
  if (!nums) return s;
  const mn = Math.min(...nums.map(Number));
  const mx = Math.max(...nums.map(Number));
  return mn === mx ? String(mn) : `${mn} a ${mx}`;
}
function parseRestSec(rest?: string): number {
  if (!rest) return 60;
  const str = rest.toLowerCase();
  const m = str.match(/(\d+)\s*(min|m|s|seg)?/);
  if (!m) return 60;
  const n = parseInt(m[1], 10);
  if (m[2] && m[2].startsWith("m")) return n * 60;
  return n;
}
function fmtMMSS(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short",
  });
}

/* ── Estado de série por exercício ──────────────────────────────────────────── */

interface SetData {
  weight: number;
  reps: number;
  effort?: 1 | 2 | 3;
  done: boolean;
}

/* ── Componente principal ───────────────────────────────────────────────────── */

type Phase = "training" | "conclusion";

export default function WorkoutMode({
  workouts,
  userId,
  coachName,
  teamName,
  initialDay,
  periodization,
  onClose,
}: Props) {
  const confirm = useConfirm();
  const session = useWorkoutSession();

  const storageKey = `workout_session_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks =
    periodization?.weeks && periodization.weeks.length === 4
      ? periodization.weeks
      : DEFAULT_WEEKS;

  // ── Lê estado persistido do localStorage (antes dos useState) ─────────────
  const _saved = (() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { return null; }
  })();

  // ── Estado core ────────────────────────────────────────────────────────────
  const [selectedDay] = useState<string>(initialDay ?? workouts[0]?.key ?? "");
  const [activeWeek, setActiveWeek]     = useState<number>(_saved?.activeWeek ?? 0);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [phase, setPhase]               = useState<Phase>("training");

  // mapa: exKey → array de SetData por série (indexed 0..N-1)
  const [setDataMap, setSetDataMap] = useState<Record<string, SetData[]>>(_saved?.setDataMap ?? {});

  // conclusão
  const [generalFeeling, setGeneralFeeling] = useState<1 | 2 | 3 | undefined>();
  const [sleepQuality, setSleepQuality]     = useState<1 | 2 | 3 | undefined>();
  const [showShare, setShowShare]           = useState(false);
  const [shareMode, setShareMode]           = useState<"final" | "partial">("final");

  // controle legado (compatibilidade com WorkoutShareCard)
  const [completed, setCompleted] = useState<Record<string, number[]>>(_saved?.completed ?? {});
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow]             = useState(Date.now());

  // histórico do banco
  const [historyMap, setHistoryMap] = useState<Record<string, ExerciseHistory[]>>({});

  // ── Persiste estado continuamente no localStorage ──────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ activeWeek, completed, setDataMap }));
    } catch { /* quota exceeded — ignora */ }
  }, [activeWeek, completed, setDataMap, storageKey]);

  // ── Timer global ───────────────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  // ── Resolve exercícios do dia com overrides de periodização ────────────────
  const day = workouts.find((d) => d.key === selectedDay) ?? workouts[0];

  const exercises: Exercise[] = (day?.exercises ?? []).map((ex, idx) => {
    if (!isPeriodizationOn) return ex;
    const weekOverrides = periodization?.overrides?.[String(activeWeek)] ?? {};
    const override = weekOverrides[`${day!.key}_${idx}`] ?? {};
    const wm = weeks[activeWeek];
    return {
      ...ex,
      sets:    override.sets    ?? wm.sets    ?? ex.sets,
      reps:    override.reps    ?? wm.reps    ?? ex.reps,
      rest:    override.rest    ?? wm.rest    ?? ex.rest,
      cadence: override.cadence ?? wm.cadence ?? ex.cadence,
      notes:   override.notes   ?? ex.notes,
      name:    override.name    ?? ex.name,
    };
  });

  const currentEx     = exercises[currentExIdx];
  const currentExKey  = day ? `${day.key}::${currentExIdx}` : "";
  const setsMax       = parseSetsMax(currentEx?.sets);
  const setsMin       = parseSetsMin(currentEx?.sets);
  const defaultRestSec = parseRestSec(currentEx?.rest);

  // ── Inicialização do setDataMap para o exercício atual ─────────────────────
  useEffect(() => {
    if (!currentEx) return;
    setSetDataMap((prev) => {
      if (prev[currentExKey]) return prev;
      return {
        ...prev,
        [currentExKey]: Array.from({ length: setsMax }, () => ({
          weight: 0,
          reps:   0,
          done:   false,
        })),
      };
    });
  }, [currentExKey, setsMax, currentEx]);

  // ── Inicia sessão no banco na primeira montagem ────────────────────────────
  useEffect(() => {
    setStartedAt(Date.now());
    session.startSession({
      userId,
      workoutKey:   day?.key ?? "A",
      workoutLabel: day?.focus ?? undefined,
      periodizationWeek: isPeriodizationOn ? activeWeek + 1 : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Busca histórico dos exercícios ─────────────────────────────────────────
  useEffect(() => {
    if (!userId || exercises.length === 0) return;
    exercises.forEach((ex) => {
      const key = `${day?.key}::${exercises.indexOf(ex)}`;
      if (historyMap[key]) return;
      session.getExerciseHistory(ex.name, 3).then((history) => {
        if (history.length > 0) {
          setHistoryMap((prev) => ({ ...prev, [key]: history }));
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.length, userId]);

  // ── Timer de descanso ──────────────────────────────────────────────────────
  const [restRemaining, setRestRemaining] = useState(defaultRestSec);
  const [restRunning, setRestRunning]     = useState(false);
  const restRef = useRef<number | null>(null);

  useEffect(() => {
    setRestRemaining(defaultRestSec);
    setRestRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, activeWeek]);

  const advanceIfDone = useCallback(() => {
    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      if (arr.length >= setsMin) {
        setCurrentExIdx((i) => Math.min(i + 1, exercises.length - 1));
      }
      return prev;
    });
  }, [currentExKey, setsMin, exercises.length]);

  useEffect(() => {
    if (!restRunning) {
      if (restRef.current) window.clearInterval(restRef.current);
      return;
    }
    restRef.current = window.setInterval(() => {
      setRestRemaining((r) => {
        if (r <= 1) {
          setRestRunning(false);
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
          toast.success("⚡ Descansou! Hora da próxima série.");
          advanceIfDone();
          return 0;
        }
        // Vibração leve nos últimos 3s
        if (r <= 4 && navigator.vibrate) navigator.vibrate(50);
        return r - 1;
      });
    }, 1000);
    return () => { if (restRef.current) window.clearInterval(restRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRunning]);

  const skipRest = () => {
    if (restRef.current) window.clearInterval(restRef.current);
    setRestRunning(false);
    setRestRemaining(0);
    advanceIfDone();
  };

  // ── Handlers de carga ──────────────────────────────────────────────────────
  const currentSets    = setDataMap[currentExKey] ?? [];
  const doneSetsCount  = currentSets.filter((s) => s.done).length;
  const currentSetIdx  = doneSetsCount; // índice da próxima série a fazer
  const todasFeitas    = doneSetsCount >= setsMax;
  const serieAtualNum  = Math.min(doneSetsCount + 1, setsMax);

  // Pega o peso da última série feita (ou da série anterior) para pré-preencher
  const lastDoneWeight = currentSets.filter((s) => s.done).at(-1)?.weight ?? 0;

  // Peso exibido no campo da série atual: herda do histórico se 0
  const lastHistoryWeight = historyMap[currentExKey]?.[0]?.weightKg ?? 0;
  const defaultWeight = lastDoneWeight > 0 ? lastDoneWeight : lastHistoryWeight;

  const [activeWeight, setActiveWeight] = useState(0);
  const [activeReps, setActiveReps]     = useState(0);

  // Inicializa o campo de peso quando muda de exercício ou de série
  useEffect(() => {
    setActiveWeight(defaultWeight);
    setActiveReps(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, doneSetsCount]);

  const adjustWeight = (delta: number) => {
    setActiveWeight((w) => Math.max(0, Math.round((w + delta) * 2) / 2));
  };

  // ── Registrar série ────────────────────────────────────────────────────────
  const handleFizASerie = useCallback(
    async (effort?: 1 | 2 | 3) => {
      if (todasFeitas) return;

      const weight = activeWeight;
      const reps   = activeReps;

      // Atualiza UI imediatamente
      setSetDataMap((prev) => {
        const arr = [...(prev[currentExKey] ?? [])];
        if (arr[currentSetIdx]) {
          arr[currentSetIdx] = { weight, reps, effort, done: true };
        }
        return { ...prev, [currentExKey]: arr };
      });

      // Atualiza completed legado
      setCompleted((prev) => {
        const arr = prev[currentExKey] ?? [];
        if (arr.includes(currentSetIdx)) return prev;
        return { ...prev, [currentExKey]: [...arr, currentSetIdx] };
      });

      // Persiste no banco
      await session.registerSet({
        exerciseName:    currentEx?.name ?? "—",
        setNumber:       currentSetIdx + 1,
        weightKg:        weight > 0 ? weight : undefined,
        reps:            reps > 0 ? reps : undefined,
        repsTargetMin:   setsMin,
        repsTargetMax:   setsMax,
        perceivedEffort: effort,
        completed:       true,
      });

      // Inicia descanso
      setRestRemaining(defaultRestSec);
      setRestRunning(true);
    },
    [
      todasFeitas, activeWeight, activeReps, currentExKey,
      currentSetIdx, currentEx, setsMin, setsMax,
      defaultRestSec, session,
    ]
  );

  // ── Métricas gerais ─────────────────────────────────────────────────────────
  const totalSets = exercises.reduce((a, e) => a + parseSetsMin(e.sets), 0);
  const doneSets  = exercises.reduce((a, _, idx) => {
    const k = `${day!.key}::${idx}`;
    return a + (completed[k]?.length ?? 0);
  }, 0);
  const progressPct    = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const completedExCnt = exercises.reduce((a, _, idx) => {
    const k = `${day!.key}::${idx}`;
    return a + ((completed[k]?.length ?? 0) >= parseSetsMin(exercises[idx]?.sets) ? 1 : 0);
  }, 0);
  const hasAnyDone = doneSets > 0;

  // ── Concluir treino ─────────────────────────────────────────────────────────
  const handleConcluir = () => {
    setShareMode("final");
    setShowShare(true);
  };

  const handleSharedDone = async () => {
    await session.finishSession({
      generalFeeling,
      sleepQuality,
      periodizationWeek: isPeriodizationOn ? activeWeek + 1 : undefined,
    });
    try { localStorage.removeItem(storageKey); } catch { /* ignora */ }
    setShowShare(false);
    onClose();
  };

  const handleClose = async () => {
    if (
      hasAnyDone &&
      !(await confirm({
        title: "Sair do treino",
        description: "Sair do modo treino? Seu progresso fica salvo.",
        confirmLabel: "Sair",
      }))
    )
      return;
    onClose();
  };

  // ── Histórico do exercício atual ────────────────────────────────────────────
  const currentHistory = historyMap[currentExKey] ?? [];
  const lastSession    = currentHistory[0];

  // ── Render guard ────────────────────────────────────────────────────────────
  if (!day)
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Nenhum treino disponível.</p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    );

  /* ── FASE: TREINO ─────────────────────────────────────────────────────────── */
  if (phase === "training") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-32">

        {/* ── Header sticky ─────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 relative">
          {/* Barra de progresso dourada */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: GOLD }}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">
              Treino {day.key}{day.focus ? ` · ${day.focus}` : ""}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              <Flame className="w-3 h-3 inline -mt-0.5 mr-0.5 text-primary" />
              {fmtMMSS(elapsedSec)} em andamento
            </p>
          </div>
          <Badge className="bg-primary/15 text-primary border-primary/30 animate-pulse shrink-0">
            ATIVO
          </Badge>
        </header>

        <main className="max-w-2xl mx-auto p-4 space-y-4">

          {/* ── Seletor de semana ─────────────────────────────────────────── */}
          {isPeriodizationOn && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Semana atual
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {weeks.map((_w, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setActiveWeek(i); setRestRunning(false); }}
                    className={`py-2 rounded-lg text-[11px] font-bold border transition ${
                      activeWeek === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted/50"
                    }`}
                  >
                    S{i + 1}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(["sets", "reps", "rest", "cadence"] as const).map((k) => (
                  <div key={k} className="text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {k === "sets" ? "Séries" : k === "reps" ? "Reps" : k === "rest" ? "Descanso" : "Cadência"}
                    </p>
                    <p className="text-[11px] font-bold mt-0.5">{weeks[activeWeek][k] || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Anel de progresso ─────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-6 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1A1A1A, #0A0A0A)",
              border: `1px solid ${restRunning ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.08)"}`,
              transition: "border-color 0.4s ease",
            }}
          >
            {restRunning && (
              <div
                className="absolute inset-0 pointer-events-none animate-pulse"
                style={{ background: `radial-gradient(circle at 50% 30%, ${GOLD}14, transparent 70%)` }}
              />
            )}
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-bold mb-3 relative">
              {restRunning
                ? "descansando..."
                : todasFeitas
                ? "exercício completo!"
                : `série ${serieAtualNum} de ${setsMax}`}
            </p>
            <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
              <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
                <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                <circle
                  cx="100" cy="100" r="88" fill="none"
                  stroke={GOLD} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - progressPct / 100)}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  opacity={0.55}
                />
                <circle
                  cx="100" cy="100" r="74" fill="none"
                  stroke="#CC0000" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 74}
                  strokeDashoffset={
                    defaultRestSec > 0
                      ? 2 * Math.PI * 74 * (1 - (defaultRestSec - restRemaining) / defaultRestSec)
                      : 2 * Math.PI * 74
                  }
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                  opacity={restRunning ? 1 : 0.25}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-5xl font-black text-white tabular-nums leading-none">
                  {fmtMMSS(restRemaining)}
                </p>
                <p className="text-[10px] text-white/40 font-bold mt-1">{progressPct}% do treino</p>
              </div>
            </div>
            <p className="text-sm text-white/60 mb-5 mt-3 truncate px-4 relative">{currentEx?.name ?? ""}</p>
            <div className="flex items-center justify-center gap-2 relative">
              {!restRunning ? (
                <motion.button
                  type="button"
                  disabled={todasFeitas}
                  onClick={() => handleFizASerie()}
                  whileTap={{ scale: 0.94 }}
                  style={{ backgroundColor: todasFeitas ? "#374151" : "#CC0000" }}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white font-bold text-sm disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {todasFeitas ? "Séries concluídas" : "Fiz a série → descansar"}
                </motion.button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRestRunning(false)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                  >
                    <Pause className="w-4 h-4" /> Pausar
                  </button>
                  <motion.button
                    type="button"
                    onClick={skipRest}
                    whileTap={{ scale: 0.94 }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm"
                    style={{ backgroundColor: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}55` }}
                  >
                    <SkipForward className="w-4 h-4" /> Pular
                  </motion.button>
                </>
              )}
              <button
                type="button"
                onClick={() => { setRestRunning(false); setRestRemaining(defaultRestSec); }}
                className="flex items-center gap-2 px-3 py-2.5 rounded-full text-sm"
                style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)" }}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Card exercício atual ──────────────────────────────────────── */}
          {currentEx && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentExKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-4 space-y-4"
                style={{
                  background: "#111",
                  border: "1px solid rgba(204,0,0,0.35)",
                }}
              >
                {/* Nome + progresso */}
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold text-base leading-tight flex-1">{currentEx.name}</h2>
                  <span className="text-xs text-white/40 shrink-0 mt-0.5">
                    {doneSetsCount} / {setsMax} séries
                  </span>
                </div>

                {/* ── Card "Última vez" (Sprint 2) ── */}
                {lastSession && (
                  <div
                    className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
                    style={{ background: "rgba(201,168,76,0.07)", border: `1px solid ${GOLD}33` }}
                  >
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold" style={{ color: GOLD }}>
                        Última vez · {fmtDate(lastSession.executedAt)}
                      </p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {lastSession.weightKg > 0 ? `${lastSession.weightKg}kg` : "Peso corporal"}
                        {lastSession.reps > 0 ? ` × ${lastSession.reps} reps` : ""}
                        {lastSession.perceivedEffort && (
                          <span className="text-white/50 font-normal text-xs ml-1.5">
                            · {effortLabel(lastSession.perceivedEffort as 1|2|3)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Bolhas de série ── */}
                <div className="flex gap-2.5 flex-wrap">
                  {Array.from({ length: setsMax }).map((_, i) => {
                    const setInfo   = currentSets[i];
                    const isDone    = setInfo?.done ?? false;
                    const isCurrent = !isDone && i === doneSetsCount;
                    return (
                      <motion.button
                        key={i}
                        type="button"
                        animate={isDone ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        onClick={() => {
                          if (isDone) {
                            // Toggle para corrigir manualmente
                            setSetDataMap((prev) => {
                              const arr = [...(prev[currentExKey] ?? [])];
                              if (arr[i]) arr[i] = { ...arr[i], done: false };
                              return { ...prev, [currentExKey]: arr };
                            });
                            setCompleted((prev) => ({
                              ...prev,
                              [currentExKey]: (prev[currentExKey] ?? []).filter((n) => n !== i),
                            }));
                          }
                        }}
                        style={
                          isDone
                            ? { background: "#22c55e", borderColor: "#22c55e", color: "#fff" }
                            : isCurrent
                            ? { background: "rgba(204,0,0,0.15)", borderColor: "#CC0000", color: "#CC0000" }
                            : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }
                        }
                        className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm border-2 ${isCurrent ? "animate-pulse" : ""}`}
                      >
                        {isDone ? <Check className="w-4 h-4" /> : i + 1}
                      </motion.button>
                    );
                  })}
                </div>

                {/* ── Campo de carga (Sprint 1) ── */}
                {!todasFeitas && (
                  <div
                    className="rounded-lg p-3 space-y-3"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">
                      Registrar série {serieAtualNum}
                    </p>

                    {/* Carga */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/50 w-10">Carga</span>
                      <button
                        type="button"
                        onClick={() => adjustWeight(-2.5)}
                        className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 text-white/70"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-2xl font-black text-white tabular-nums">
                          {activeWeight > 0 ? activeWeight : "—"}
                        </span>
                        <span className="text-white/50 text-sm ml-1">kg</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => adjustWeight(2.5)}
                        className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 text-white/70"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Reps */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/50 w-10">Reps</span>
                      <button
                        type="button"
                        onClick={() => setActiveReps((r) => Math.max(0, r - 1))}
                        className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 text-white/70"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-2xl font-black text-white tabular-nums">
                          {activeReps > 0 ? activeReps : "—"}
                        </span>
                        <span className="text-white/50 text-xs ml-1">reps</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveReps((r) => r + 1)}
                        className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 text-white/70"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Percepção de esforço (Sprint 2) */}
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold mb-2">
                        Como foi?
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {EFFORT_OPTIONS.map((opt) => (
                          <motion.button
                            key={opt.value}
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            onClick={() => handleFizASerie(opt.value)}
                            className="py-2 rounded-lg text-sm font-bold border transition"
                            style={{
                              background: opt.bg,
                              borderColor: opt.color + "66",
                              color: opt.color,
                            }}
                          >
                            {opt.label}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Info: reps alvo + descanso + cadência ── */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Reps alvo</p>
                    <p className="text-sm font-bold mt-0.5 text-white">{parseRepsLabel(currentEx.reps)}</p>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Séries</p>
                    <p className="text-sm font-bold mt-0.5 text-white">{parseSetsLabel(currentEx.sets)}</p>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Descanso</p>
                    <p className="text-sm font-bold mt-0.5 text-white">{currentEx.rest ?? "—"}</p>
                  </div>
                </div>

                {/* Notas */}
                {currentEx.notes && (
                  <p
                    className="text-xs text-white/60 italic p-3 rounded-lg"
                    style={{ background: "rgba(204,0,0,0.06)", borderLeft: "3px solid rgba(204,0,0,0.6)" }}
                  >
                    {currentEx.notes}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── Navegação entre exercícios ────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              disabled={currentExIdx === 0}
              onClick={() => {
                setCurrentExIdx((i) => Math.max(0, i - 1));
                setRestRunning(false);
              }}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1"
              disabled={currentExIdx >= exercises.length - 1}
              onClick={() => {
                setCurrentExIdx((i) => Math.min(i + 1, exercises.length - 1));
                setRestRunning(false);
              }}
            >
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* ── Lista de exercícios com mini-dots ─────────────────────────── */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-1">
              Exercícios do treino
            </p>
            {exercises.map((ex, idx) => {
              const k        = `${day!.key}::${idx}`;
              const done     = (completed[k]?.length ?? 0) >= parseSetsMin(ex.sets);
              const isCurrent = idx === currentExIdx;
              const exDone   = completed[k]?.length ?? 0;
              const exMax    = parseSetsMax(ex.sets);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentExIdx(idx);
                    setRestRunning(false);
                    setRestRemaining(parseRestSec(ex.rest));
                  }}
                  className={`flex items-center gap-3 bg-card border rounded-xl p-3 cursor-pointer transition-all ${
                    isCurrent
                      ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]"
                      : "border-border"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    done ? "bg-primary border-primary text-primary-foreground" : "border-border"
                  }`}>
                    {done && <Check className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm truncate ${done ? "line-through text-muted-foreground" : ""}`}>
                      {ex.name}
                    </p>
                    <div className="flex items-center gap-1 mt-1.5">
                      {Array.from({ length: exMax }).map((_, si) => (
                        <span
                          key={si}
                          className="rounded-full transition-all"
                          style={{
                            width: si < exDone ? "8px" : "6px",
                            height: si < exDone ? "8px" : "6px",
                            backgroundColor:
                              si < exDone
                                ? "#22c55e"
                                : isCurrent && si === exDone
                                ? "#CC0000"
                                : "rgba(255,255,255,0.15)",
                          }}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">{ex.reps ?? "—"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Resumo ─────────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-primary" />
              {doneSets}/{totalSets} séries · {completedExCnt}/{exercises.length} exercícios
            </p>
            <p className="text-sm font-black" style={{ color: GOLD }}>{progressPct}%</p>
          </div>
        </main>

        {/* ── Footer: Concluir ─────────────────────────────────────────────── */}
        {hasAnyDone && (
          <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
            <div className="max-w-2xl mx-auto flex items-center gap-2">
              <Button
                type="button"
                onClick={() => setPhase("conclusion")}
                className="flex-1 h-12 text-base font-bold rounded-2xl"
                style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}
              >
                🏆 Concluir treino
              </Button>
              {completedExCnt >= 1 && completedExCnt < exercises.length && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setShareMode("partial"); setShowShare(true); }}
                  className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center"
                  style={{ background: `${GOLD}1A`, border: `1px solid ${GOLD}55`, color: GOLD }}
                >
                  <Share2 className="w-5 h-5" />
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* Share parcial */}
        {showShare && shareMode === "partial" && (
          <WorkoutShareCard
            workoutName={`${day.key}${day.focus ? ` · ${day.focus}` : ""}`}
            durationSec={elapsedSec}
            totalSets={doneSets}
            completedExercises={completedExCnt}
            totalExercises={exercises.length}
            coachName={coachName}
            teamName={teamName}
            weekLabel={isPeriodizationOn ? weeks[activeWeek]?.label : undefined}
            isPartial
            onClose={() => setShowShare(false)}
          />
        )}
      </div>
    );
  }

  /* ── FASE: CONCLUSÃO ─────────────────────────────────────────────────────── */
  // Destaques de cargas para mostrar na conclusão
  const highlights: { name: string; note: string }[] = exercises
    .map((ex, idx) => {
      const k    = `${day!.key}::${idx}`;
      const sets = setDataMap[k] ?? [];
      const best = sets.filter((s) => s.done && s.weight > 0);
      if (!best.length) return null;
      const maxWeight = Math.max(...best.map((s) => s.weight));
      const hist      = historyMap[k]?.[0];
      const delta     = hist?.weightKg ? maxWeight - hist.weightKg : 0;
      return {
        name: ex.name,
        note:
          delta > 0
            ? `${maxWeight}kg (+${delta}kg)`
            : delta === 0
            ? `${maxWeight}kg — manteve`
            : `${maxWeight}kg`,
      };
    })
    .filter(Boolean) as { name: string; note: string }[];

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <main className="max-w-md mx-auto px-4 py-12 flex flex-col items-center gap-6 text-center">

        {/* Troféu */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 10 }}
          className="text-6xl"
        >
          🏆
        </motion.div>

        <div>
          <h1 className="text-2xl font-black text-foreground">Treino Concluído!</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Treino {day.key}{day.focus ? ` · ${day.focus}` : ""} · {fmtMMSS(elapsedSec)}
          </p>
        </div>

        {/* Destaques */}
        {highlights.length > 0 && (
          <div
            className="w-full rounded-xl p-4 space-y-2 text-left"
            style={{ background: `${GOLD}0F`, border: `1px solid ${GOLD}33` }}
          >
            <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
              Destaques
            </p>
            {highlights.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground/80 truncate flex-1">{h.name}</span>
                <span className="text-sm font-bold text-foreground shrink-0">{h.note}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pergunta 1: Como foi o treino? */}
        <div className="w-full space-y-3">
          <p className="font-semibold text-foreground">Como foi o treino?</p>
          <div className="grid grid-cols-3 gap-3">
            {FEELING_OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => setGeneralFeeling(opt.value)}
                className="py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition"
                style={
                  generalFeeling === opt.value
                    ? { borderColor: GOLD, background: `${GOLD}15` }
                    : { borderColor: "rgba(255,255,255,0.12)", background: "transparent" }
                }
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-bold text-foreground">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Pergunta 2: Como dormiu? */}
        <div className="w-full space-y-3">
          <p className="font-semibold text-foreground">Como você dormiu ontem?</p>
          <div className="grid grid-cols-3 gap-3">
            {SLEEP_OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => setSleepQuality(opt.value)}
                className="py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition"
                style={
                  sleepQuality === opt.value
                    ? { borderColor: "#60a5fa", background: "rgba(96,165,250,0.10)" }
                    : { borderColor: "rgba(255,255,255,0.12)", background: "transparent" }
                }
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-bold text-foreground">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Próximo treino */}
        <div
          className="w-full rounded-xl p-3 text-left"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Próximo treino</p>
          <p className="font-bold text-sm text-foreground mt-0.5">
            Treino {
              (() => {
                const keys = workouts.map((w) => w.key);
                const idx  = keys.indexOf(day.key ?? "");
                const next = keys[(idx + 1) % keys.length];
                const nextDay = workouts.find((w) => w.key === next);
                return `${next}${nextDay?.focus ? ` · ${nextDay.focus}` : ""}`;
              })()
            }
          </p>
        </div>

        {/* Botões */}
        <div className="w-full flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => { setShareMode("final"); setShowShare(true); }}
          >
            <Share2 className="w-4 h-4" /> Compartilhar
          </Button>
          <Button
            type="button"
            className="flex-1 font-bold"
            style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}
            onClick={handleSharedDone}
          >
            Fechar
          </Button>
        </div>
      </main>

      {showShare && shareMode === "final" && (
        <WorkoutShareCard
          workoutName={`${day.key}${day.focus ? ` · ${day.focus}` : ""}`}
          durationSec={elapsedSec}
          totalSets={doneSets}
          completedExercises={completedExCnt}
          totalExercises={exercises.length}
          coachName={coachName}
          teamName={teamName}
          weekLabel={isPeriodizationOn ? weeks[activeWeek]?.label : undefined}
          isPartial={false}
          onClose={handleSharedDone}
        />
      )}
    </div>
  );
}
