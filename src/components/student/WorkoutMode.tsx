// src/components/student/WorkoutMode.tsx
// Modo Treino — One-Click Logging (Sprint 5)
//
// MUDANÇAS vs Sprint 4:
//  1. Auto-preenchimento inteligente: carga/reps pré-carregados do último treino.
//     Aluno só edita se quiser superar — campo fica "sugerido" em vez de "vazio".
//  2. Micro-interação de série concluída: burst de partículas douradas + scale
//     bounce no contador + glow ring animado. Framer Motion apenas.
//  3. Micro-interação de treino concluído: trophy scale-in com spring + shimmer
//     no card de destaques.
//  4. Fatigue alerts: ao fim da sessão detecta ≥3 séries com effort=3 (overreaching)
//     ou sleep=1 + effort alto → insere linha em coach_fatigue_alerts.
//  5. Botão "Pular" de série adicionado (skipped=true no banco) para não gerar
//     dado fantasma de weight/reps zero.
//  6. Feedback visual de "Peso sugerido" distinguido visualmente do peso editado
//     (borda dourada pulsante se intocado).
//  7. GIF do exercício: thumbnail clicável ao lado do nome, abre em diálogo.
//  8. Recuperação robusta de sessão: se o localStorage estiver vazio/corrompido,
//     busca sessão ativa no Supabase e reconstrói o progresso a partir das séries
//     já salvas, evitando perda de dados e sessões duplicadas.
//  9. Registro de série com tratamento de erro: se a gravação no servidor falhar,
//     avisa o aluno que os dados ficaram salvos apenas no aparelho.

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
  Share2,
  ChevronLeft,
  ChevronRight,
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

/* ── Tipos ──────────────────────────────────────────────────────────────────── */

interface Exercise {
  name: string;
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  notes?: string;
  /** Chave exata da biblioteca de gifs, gravada pelo coach ao prescrever via combobox. */
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

const TUTORIAL_DATE_KEY = "wm_tutorial_date";
function getTodayISO(): string { return new Date().toISOString().slice(0, 10); }
function shouldShowTutorialToday(): boolean {
  try { return localStorage.getItem(TUTORIAL_DATE_KEY) !== getTodayISO(); } catch { return false; }
}
function markTutorialShownToday(): void {
  try { localStorage.setItem(TUTORIAL_DATE_KEY, getTodayISO()); } catch { /* noop */ }
}

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

const TUTORIAL_STEPS = [
  {
    title: "Carga pré-carregada",
    body: "O peso da última série já vem preenchido. Mude conforme sua progressão — economiza tempo entre séries.",
    emoji: "⚡",
  },
  {
    title: "Um toque, série registrada",
    body: "Limpo, Pesado ou Falhei. O toque já salva e inicia o descanso — sem etapa de confirmação.",
    emoji: "✅",
  },
  {
    title: "Aviso sonoro no fim do descanso",
    body: "Um beep avisa quando o tempo termina. Mantenha o app aberto durante o treino para não perder o aviso.",
    emoji: "🔔",
  },
];

/* ── Partículas de recompensa (Framer Motion, sem canvas) ───────────────────── */

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
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
});

