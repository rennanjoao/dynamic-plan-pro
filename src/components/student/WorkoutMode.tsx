import { useEffect, useRef, useState } from "react";
import { X, Pause, RotateCcw, Check, Image as ImageIcon, Flame } from "lucide-react";
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

/** Retorna o número MÁXIMO do range (para gerar bolhas). Ex: "4 a 5 séries" → 5 */
function parseSetsMax(s?: string): number {
  if (!s) return 3;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 3;
  return Math.max(1, Math.max(...nums.map(Number)));
}

/** Retorna o número MÍNIMO do range (compatibilidade com isExDone). Ex: "4 a 5 séries" → 4 */
function parseSetsMin(s?: string): number {
  if (!s) return 3;
  const nums = String(s).match(/\d+/g);
  if (!nums) return 3;
  return Math.max(1, Math.min(...nums.map(Number)));
}

/** Range legível: "4 a 5" ou "4" se mín === máx */
function parseSetsLabel(s?: string): string {
  if (!s) return "3";
  const nums = String(s).match(/\d+/g);
  if (!nums) return "3";
  const mn = Math.min(...nums.map(Number));
  const mx = Math.max(...nums.map(Number));
  return mn === mx ? String(mn) : `${mn} a ${mx}`;
}

/** Range de reps legível */
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
  // Pega o primeiro número — usa o menor valor do range para não travar demais
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

  const [selectedDay] = useState<string>(
    initialDay ?? workouts[0]?.key ?? ""
  );

  const [activeWeek, setActiveWeek] = useState<number>(0);
  const [completed, setCompleted] = useState<Record<string, number[]>>({});
  const [startedAt, setStartedAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [showShare, setShowShare] = useState(false);
  const [currentExIdx, setCurrentExIdx] = useState(0);

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

  useEffect(() => {
    if (!startedAt) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ startedAt, selectedDay, activeWeek, completed })
    );
  }, [startedAt, selectedDay, activeWeek, completed, storageKey]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const currentEx        = exercises[currentExIdx];
  // Bolhas geradas pelo MAX; exercício "feito" quando atingir o MIN
  const currentExSetsMax = parseSetsMax(currentEx?.sets);
  const currentExSetsMin = parseSetsMin(currentEx?.sets);
  const currentExKey     = day ? `${day.key}::${currentExIdx}` : "";
  const currentDoneSets  = completed[currentExKey] ?? [];
  const defaultRest      = parseRestSec(currentEx?.rest);

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
      // Avança quando atinge o mínimo de séries
      if (arr.length >= currentExSetsMin)
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

  const handleFizASerie = () => {
    const nextIdx = currentDoneSets.length;
    if (nextIdx >= currentExSetsMax) {
      setRestRemaining(defaultRest);
      setRestRunning(true);
      return;
    }
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

  // Exercício "done" quando séries feitas >= mínimo do range
  const isExDone = (idx: number) =>
    (completed[`${day!.key}::${idx}`]?.length ?? 0) >= parseSetsMin(exercises[idx]?.sets);

  const toggleExDone = (idx: number) => {
    const k     = `${day!.key}::${idx}`;
    const total = parseSetsMax(exercises[idx]?.sets);
    setCompleted((prev) => {
      const done = (prev[k]?.length ?? 0) >= parseSetsMin(exercises[idx]?.sets);
      if (done) return { ...prev, [k]: [] };
      return { ...prev, [k]: Array.from({ length: total }, (_, i) => i) };
    });
  };

  const totalSets = exercises.reduce((a, e) => a + parseSetsMin(e.sets), 0);
  const doneSets  = exercises.reduce(
    (a, _, idx) => a + (completed[`${day!.key}::${idx}`]?.length ?? 0),
    0
  );
  const progressPct    = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const completedExCnt = exercises.reduce((a, _, idx) => a + (isExDone(idx) ? 1 : 0), 0);
  const hasAnyDone     = doneSets > 0 || completedExCnt > 0;
  const elapsedSec     = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const serieAtual     = Math.min(currentDoneSets.length + 1, currentExSetsMax);
  const todasFeitas    = currentDoneSets.length >= currentExSetsMax;
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

        {/* ── Timer hero ── */}
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "linear-gradient(135deg, #1A1A1A, #0A0A0A)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-bold mb-2">
            {restRunning
              ? "descansando..."
              : todasFeitas
              ? "exercício completo!"
              : `série ${serieAtual} de ${currentExSetsMax}`}
          </p>
          <p className="text-6xl font-black text-white tabular-nums leading-none my-3">
            {fmtMMSS(restRemaining)}
          </p>
          <p className="text-sm text-white/60 mb-5 truncate px-4">{currentEx?.name ?? ""}</p>
          <div className="flex items-center justify-center gap-2">
            {!restRunning ? (
              <button
                type="button"
                disabled={todasFeitas}
                onClick={handleFizASerie}
                style={{ backgroundColor: todasFeitas ? "#374151" : "#CC0000" }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white font-bold text-sm disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {todasFeitas ? "Séries concluídas" : "Fiz a série → descansar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRestRunning(false)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-white font-bold text-sm"
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

        {/* ── Card exercício atual — redesenhado ── */}
        {currentEx && (
          <div
            className="rounded-xl p-4 space-y-4"
            style={{
              background: "#111",
              border: "1px solid rgba(204,0,0,0.35)",
            }}
          >
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-bold text-base leading-tight flex-1">{currentEx.name}</h2>
              <span className="text-xs text-white/40 shrink-0 mt-0.5">
                {currentDoneSets.length} / {currentExSetsMax} séries
              </span>
            </div>

            {/* Bolhas de série — maiores e mais expressivas */}
            <div className="flex gap-2.5 flex-wrap">
              {Array.from({ length: currentExSetsMax }).map((_, i) => {
                const done      = currentDoneSets.includes(i);
                const isCurrent = !done && i === currentDoneSets.length;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleSetManual(i)}
                    title="Toque para corrigir"
                    style={
                      done
                        ? { background: "#22c55e", borderColor: "#22c55e", color: "#fff" }
                        : isCurrent
                        ? { background: "rgba(204,0,0,0.15)", borderColor: "#CC0000", color: "#CC0000" }
                        : { background: "transparent", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.35)" }
                    }
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${
                      isCurrent ? "animate-pulse" : ""
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : i + 1}
                  </button>
                );
              })}
            </div>

            {/* Caixa de repetições em destaque + chips */}
            <div className="grid grid-cols-3 gap-2">
              {/* Reps — destaque */}
              <div
                className="col-span-3 rounded-lg p-3 flex items-center justify-between"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Repetições alvo</p>
                  <p className="text-2xl font-black text-white mt-0.5">{parseRepsLabel(currentEx.reps)}</p>
                </div>
                {/* Badge range de tempo de descanso */}
                <div
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(204,0,0,0.2)", color: "#ff6b6b", border: "1px solid rgba(204,0,0,0.4)" }}
                >
                  {currentEx.rest ?? "—"}
                </div>
              </div>
              {/* Séries */}
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">SÉRIES</p>
                <p className="text-sm font-bold mt-0.5 text-white">{parseSetsLabel(currentEx.sets)}</p>
              </div>
              {/* Descanso */}
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">DESCANSO</p>
                <p className="text-sm font-bold mt-0.5 text-white">{currentEx.rest ?? "—"}</p>
              </div>
              {/* Cadência */}
              <div
                className="rounded-lg p-2.5 text-center"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">CADÊNCIA</p>
                <p className="text-sm font-bold mt-0.5 text-white">{currentEx.cadence ?? "—"}</p>
              </div>
            </div>

            {/* Notas com borda colorida lateral */}
            {currentEx.notes && (
              <p
                className="text-xs text-white/60 italic p-3 rounded-lg"
                style={{
                  background: "rgba(204,0,0,0.06)",
                  borderLeft: "3px solid rgba(204,0,0,0.6)",
                }}
              >
                {currentEx.notes}
              </p>
            )}
          </div>
        )}

        {/* ── Lista de exercícios com mini-dots ── */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold px-1">
            Exercícios do treino
          </p>
          {exercises.map((ex, idx) => {
            const done       = isExDone(idx);
            const isCurrent  = idx === currentExIdx;
            const exDone     = completed[`${day!.key}::${idx}`]?.length ?? 0;
            const exTotalMax = parseSetsMax(ex.sets);
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
                {/* Checkbox manual */}
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
                  {/* Mini-dots de progresso de séries */}
                  <div className="flex items-center gap-1 mt-1.5">
                    {Array.from({ length: exTotalMax }).map((_, si) => (
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
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {ex.reps ?? "—"}
                    </span>
                  </div>
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
              className="w-full h-12 text-base font-bold rounded-2xl"
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
