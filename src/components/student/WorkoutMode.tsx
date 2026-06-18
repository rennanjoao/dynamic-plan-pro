import { useEffect, useRef, useState } from "react";
import { X, Pause, RotateCcw, Check, Image as ImageIcon, Flame, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import WorkoutShareCard from "./WorkoutShareCard";

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
  initialDay?: string;
  periodization?: Periodization;
  onClose: () => void;
}
type SessionState = {
  startedAt: number;
  selectedDay: string;
  activeWeek: number;
  completed: Record<string, number[]>;
};

const DEFAULT_WEEKS: WeekMeta[] = [
  { label: "Semana 1 — Carga Máxima",            sets: "4 a 5 séries", reps: "5 a 8 reps",   rest: "2 min",     cadence: "1s conc / 2s exc" },
  { label: "Semana 2 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 3 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 4 — Estresse Metabólico",     sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30s a 45s", cadence: "1s conc / 1s exc" },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

function parseSets(s?: string): number {
  if (!s) return 3;
  const m = String(s).match(/\d+/);
  return m ? Math.max(1, parseInt(m[0], 10)) : 3;
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

export default function WorkoutMode({
  workouts,
  userId,
  coachName,
  initialDay,
  periodization,
  onClose,
}: Props) {
  const storageKey = `workout_session_${userId}_${todayKey()}`;
  const isPeriodizationOn = periodization?.enabled ?? false;
  const weeks =
    periodization?.weeks && periodization.weeks.length === 4
      ? periodization.weeks
      : DEFAULT_WEEKS;

  // ── Dia fixo: se veio initialDay, trava nele. Não mostra seletor. ──
  const [selectedDay] = useState<string>(
    initialDay ?? workouts[0]?.key ?? ""
  );

  const [activeWeek, setActiveWeek] = useState<number>(0);
  const [completed, setCompleted] = useState<Record<string, number[]>>({});
  const [startedAt, setStartedAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [showShare, setShowShare] = useState(false);
  const [currentExIdx, setCurrentExIdx] = useState(0);

  // Restore sessão salva
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s: SessionState = JSON.parse(raw);
        setStartedAt(s.startedAt || Date.now());
        setCompleted(s.completed || {});
        setActiveWeek(s.activeWeek ?? 0);
      } else {
        setStartedAt(Date.now());
      }
    } catch {
      setStartedAt(Date.now());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    if (!startedAt) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ startedAt, selectedDay, activeWeek, completed })
    );
  }, [startedAt, selectedDay, activeWeek, completed, storageKey]);

  // Clock
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ── Treino e exercícios do dia fixo ──
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

  const currentEx       = exercises[currentExIdx];
  const currentExSets   = parseSets(currentEx?.sets);
  const currentExKey    = day ? `${day.key}::${currentExIdx}` : "";
  const currentDoneSets = completed[currentExKey] ?? [];
  const defaultRest     = parseRestSec(currentEx?.rest);

  const [restRemaining, setRestRemaining] = useState(defaultRest);
  const [restRunning, setRestRunning]     = useState(false);
  const restRef = useRef<number | null>(null);

  useEffect(() => {
    setRestRemaining(defaultRest);
    setRestRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExKey, activeWeek]);

  const advanceSerieAuto = () => {
    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      if (arr.length >= currentExSets)
        setCurrentExIdx((i) => Math.min(i + 1, exercises.length - 1));
      return prev;
    });
  };

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
          advanceSerieAuto();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (restRef.current) window.clearInterval(restRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRunning]);

  // ── AÇÃO PRINCIPAL ──
  const handleFizASerie = () => {
    const nextIdx = currentDoneSets.length;
    if (nextIdx >= currentExSets) {
      // todas as séries feitas — só reinicia o timer
      setRestRemaining(defaultRest);
      setRestRunning(true);
      return;
    }
    // marca a série + inicia descanso
    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      if (arr.includes(nextIdx)) return prev;
      return { ...prev, [currentExKey]: [...arr, nextIdx] };
    });
    setRestRemaining(defaultRest);
    setRestRunning(true);
  };

  const toggleSetManual = (setIdx: number) => {
    setCompleted((prev) => {
      const arr = prev[currentExKey] ?? [];
      const next = arr.includes(setIdx)
        ? arr.filter((i) => i !== setIdx)
        : [...arr, setIdx];
      return { ...prev, [currentExKey]: next };
    });
    setRestRunning(false);
    setRestRemaining(defaultRest);
  };

  const isExDone = (idx: number) =>
    (completed[`${day!.key}::${idx}`]?.length ?? 0) >= parseSets(exercises[idx]?.sets);

  const toggleExDone = (idx: number) => {
    const k     = `${day!.key}::${idx}`;
    const total = parseSets(exercises[idx]?.sets);
    setCompleted((prev) => {
      const done = (prev[k]?.length ?? 0) >= total;
      if (done) return { ...prev, [k]: [] };
      return { ...prev, [k]: Array.from({ length: total }, (_, i) => i) };
    });
  };

  // ── Métricas ──
  const totalSets = exercises.reduce((a, e) => a + parseSets(e.sets), 0);
  const doneSets  = exercises.reduce(
    (a, _, idx) => a + (completed[`${day!.key}::${idx}`]?.length ?? 0),
    0
  );
  const progressPct    = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const completedExCnt = exercises.reduce((a, _, idx) => a + (isExDone(idx) ? 1 : 0), 0);
  const hasAnyDone     = doneSets > 0 || completedExCnt > 0;
  const elapsedSec     = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const serieAtual     = Math.min(currentDoneSets.length + 1, currentExSets);
  const todasFeitas    = currentDoneSets.length >= currentExSets;
  const weekLabel      = isPeriodizationOn ? weeks[activeWeek]?.label : undefined;

  const handleClose = () => {
    if (hasAnyDone && !confirm("Sair do modo treino? Seu progresso fica salvo.")) return;
    onClose();
  };
  const handleSharedDone = () => {
    localStorage.removeItem(storageKey);
    setShowShare(false);
    onClose();
  };

  if (!day) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <p className="text-muted-foreground">Nenhum treino disponível.</p>
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto pb-32">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
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

        {/* ── Semanas (só periodização ativa) ── */}
        {isPeriodizationOn && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Semana atual
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {weeks.map((w, i) => (
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

        {/* ── Timer ── */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{
            background: "linear-gradient(135deg, #1A1A1A, #0A0A0A)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-bold mb-1">
            {restRunning
              ? "descansando..."
              : todasFeitas
              ? "exercício completo!"
              : `série ${serieAtual} de ${currentExSets}`}
          </p>
          <p className="text-5xl font-black text-white tabular-nums leading-none my-2">
            {fmtMMSS(restRemaining)}
          </p>
          <p className="text-sm text-white/60 mb-4 truncate px-4">{currentEx?.name ?? ""}</p>
          <div className="flex items-center justify-center gap-2">
            {!restRunning ? (
              <button
                type="button"
                disabled={todasFeitas}
                onClick={handleFizASerie}
                style={{ backgroundColor: todasFeitas ? "#374151" : "#CC0000" }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {todasFeitas ? "Séries concluídas" : "Fiz a série → descansar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRestRunning(false)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-bold text-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <Pause className="w-4 h-4" /> Pausar
              </button>
            )}
            <button
              type="button"
              onClick={() => { setRestRunning(false); setRestRemaining(defaultRest); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm"
              style={{ border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)" }}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Card exercício atual com bolhas ── */}
        {currentEx && (
          <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm truncate flex-1">{currentEx.name}</h2>
              <span className="text-xs text-muted-foreground ml-2 shrink-0">
                {currentDoneSets.length}/{currentExSets} séries
              </span>
            </div>
            {/* Bolhas de série */}
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: currentExSets }).map((_, i) => {
                const done      = currentDoneSets.includes(i);
                const isCurrent = !done && i === currentDoneSets.length;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleSetManual(i)}
                    title="Toque para corrigir"
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${
                      done
                        ? "bg-foreground text-background border-foreground"
                        : isCurrent
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </button>
                );
              })}
            </div>
            {/* Detalhes do exercício */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Séries",   v: currentEx.sets    || "—" },
                { l: "Reps",     v: currentEx.reps    || "—" },
                { l: "Descanso", v: currentEx.rest     || "—" },
              ].map((m, i) => (
                <div key={i} className="bg-muted/40 rounded-lg p-2 text-center">
                  <p className="text-[9px] uppercase text-muted-foreground">{m.l}</p>
                  <p className="text-xs font-bold mt-0.5">{m.v}</p>
                </div>
              ))}
            </div>
            {currentEx.notes && (
              <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded border-l-2 border-primary/50">
                {currentEx.notes}
              </p>
            )}
          </div>
        )}

        {/* ── Lista de exercícios do treino ── */}
        <div className="space-y-2">
          {exercises.map((ex, idx) => {
            const done      = isExDone(idx);
            const isCurrent = idx === currentExIdx;
            const exDone    = completed[`${day!.key}::${idx}`]?.length ?? 0;
            const exTotal   = parseSets(ex.sets);
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
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleExDone(idx); }}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    done
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {done && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${done ? "line-through text-muted-foreground" : ""}`}>
                    {ex.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {exDone}/{exTotal} séries · {ex.reps ?? "—"} reps · {ex.rest ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.info("🚀 Em breve! Os GIFs dos movimentos estão chegando.");
                  }}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> GIF
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Progresso ── */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-primary" /> Progresso
            </p>
            <p className="text-sm font-black text-primary">{progressPct}%</p>
          </div>
          <Progress value={progressPct} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
            {doneSets}/{totalSets} séries · {completedExCnt}/{exercises.length} exercícios
          </p>
        </div>
      </main>

      {/* ── Botão concluir ── */}
      {hasAnyDone && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-background via-background/95 to-transparent">
          <div className="max-w-2xl mx-auto">
            <Button
              type="button"
              onClick={() => setShowShare(true)}
              className="w-full h-12 text-base font-bold"
              style={{ background: "linear-gradient(135deg, #CC0000, #8B0000)", color: "#fff" }}
            >
              🏆 Concluir treino
            </Button>
          </div>
        </div>
      )}

      {showShare && (
        <WorkoutShareCard
          workoutName={`${day.key}${day.focus ? ` · ${day.focus}` : ""}`}
          durationSec={elapsedSec}
          totalSets={doneSets}
          completedExercises={completedExCnt}
          totalExercises={exercises.length}
          coachName={coachName}
          weekLabel={weekLabel}
          onClose={handleSharedDone}
        />
      )}
    </div>
  );
}