/* ── Beep sonoro (Web Audio API — sem dependências novas) ──────────────────────
   Funciona em iOS e Android igual, desde que o app esteja em primeiro plano.
   Diferente de navigator.vibrate(), que o iOS bloqueia por completo. */

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    if (sharedAudioCtx.state === "suspended") {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/** Toca um beep curto. type "warn" = aviso (mínimo atingido), "end" = fim do descanso.
 *
 * ⚠️ Limitação conhecida: o AudioContext é suspenso pelo navegador quando o app
 * está em background (aba minimizada, celular bloqueado, outro app em foco).
 * O `useWakeLock` mantém a tela acesa durante o treino, mas não impede o usuário
 * de trocar de app. Para alertas em background considerar futuramente Notifications
 * API + Service Worker (push local agendado).
 */
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
      // Dois beeps curtos e firmes — sinaliza "pronto"
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.16);
      osc.frequency.setValueAtTime(880, now + 0.22);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.24);
      gain.gain.linearRampToValueAtTime(0, now + 0.38);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // Um beep curto e suave — aviso de mínimo atingido
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  } catch {
    // Silencioso: navegador sem suporte, política de autoplay, etc.
  }
}

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
function parseRepsDefault(s?: string): number {
  if (!s) return 0;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 0;
  // Retorna o valor médio do range como sugestão
  const mn = Math.min(...nums.map(Number));
  const mx = Math.max(...nums.map(Number));
  return Math.round((mn + mx) / 2);
}
function parseRestRange(rest?: string): { min: number; max: number } {
  if (!rest) return { min: 60, max: 90 };
  const str  = rest.toLowerCase();
  const nums = str.match(/\d+/g);
  if (!nums) return { min: 60, max: 90 };
  const toSec = (s: string, raw: string): number => {
    const n = parseInt(s, 10);
    // Se string tem "min" ou "m" (e não "ms"), converte
    if (/min|\bm\b/.test(raw) && n < 60) return n * 60;
    // Número sozinho: heurística — se ≤10 assume minutos
    if (nums.length === 1 && n <= 10 && !/seg|s\b/.test(raw)) return n * 60;
    return n;
  };
  if (nums.length >= 2) {
    const a = toSec(nums[0], str);
    const b = toSec(nums[1], str);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const v = toSec(nums[0], str);
  return { min: v, max: v };
}
// Compat: retorna o MÁXIMO para iniciar o timer
function parseRestSec(rest?: string): number {
  return parseRestRange(rest).max;
}
function fmtMMSS(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/* ── Estado de série ────────────────────────────────────────────────────────── */

interface SetData {
  weight: number;
  reps: number;
  effort?: 1 | 2 | 3;
  done: boolean;
  skipped: boolean;
}

/* ── Supabase cast helper ───────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* ── Disparo de alertas de fadiga ───────────────────────────────────────────── */

async function maybeFireFatigueAlerts({
  coachId,
  studentId,
  sessionId,
  setDataMap,
  sleepQuality,
}: {
  coachId: string | undefined;
  studentId: string;
  sessionId: string | null;
  setDataMap: Record<string, SetData[]>;
  sleepQuality: 1 | 2 | 3 | undefined;
}) {
  if (!coachId || !sessionId || sessionId.startsWith("local_")) return;

  // Conta total de séries com effort=3 (falha/RIR0)
  const allSets = Object.values(setDataMap).flat();
  const failedCount = allSets.filter((s) => s.done && s.effort === 3).length;
  const highEffortCount = allSets.filter((s) => s.done && (s.effort === 2 || s.effort === 3)).length;
  const totalDone = allSets.filter((s) => s.done).length;

  const alerts: {
    alert_type: string;
    severity: string;
    message: string;
    suggestion?: string;
    context: Record<string, unknown>;
  }[] = [];

  // Overreaching agudo: ≥3 falhas na mesma sessão
  if (failedCount >= 3) {
    alerts.push({
      alert_type: "overreaching",
      severity:   "critical",
      message:    `Aluno atingiu falha muscular em ${failedCount} séries nesta sessão — risco de overreaching agudo.`,
      suggestion: "Considere reduzir volume ou aumentar descanso nos próximos 2 treinos.",
      context:    { session_id: sessionId, failed_sets: failedCount, total_sets: totalDone },
    });
  } else if (failedCount >= 2) {
    alerts.push({
      alert_type: "high_rpe",
      severity:   "warning",
      message:    `Aluno chegou à falha em ${failedCount} séries — RPE elevado acumulado.`,
      suggestion: "Monitore a recuperação nas próximas sessões.",
      context:    { session_id: sessionId, failed_sets: failedCount, total_sets: totalDone },
    });
  }

  // Sono ruim + esforço alto: sinal de recuperação parasimpática insuficiente
  if (sleepQuality === 1 && highEffortCount >= 3) {
    alerts.push({
      alert_type: "poor_sleep",
      severity:   failedCount >= 2 ? "critical" : "warning",
      message:    `Aluno treinou com sono ruim e ${highEffortCount} séries de esforço elevado — janela de recuperação comprometida.`,
      suggestion: "Avalie reduzir intensidade na próxima sessão ou prescrever dia de deload.",
      context:    { session_id: sessionId, sleep_quality: 1, high_effort_sets: highEffortCount },
    });
  }

  if (alerts.length === 0) return;

  await sb.from("coach_fatigue_alerts").insert(
    alerts.map((a) => ({
      coach_id:   coachId,
      student_id: studentId,
      is_read:    false,
      ...a,
    }))
  );
}

/* ── Subcomponente: Coach Mark (1x/dia) ─────────────────────────────────────── */

interface CoachMarkProps { onDismiss: () => void; }

const CoachMark = memo(function CoachMark({ onDismiss }: CoachMarkProps) {
  const [step, setStep] = useState(0);
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const current = TUTORIAL_STEPS[step];

  const handleDismiss = useCallback(() => {
    markTutorialShownToday();
    onDismiss();
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-md mx-4 mb-6 rounded-2xl p-6 space-y-4"
        style={{ background: "#1C1C1E", border: `1px solid ${GOLD}44`, boxShadow: `0 0 0 1px ${GOLD}22, 0 24px 64px rgba(0,0,0,0.7)` }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{current.emoji}</span>
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold mb-0.5" style={{ color: GOLD }}>
              Dica {step + 1} de {TUTORIAL_STEPS.length}
            </p>
            <h3 className="font-black text-base text-white leading-tight">{current.title}</h3>
          </div>
        </div>
        <p className="text-sm text-white/70 leading-relaxed">{current.body}</p>
        <div className="flex items-center gap-1.5">
          {TUTORIAL_STEPS.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-300"
              style={{ width: i === step ? "20px" : "6px", height: "6px", background: i === step ? GOLD : "rgba(255,255,255,0.2)" }}
            />
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleDismiss}
            className="flex-1 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
            Pular
          </button>
          <button type="button"
            onClick={() => { if (isLast) { handleDismiss(); } else { setStep((s) => s + 1); } }}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: isLast ? "linear-gradient(135deg, #CC0000, #8B0000)" : GOLD, color: isLast ? "#fff" : "#000" }}>
            {isLast ? "Começar 🔥" : "Próximo →"}
          </button>
        </div>
      </motion.div>
    </div>
  );
});

/* ── Subcomponente: Input numérico ──────────────────────────────────────────── */

interface NumericFieldProps {
  label: string;
  unit: string;
  value: number;
  suggestedValue: number;
  onChange: (val: number) => void;
  onUserEdited?: () => void;
  accent?: boolean;
}

const NumericField = memo(function NumericField({
  label, unit, value, suggestedValue, onChange, onUserEdited, accent = false,
}: NumericFieldProps) {
  const [touched, setTouched] = useState(false);
  const isSuggested = !touched && value === suggestedValue && suggestedValue > 0;
  const displayVal  = value > 0 ? String(value) : "";
  const placeholder = suggestedValue > 0 ? String(suggestedValue) : "0";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw    = e.target.value.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(raw);
    setTouched(true);
    onUserEdited?.();
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleFocus = () => {
    // Pre-populate com sugestão no foco para facilitar edição mínima
    if (!touched && suggestedValue > 0) {
      setTouched(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-1.5">
      <label className="text-[9px] uppercase tracking-[0.18em] font-bold" style={{ color: accent ? GOLD : "rgba(255,255,255,0.4)" }}>
        {label}
        {isSuggested && (
          <span className="ml-1.5 text-[8px] normal-case" style={{ color: GOLD + "aa" }}>
            sugerido
          </span>
        )}
      </label>
      <div
        className="flex items-center rounded-xl overflow-hidden transition-all"
        style={{
          border: isSuggested
            ? `1.5px solid ${GOLD}cc`
            : accent
            ? `1.5px solid ${GOLD}66`
            : "1.5px solid rgba(255,255,255,0.12)",
          background: isSuggested ? `${GOLD}0A` : "rgba(255,255,255,0.05)",
          minHeight: "64px",
          boxShadow: isSuggested ? `0 0 0 2px ${GOLD}22` : undefined,
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={displayVal}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          className="flex-1 bg-transparent text-center text-3xl font-black text-white py-3 outline-none w-0 min-w-0 tabular-nums"
          style={{ caretColor: accent ? GOLD : "#fff" }}
        />
        <span className="pr-3 text-sm font-semibold shrink-0" style={{ color: "rgba(255,255,255,0.35)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
});

/* ── Componente principal ───────────────────────────────────────────────────── */

type Phase = "training" | "conclusion";

export default function WorkoutMode({
  workouts, userId, coachId, coachName, teamName,
  initialDay, initialWeek, periodization, onClose,
}: Props) {
  const confirm = useConfirm();
  const session = useWorkoutSession();

  const storageKey = `workout_session_${userId}_${initialDay ?? workouts[0]?.key ?? "A"}`;
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks = periodization?.weeks && periodization.weeks.length === 4 ? periodization.weeks : DEFAULT_WEEKS;

  const _saved = (() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "null"); } catch { return null; }
  })();

  const [showTutorial, setShowTutorial] = useState<boolean>(() => shouldShowTutorialToday());
  const dismissTutorial = useCallback(() => { markTutorialShownToday(); setShowTutorial(false); }, []);

  const [selectedDay]   = useState<string>(initialDay ?? workouts[0]?.key ?? "");
  const [activeWeek, setActiveWeek]     = useState<number>(_saved?.activeWeek ?? initialWeek ?? 0);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [phase, setPhase]               = useState<Phase>("training");

  const [setDataMap, setSetDataMap] = useState<Record<string, SetData[]>>(_saved?.setDataMap ?? {});
  const [generalFeeling, setGeneralFeeling] = useState<1 | 2 | 3 | undefined>();
  const [sleepQuality, setSleepQuality]     = useState<1 | 2 | 3 | undefined>();
  const [showShare, setShowShare]   = useState(false);
  const [shareMode, setShareMode]   = useState<"final" | "partial">("final");
  const [completed, setCompleted]   = useState<Record<string, number[]>>(_saved?.completed ?? {});
  const [startedAt, setStartedAt]   = useState<number>(_saved?.startedAt ?? Date.now());
  const [now, setNow]               = useState(Date.now());
  const [historyMap, setHistoryMap] = useState<Record<string, ExerciseHistory[]>>({});

  // Micro-interação: burst ao concluir série
  const [burstKey, setBurstKey]   = useState<string | null>(null);
  const [burstColor, setBurstColor] = useState(GOLD);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          activeWeek,
          completed,
          setDataMap,
          sessionId: session.sessionId,
          startedAt,
          restBaseSec,
          restSegStartedAt,
        })
      );
    } catch { /* quota exceeded */ }
  }, [activeWeek, completed, setDataMap, storageKey, session.sessionId, startedAt, restBaseSec, restSegStartedAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  const day       = workouts.find((d) => d.key === selectedDay) ?? workouts[0];
  const exercises: Exercise[] = (day?.exercises ?? []).map((ex, idx) => {
    if (!isPeriodizationOn) return ex;
    const weekOverrides = periodization?.overrides?.[String(activeWeek)] ?? {};
    const override      = weekOverrides[`${day!.key}_${idx}`] ?? {};
    const wm            = weeks[activeWeek];
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

  const currentEx      = exercises[currentExIdx];
  const gifUrl          = useExerciseGif(currentEx?.name, currentEx?.gifKey);
  const [showGifDialog, setShowGifDialog] = useState(false);
  const currentExKey   = day ? `${day.key}::${currentExIdx}` : "";
  const setsMax        = parseSetsMax(currentEx?.sets);
  const setsMin        = parseSetsMin(currentEx?.sets);
  const restRange      = parseRestRange(currentEx?.rest);
  const defaultRestSec = restRange.max;
  const alertRestSec   = restRange.min;   // quando chegar aqui muda de cor

  useEffect(() => {
    if (!currentEx) return;
    setSetDataMap((prev) => {
      if (prev[currentExKey]) return prev;
      return {
        ...prev,
        [currentExKey]: Array.from({ length: setsMax }, () => ({
          weight: 0, reps: 0, done: false, skipped: false,
        })),
      };
    });
  }, [currentExKey, setsMax, currentEx]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Se já existe sessão persistida no localStorage, retoma sem criar nova entrada no banco
      if (_saved?.sessionId && _saved?.startedAt) {
        session.resumeSession({
          sessionId: _saved.sessionId,
          userId,
          workoutKey: day?.key ?? "A",
          startedAt: _saved.startedAt,
        });
        return;
      }

      // localStorage vazio ou corrompido: antes de abrir um treino novo,
      // verifica se já existe uma sessão em aberto no Supabase para este
      // aluno + treino. Evita perder o progresso e criar sessões duplicadas
      // quando o navegador limpa o localStorage no meio do treino.
      const active = await session.findActiveSession(userId, day?.key ?? "A");
      if (cancelled) return;

      if (active) {
        setStartedAt(active.startedAt);
        session.resumeSession({
          sessionId: active.sessionId,
          userId,
          workoutKey: day?.key ?? "A",
          startedAt: active.startedAt,
        });

        // O localStorage estava vazio, então setDataMap/completed começaram
        // zerados — reconstrói o progresso real a partir das séries já
        // salvas no Supabase para esta sessão, senão a tela mostraria o
        // treino como "não iniciado" mesmo com séries já registradas.
        const savedSets = await session.getSessionSets(active.sessionId);
        if (!cancelled && savedSets.length > 0 && day) {
          const exKeyToIdx = new Map<string, number>();
          exercises.forEach((ex, idx) => exKeyToIdx.set(toExerciseKey(ex.name), idx));

          const rebuiltSetDataMap: Record<string, SetData[]> = {};
          const rebuiltCompleted: Record<string, number[]> = {};

          savedSets.forEach((row) => {
            const idx = exKeyToIdx.get(row.exercise_key);
            if (idx === undefined) return;

            const key    = `${day.key}::${idx}`;
            const setIdx = row.set_number - 1;
            if (setIdx < 0) return;

            const maxSets = parseSetsMax(exercises[idx]?.sets);
            if (!rebuiltSetDataMap[key]) {
              rebuiltSetDataMap[key] = Array.from({ length: maxSets }, () => ({
                weight: 0, reps: 0, done: false, skipped: false,
              }));
            }
            if (setIdx < rebuiltSetDataMap[key].length) {
              rebuiltSetDataMap[key][setIdx] = {
                weight:  row.weight_kg ?? 0,
                reps:    row.reps ?? 0,
                done:    true,
                skipped: row.skipped,
              };
            }
            if (row.completed || row.skipped) {
              rebuiltCompleted[key] = [...(rebuiltCompleted[key] ?? []), setIdx];
            }
          });

          setSetDataMap((prev) => ({ ...prev, ...rebuiltSetDataMap }));
          setCompleted((prev) => ({ ...prev, ...rebuiltCompleted }));
        }

        toast.info("Retomamos seu treino em andamento.");
      } else {
        setStartedAt(Date.now());
        session.startSession({
          userId,
          coachId,
          workoutKey:   day?.key ?? "A",
          workoutLabel: day?.focus ?? undefined,
          periodizationWeek: isPeriodizationOn ? activeWeek + 1 : undefined,
        });
      }
    };

    void init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId || exercises.length === 0) return;
    session.getExerciseHistoryBatch(exercises.map((e) => e.name), 3).then((byName) => {
      const next: Record<string, ExerciseHistory[]> = {};
      exercises.forEach((ex, idx) => {
        const key = `${day?.key}::${idx}`;
        if (byName[ex.name]?.length) next[key] = byName[ex.name];
      });
      if (Object.keys(next).length) setHistoryMap((prev) => ({ ...prev, ...next }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.map((e) => e.name).join("|"), userId]);

  /* ── Timer ──────────────────────────────────────────────────────────────────── */
  // Sugestão automática de progressão de carga
  const exerciseKeys = exercises.map((ex) => toExerciseKey(ex.name));
  const { data: progressionMap } = useLoadProgression(userId, exerciseKeys);
  const currentProgression = progressionMap?.get(toExerciseKey(currentEx?.name ?? ""));

  // ── Timer de descanso: derivado de timestamp real ─────────────────────────
  // Modelo baseado em base acumulada + timestamp do segmento em execução.
  // Sobrevive a app em background/tela bloqueada porque o valor é recalculado
  // a partir de `now` (atualizado pelo tick global e por visibilitychange),
  // em vez de depender de setInterval sendo chamado a cada segundo.
  const [restBaseSec, setRestBaseSec] = useState<number>(_saved?.restBaseSec ?? 0);
  const [restSegStartedAt, setRestSegStartedAt] = useState<number | null>(
    _saved?.restSegStartedAt ?? null
  );
  const restEndFiredRef = useRef(false);
  const restRunning = restSegStartedAt !== null;
  const restElapsed = restBaseSec + (restSegStartedAt ? Math.floor((now - restSegStartedAt) / 1000) : 0);
  const isAlertZone = restRunning && alertRestSec > 0 && restElapsed >= alertRestSec;

  // Reseta o descanso ao trocar de exercício/semana
  useEffect(() => {
    restEndFiredRef.current = false;
    setRestBaseSec(0);
    setRestSegStartedAt(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, activeWeek, defaultRestSec]);

  const advanceIfDone = useCallback(() => {
    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      if (arr.length >= setsMin) {
        setCurrentExIdx((i) => Math.min(i + 1, exercises.length - 1));
      }
      return prev;
    });
  }, [currentExKey, setsMin, exercises.length]);

  // Recalcula na hora ao voltar pro app — cobre suspensão de timer em background
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Aviso sonoro + fim do descanso — derivado do tick global de 1s
  useEffect(() => {
    if (!restRunning) { restEndFiredRef.current = false; return; }
    if (restElapsed === alertRestSec && alertRestSec > 0) playBeep("warn");
    if (restElapsed >= defaultRestSec && !restEndFiredRef.current) {
      restEndFiredRef.current = true;
      playBeep("end");
      toast.success("🔔 Descansou! Hora da próxima série.", { duration: 4000 });
      setRestBaseSec(defaultRestSec);
      setRestSegStartedAt(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restElapsed, restRunning, alertRestSec, defaultRestSec]);

  const skipRest = () => {
    setRestBaseSec(0);
    setRestSegStartedAt(null);
  };

  /* ── Carga / reps ────────────────────────────────────────────────────────────── */
  const currentSets   = setDataMap[currentExKey] ?? [];
  const doneSetsCount = currentSets.filter((s) => s.done).length;
  const currentSetIdx = doneSetsCount;
  const todasFeitas   = doneSetsCount >= setsMax;
  const serieAtualNum = Math.min(doneSetsCount + 1, setsMax);

  const lastDoneWeight    = currentSets.filter((s) => s.done && !s.skipped).at(-1)?.weight ?? 0;
  const lastHistoryWeight = historyMap[currentExKey]?.[0]?.weightKg ?? 0;
  // Se progressão automática detectou overload (RIR limpo 2x seguidas), usa a sugestão dela
  const suggestedWeight   = lastDoneWeight > 0
    ? lastDoneWeight
    : currentProgression?.suggestedWeightKg ?? lastHistoryWeight;

  const lastHistoryReps   = historyMap[currentExKey]?.[0]?.reps ?? 0;
  const lastDoneReps      = currentSets.filter((s) => s.done && !s.skipped).at(-1)?.reps ?? 0;
  // Sugestão de reps: último feito > histórico > alvo do protocolo
  const suggestedReps     = lastDoneReps > 0
    ? lastDoneReps
    : lastHistoryReps > 0
    ? lastHistoryReps
    : parseRepsDefault(currentEx?.reps);

  const [activeWeight, setActiveWeight]   = useState(suggestedWeight);
  const [activeReps, setActiveReps]       = useState(suggestedReps);
  const [weightEdited, setWeightEdited]   = useState(false);
  const [repsEdited, setRepsEdited]       = useState(false);

  // Reset sugestão ao mudar exercício ou série
  useEffect(() => {
    setActiveWeight(suggestedWeight);
    setActiveReps(suggestedReps);
    setWeightEdited(false);
    setRepsEdited(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, doneSetsCount]);

  /* ── Registrar série (1 tap) ─────────────────────────────────────────────────── */
  const handleFizASerie = useCallback(
    async (effort?: 1 | 2 | 3) => {
      if (todasFeitas) return;

      // Destrava o AudioContext no gesto do usuário (exigência dos navegadores)
      getAudioCtx();

      // Resolve carga/reps: usa sugestão se não editado
      const weight = activeWeight > 0 ? activeWeight : suggestedWeight;
      const reps   = activeReps > 0   ? activeReps   : suggestedReps;

      const effortColor = effort === 1 ? "#22c55e" : effort === 3 ? "#CC0000" : GOLD;

      setSetDataMap((prev) => {
        const arr = [...(prev[currentExKey] ?? [])];
        if (arr[currentSetIdx]) {
          arr[currentSetIdx] = { weight, reps, effort, done: true, skipped: false };
        }
        return { ...prev, [currentExKey]: arr };
      });

      setCompleted((prev) => {
        const arr = prev[currentExKey] ?? [];
        if (arr.includes(currentSetIdx)) return prev;
        return { ...prev, [currentExKey]: [...arr, currentSetIdx] };
      });

      // Micro-interação: burst de partículas
      setBurstColor(effortColor);
      setBurstKey(`${currentExKey}_${currentSetIdx}_${Date.now()}`);
      setTimeout(() => setBurstKey(null), 600);

      try {
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
      } catch (err) {
        console.error("Erro ao registrar série:", err);
        toast.error("❌ Não foi possível salvar no servidor. Seus dados ficaram salvos neste aparelho.");
      }

      restEndFiredRef.current = false;
      setRestBaseSec(0);
      setRestSegStartedAt(Date.now());
    },
    [
      todasFeitas, activeWeight, activeReps, suggestedWeight, suggestedReps,
      currentExKey, currentSetIdx, currentEx, setsMin, setsMax, defaultRestSec, session,
    ]
  );

  /* ── Pular série ─────────────────────────────────────────────────────────────── */
  const handleSkipSerie = useCallback(async () => {
    if (todasFeitas) return;

    setSetDataMap((prev) => {
      const arr = [...(prev[currentExKey] ?? [])];
      if (arr[currentSetIdx]) {
        arr[currentSetIdx] = { weight: 0, reps: 0, done: true, skipped: true };
      }
      return { ...prev, [currentExKey]: arr };
    });

    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      if (arr.includes(currentSetIdx)) return prev;
      return { ...prev, [currentExKey]: [...arr, currentSetIdx] };
    });

    try {
      await session.registerSet({
        exerciseName: currentEx?.name ?? "—",
        setNumber:    currentSetIdx + 1,
        completed:    false,
        skipped:      true,
      });
    } catch (err) {
      console.error("Erro ao registrar série pulada:", err);
      toast.error("❌ Não foi possível salvar no servidor. Seus dados ficaram salvos neste aparelho.");
    }
  }, [todasFeitas, currentExKey, currentSetIdx, currentEx, session]);

  /* ── Métricas ────────────────────────────────────────────────────────────────── */
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

  /* ── Conclusão ───────────────────────────────────────────────────────────────── */
  const handleSharedDone = async () => {
    await maybeFireFatigueAlerts({
      coachId,
      studentId: userId,
      sessionId: session.sessionId,
      setDataMap,
      sleepQuality,
    });

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

    // Finaliza a sessão no banco mesmo saindo pelo X (sem tela de conclusão).
    // Garante ended_at preenchido → histórico e analytics do coach funcionam.
    await session.finishSession({
      generalFeeling: undefined,
      sleepQuality:   undefined,
    });

    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
    onClose();
  };

  const currentHistory = historyMap[currentExKey] ?? [];
  const lastSession    = currentHistory[0];

  if (!day)
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Nenhum treino disponível.</p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    );

  /* ══════════════════════════════════════════════════════════════════════════════
     FASE: TREINO
  ══════════════════════════════════════════════════════════════════════════════ */
  if (phase === "training") {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-32">

        <AnimatePresence>
          {showTutorial && <CoachMark onDismiss={dismissTutorial} />}
        </AnimatePresence>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5">
            <motion.div
              className="h-full"
              style={{ background: GOLD }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          <button type="button" onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Sair do treino">
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>

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

          {/* ── Seletor de semana ──────────────────────────────────────────────── */}
          {isPeriodizationOn && (
            <div className="bg-card border border-border rounded-xl p-3 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Semana atual</p>
              <div className="grid grid-cols-4 gap-1.5">
                {weeks.map((_w, i) => (
                  <button key={i} type="button"
                    onClick={() => { setActiveWeek(i); setRestBaseSec(0); setRestSegStartedAt(null); }}
                    className={`py-2 rounded-lg text-[11px] font-bold border transition ${
                      activeWeek === i
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted/50"
                    }`}>
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

          {/* ── Timer de descanso ─────────────────────────────────────────────── */}
          <div
            className="rounded-2xl p-6 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1A1A1A, #0A0A0A)",
              border: `1px solid ${isAlertZone ? "rgba(255,107,53,0.5)" : restRunning ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.08)"}`,
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
              {todasFeitas
                ? "exercício completo! ✓"
                : restRunning
                ? `descansando · série ${serieAtualNum} de ${setsMax} a seguir`
                : `série ${serieAtualNum} de ${setsMax}`}
            </p>

            <div className="relative mx-auto flex flex-col items-center justify-center" style={{ minHeight: 120 }}>
              <AnimatePresence>
                {burstKey && (
                  <motion.div key={burstKey} className="absolute inset-0 pointer-events-none">
                    <BurstParticles color={burstColor} />
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.p
                className="font-black tabular-nums leading-none"
                style={{
                  fontSize: "72px",
                  letterSpacing: "-2px",
                  color: isAlertZone ? "#FF6B35" : "#fff",
                  transition: "color 0.4s ease",
                  textShadow: isAlertZone ? "0 0 20px rgba(255,107,53,0.5)" : "none",
                }}
                animate={burstKey ? { scale: [1, 1.12, 1] } : isAlertZone ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                transition={{ duration: isAlertZone ? 0.8 : 0.35, ease: "easeInOut", repeat: isAlertZone ? Infinity : 0 }}
              >
                {fmtMMSS(restElapsed)}
              </motion.p>
              {/* Label de alerta no mínimo de descanso */}
              {isAlertZone && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-bold mt-1"
                  style={{ color: "#FF6B35" }}
                >
                  mínimo recomendado atingido
                </motion.p>
              )}
              <p className="text-[10px] text-white/40 font-bold mt-2">{progressPct}% do treino</p>
              <p className="text-sm text-white/60 mt-1 truncate px-4">{currentEx?.name ?? ""}</p>
            </div>

            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              {restRunning ? (
                <>
                  <button type="button" onClick={() => { setRestBaseSec(restElapsed); setRestSegStartedAt(null); }}
                    className="flex items-center gap-2 px-4 py-3 rounded-full text-white font-bold text-sm"
                    style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <Pause className="w-4 h-4" />
                    <span>Pausar</span>
                  </button>
                  <motion.button type="button" onClick={skipRest} whileTap={{ scale: 0.94 }}
                    className="flex items-center gap-2 px-4 py-3 rounded-full font-bold text-sm"
                    style={{ backgroundColor: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}55` }}>
                    <SkipForward className="w-4 h-4" />
                    <span>Pular descanso</span>
                  </motion.button>
                </>
              ) : (
                <button type="button"
                  onClick={() => { setRestBaseSec(0); setRestSegStartedAt(null); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-full text-xs font-semibold"
                  style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)" }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resetar timer</span>
                </button>
              )}
            </div>
          </div>

          {/* ── Card exercício atual ────────────────────────────────────────────── */}
          {currentEx && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentExKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl p-4 space-y-4"
                style={{ background: "#111", border: "1px solid rgba(204,0,0,0.35)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {gifUrl && (
                      <button
                        type="button"
                        onClick={() => setShowGifDialog(true)}
                        className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-white/10"
                      >
                        <img src={gifUrl} alt={currentEx.name} loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <h2 className="font-bold text-base leading-tight flex-1 truncate">{currentEx.name}</h2>
                  </div>
                  <span className="text-xs text-white/40 shrink-0 mt-0.5">
                    {doneSetsCount} / {setsMax} séries
                  </span>
                </div>

                {gifUrl && (
                  <Dialog open={showGifDialog} onOpenChange={setShowGifDialog}>
                    <DialogContent className="max-w-sm p-2 bg-black border-white/10">
                      <img src={gifUrl} alt={currentEx.name} className="w-full h-auto rounded-lg" />
                    </DialogContent>
                  </Dialog>
                )}

                {/* Última vez */}
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
                            · {effortLabel(lastSession.perceivedEffort as 1 | 2 | 3)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Bolhas de série com burst */}
                <div className="flex gap-2.5 flex-wrap">
                  {Array.from({ length: setsMax }).map((_, i) => {
                    const setInfo   = currentSets[i];
                    const isDone    = setInfo?.done ?? false;
                    const isSkipped = setInfo?.skipped ?? false;
                    const isCurrent = !isDone && i === doneSetsCount;
                    const isBursting = burstKey?.startsWith(`${currentExKey}_${i}_`);
                    return (
                      <div key={i} className="relative">
                        <AnimatePresence>
                          {isBursting && (
                            <motion.div key={`burst_${i}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
                              <BurstParticles color={burstColor} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <motion.button
                          type="button"
                          animate={isDone ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          title={isDone ? `Série ${i + 1} feita — toque para desfazer` : `Série ${i + 1}`}
                          onClick={() => {
                            if (isDone) {
                              setSetDataMap((prev) => {
                                const arr = [...(prev[currentExKey] ?? [])];
                                if (arr[i]) arr[i] = { ...arr[i], done: false };
                                return { ...prev, [currentExKey]: arr };
                              });
                              setCompleted((prev) => ({
                                ...prev,
                                [currentExKey]: (prev[currentExKey] ?? []).filter((n) => n !== i),
                              }));
                              // Remove a série do banco para evitar duplicatas/fantasmas nas analytics
                              if (currentEx?.name) {
                                void session.deleteSet(i + 1, currentEx.name);
                              }
                            }
                          }}
                          style={
                            isSkipped
                              ? { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.3)" }
                              : isDone
                              ? { background: "#22c55e", borderColor: "#22c55e", color: "#fff" }
                              : isCurrent
                              ? { background: "rgba(204,0,0,0.15)", borderColor: "#CC0000", color: "#CC0000" }
                              : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }
                          }
                          className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm border-2 ${isCurrent ? "animate-pulse" : ""}`}
                        >
                          {isSkipped ? "—" : isDone ? <Check className="w-4 h-4" /> : i + 1}
                        </motion.button>
                      </div>
                    );
                  })}
                </div>

                {/* ── BLOCO DE REGISTRO (One-Click) ─────────────────────────────────── */}
                {!todasFeitas && (
                  <div
                    className="rounded-xl p-4 space-y-4"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Série {serieAtualNum}
                      </p>
                      <p className="text-[9px] text-white/30">Edite se quiser, depois tap ↓</p>
                    </div>

                    {/* Chip de progressão automática */}
                    {currentProgression && !weightEdited && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setActiveWeight(currentProgression.suggestedWeightKg);
                          setWeightEdited(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
                        style={{
                          background: "rgba(201,168,76,0.12)",
                          border: `1px solid ${GOLD}55`,
                          color: GOLD,
                        }}
                      >
                        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-left">
                          📈 Progressão sugerida: {currentProgression.suggestedWeightKg}kg
                        </span>
                        <span style={{ color: GOLD + "80", fontWeight: 400 }}>tap p/ aplicar</span>
                      </motion.button>
                    )}

                    {/* Inputs com auto-preenchimento */}
                    <div className="flex gap-3">
                      <NumericField
                        label="Carga"
                        unit="kg"
                        value={activeWeight}
                        suggestedValue={suggestedWeight}
                        onChange={setActiveWeight}
                        onUserEdited={() => setWeightEdited(true)}
                        accent
                      />
                      <NumericField
                        label="Repetições"
                        unit="reps"
                        value={activeReps}
                        suggestedValue={suggestedReps}
                        onChange={setActiveReps}
                        onUserEdited={() => setRepsEdited(true)}
                        accent
                      />
                    </div>

                    {/* ── Botões de esforço — únicas ações de confirmação ── */}
                    <div>
                      <p className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Como foi? (tap salva a série)
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {EFFORT_OPTIONS.map((opt) => (
                          <motion.button
                            key={opt.value}
                            type="button"
                            whileTap={{ scale: 0.91 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => handleFizASerie(opt.value)}
                            className="rounded-xl border transition flex flex-col items-center justify-center gap-1"
                            style={{
                              background:  opt.bg,
                              borderColor: opt.color + "66",
                              color:       opt.color,
                              minHeight:   "64px",  // ≥56px para mão suada
                              padding:     "12px 4px",
                            }}
                          >
                            <span className="text-lg">{opt.emoji}</span>
                            <span className="text-base font-black">{opt.label}</span>
                            <span className="text-[9px] font-semibold" style={{ color: opt.color + "99" }}>
                              {opt.sublabel}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Pular série */}
                    <button
                      type="button"
                      onClick={handleSkipSerie}
                      className="w-full py-2.5 rounded-xl text-xs font-semibold text-center transition"
                      style={{ border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.3)" }}
                    >
                      Pular esta série
                    </button>
                  </div>
                )}

                {/* Métricas do exercício */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Reps alvo", val: parseRepsLabel(currentEx.reps) },
                    { label: "Séries",    val: parseSetsLabel(currentEx.sets) },
                    { label: "Descanso",  val: currentEx.rest ?? "—" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg p-2.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">{m.label}</p>
                      <p className="text-sm font-bold mt-0.5 text-white">{m.val}</p>
                    </div>
                  ))}
                </div>

                {currentEx.notes && (
                  <p className="text-xs text-white/60 italic p-3 rounded-lg" style={{ background: "rgba(204,0,0,0.06)", borderLeft: "3px solid rgba(204,0,0,0.6)" }}>
                    {currentEx.notes}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── Navegação ─────────────────────────────────────────────────────── */}
          {/* Botão proeminente de avançar quando exercício concluído */}
          {todasFeitas && currentExIdx < exercises.length - 1 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setCurrentExIdx((i) => i + 1); setRestBaseSec(0); setRestSegStartedAt(null); }}
              className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff",
                boxShadow: "0 4px 20px rgba(34,197,94,0.35)",
              }}
            >
              <ChevronRight className="w-5 h-5" />
              Próximo exercício
            </motion.button>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1 h-11"
              disabled={currentExIdx === 0}
              onClick={() => { setCurrentExIdx((i) => Math.max(0, i - 1)); setRestBaseSec(0); setRestSegStartedAt(null); }}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1 h-11"
              disabled={currentExIdx >= exercises.length - 1}
              onClick={() => { setCurrentExIdx((i) => Math.min(i + 1, exercises.length - 1)); setRestBaseSec(0); setRestSegStartedAt(null); }}>
              Próximo <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* ── Lista de exercícios ────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-1">
              Exercícios do treino
            </p>
            {exercises.map((ex, idx) => {
              const k         = `${day!.key}::${idx}`;
              const done      = (completed[k]?.length ?? 0) >= parseSetsMin(ex.sets);
              const isCurrent = idx === currentExIdx;
              const exDone    = completed[k]?.length ?? 0;
              const exMax     = parseSetsMax(ex.sets);
              return (
                <div key={idx}
                  onClick={() => { setCurrentExIdx(idx); setRestBaseSec(0); setRestSegStartedAt(null); }}
                  className={`flex items-center gap-3 bg-card border rounded-xl p-3 cursor-pointer transition-all ${
                    isCurrent ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border"
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
                        <span key={si} className="rounded-full transition-all"
                          style={{
                            width:  si < exDone ? "8px" : "6px",
                            height: si < exDone ? "8px" : "6px",
                            backgroundColor: si < exDone ? "#22c55e" : isCurrent && si === exDone ? "#CC0000" : "rgba(255,255,255,0.15)",
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

          {/* ── Resumo ────────────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-primary" />
              {doneSets}/{totalSets} séries · {completedExCnt}/{exercises.length} exercícios
            </p>
            <p className="text-sm font-black" style={{ color: GOLD }}>{progressPct}%</p>
          </div>
        </main>

        {/* ── Footer: Concluir ────────────────────────────────────────────────── */}
        {hasAnyDone && (
          <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
            <div className="max-w-2xl mx-auto flex items-center gap-2">
              <Button type="button" onClick={() => setPhase("conclusion")}
                className="flex-1 h-12 text-base font-bold rounded-2xl"
                style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}>
                🏆 Concluir treino
              </Button>
              {completedExCnt >= 1 && completedExCnt < exercises.length && (
                <motion.button type="button" whileTap={{ scale: 0.9 }}
                  onClick={() => { setShareMode("partial"); setShowShare(true); }}
                  className="h-12 px-3 shrink-0 rounded-2xl flex items-center gap-1.5 text-xs font-bold"
                  style={{ background: `${GOLD}1A`, border: `1px solid ${GOLD}55`, color: GOLD }}>
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Compartilhar</span>
                </motion.button>
              )}
            </div>
          </div>
        )}

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

  /* ══════════════════════════════════════════════════════════════════════════════
     FASE: CONCLUSÃO
  ══════════════════════════════════════════════════════════════════════════════ */
  const highlights: { name: string; note: string }[] = exercises
    .map((ex, idx) => {
      const k    = `${day!.key}::${idx}`;
      const sets = setDataMap[k] ?? [];
      const best = sets.filter((s) => s.done && !s.skipped && s.weight > 0);
      if (!best.length) return null;
      const maxWeight = Math.max(...best.map((s) => s.weight));
      const hist      = historyMap[k]?.[0];
      const delta     = hist?.weightKg ? maxWeight - hist.weightKg : 0;
      return {
        name: ex.name,
        note: delta > 0 ? `${maxWeight}kg (+${delta}kg) 🔺` : delta === 0 ? `${maxWeight}kg — manteve` : `${maxWeight}kg`,
      };
    })
    .filter(Boolean) as { name: string; note: string }[];

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <main className="max-w-md mx-auto px-4 py-12 flex flex-col items-center gap-6 text-center">

        {/* Trophy com spring bounce */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 8, stiffness: 120 }}
          className="text-6xl"
        >
          🏆
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h1 className="text-2xl font-black text-foreground">Treino Concluído!</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Treino {day.key}{day.focus ? ` · ${day.focus}` : ""} · {fmtMMSS(elapsedSec)}
          </p>
        </motion.div>

        {/* Destaques com shimmer */}
        {highlights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="w-full rounded-xl p-4 space-y-2 text-left relative overflow-hidden"
            style={{ background: `${GOLD}0F`, border: `1px solid ${GOLD}33` }}
          >
            {/* Shimmer de recompensa */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 0.9, delay: 0.5, ease: "easeInOut" }}
              style={{ background: `linear-gradient(90deg, transparent, ${GOLD}22, transparent)` }}
            />
            <p className="text-[10px] uppercase tracking-widest font-bold relative" style={{ color: GOLD }}>
              <Zap className="w-3 h-3 inline mr-1" />
              Destaques
            </p>
            {highlights.slice(0, 3).map((h, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm text-foreground/80 truncate flex-1">{h.name}</span>
                <span className="text-sm font-bold text-foreground shrink-0">{h.note}</span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Sentimento */}
        <div className="w-full space-y-3">
          <p className="font-semibold text-foreground">Como foi o treino? <span className="text-xs text-muted-foreground font-normal">(opcional)</span></p>
          <div className="grid grid-cols-3 gap-3">
            {FEELING_OPTIONS.map((opt) => (
              <motion.button key={opt.value} type="button" whileTap={{ scale: 0.93 }}
                onClick={() => setGeneralFeeling(generalFeeling === opt.value ? undefined : opt.value)}
                className="py-4 rounded-xl border-2 flex flex-col items-center gap-1 transition"
                style={generalFeeling === opt.value ? { borderColor: GOLD, background: `${GOLD}15` } : { borderColor: "rgba(255,255,255,0.12)", background: "transparent" }}>
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-bold text-foreground">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Sono */}
        <div className="w-full space-y-3">
          <p className="font-semibold text-foreground">Como você dormiu ontem? <span className="text-xs text-muted-foreground font-normal">(opcional)</span></p>
          <div className="grid grid-cols-3 gap-3">
            {SLEEP_OPTIONS.map((opt) => (
              <motion.button key={opt.value} type="button" whileTap={{ scale: 0.93 }}
                onClick={() => setSleepQuality(sleepQuality === opt.value ? undefined : opt.value)}
                className="py-4 rounded-xl border-2 flex flex-col items-center gap-1 transition"
                style={sleepQuality === opt.value ? { borderColor: "#60a5fa", background: "rgba(96,165,250,0.10)" } : { borderColor: "rgba(255,255,255,0.12)", background: "transparent" }}>
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-bold text-foreground">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Próximo treino */}
        <div className="w-full rounded-xl p-3 text-left" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Próximo treino</p>
          <p className="font-bold text-sm text-foreground mt-0.5">
            Treino {(() => {
              const keys  = workouts.map((w) => w.key);
              const idx   = keys.indexOf(day.key ?? "");
              const next  = keys[(idx + 1) % keys.length];
              const nextD = workouts.find((w) => w.key === next);
              return `${next}${nextD?.focus ? ` · ${nextD.focus}` : ""}`;
            })()}
          </p>
        </div>

        {/* Botões */}
        <div className="w-full flex gap-3">
          <Button type="button" variant="outline" className="flex-1 gap-2 h-12"
            onClick={() => { setShareMode("final"); setShowShare(true); }}>
            <Share2 className="w-4 h-4" /> Compartilhar
          </Button>
          <Button type="button" className="flex-1 font-bold h-12"
            style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}
            onClick={handleSharedDone}>
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
