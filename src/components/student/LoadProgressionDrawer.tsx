import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, TrendingUp, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { isMobilityExercise } from "@/lib/protocolSchema";
import { buildProgression, formatSets, progressSummary, sessionsForWeek, type ProgressionExercise, type ProgressionRow, type ProgressionSession } from "@/lib/loadProgression";
import type { SessionLoadSet } from "@/lib/workoutTypes";

interface Props {
  userId: string;
  workouts: { key: string; exercises?: { name: string }[] }[];
  periodizationEnabled: boolean;
  currentWeek: number;
  todayWorkoutKey?: string | null;
}

const fmtDate = (date: string) => new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

// Resumo da evolução contra o treino anterior, série a série ("↑ 3/4 séries · +2.5kg").
function Trend({ session }: { session: ProgressionSession }) {
  if (!session.trend) return null;
  const { setsImproved: up, setsRegressed: down, setsCompared: total } = session;
  const sets = session.trend === "up" ? `↑ ${up}/${total} séries` : session.trend === "down" ? `↓ ${down}/${total} séries` : "igual";
  const kg = session.deltaKg ? ` · ${session.deltaKg > 0 ? "+" : ""}${session.deltaKg}kg` : "";
  return <span className={session.trend === "up" ? "text-emerald-500" : session.trend === "down" ? "text-amber-500" : "text-muted-foreground"}>{sets}{kg}</span>;
}

const TREND_MARK: Record<string, { mark: string; cls: string }> = {
  up: { mark: "↑", cls: "text-emerald-500" },
  down: { mark: "↓", cls: "text-amber-500" },
};

// Todas as séries do treino, cada uma marcada contra a mesma série do treino anterior.
function SetsLine({ session }: { session: ProgressionSession }) {
  return <p className="text-muted-foreground">
    {session.sets.map((set: SessionLoadSet, i) => {
      const t = TREND_MARK[session.setTrends[set.setNumber] ?? ""];
      return <span key={set.setNumber}>{i > 0 && " · "}{formatSets([set])}{t && <span className={t.cls} aria-label={t.mark === "↑" ? "evoluiu" : "caiu"}>{t.mark}</span>}</span>;
    })}
  </p>;
}

function ExerciseItem({ exercise, week, value }: { exercise: ProgressionExercise; week: number | null; value: string }) {
  const sessions = sessionsForWeek(exercise.sessions, week);
  const latest = sessions[0];
  const summary = progressSummary(sessions);
  return <AccordionItem value={value} className={exercise.removed ? "border border-destructive/40 bg-destructive/5 px-3 rounded-md" : "border-b border-border"}>
    <AccordionTrigger className="text-left hover:no-underline gap-2">
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold break-words ${exercise.removed ? "text-destructive" : "text-foreground"}`}>{exercise.name}</div>
        {exercise.removed && <span className="inline-flex gap-1 items-center text-xs text-destructive"><AlertTriangle className="w-3 h-3" />Fora do treino atual</span>}
        <div className="text-xs text-muted-foreground">{latest ? `Último: ${latest.topWeightKg > 0 ? `${latest.topWeightKg}kg` : "peso corporal"} · ${fmtDate(latest.executedAt)}` : "Sem registros"}</div>
      </div>
      {latest && <span className="text-xs shrink-0"><Trend session={latest} /></span>}
    </AccordionTrigger>
    <AccordionContent className="space-y-2 pb-4">
      {summary && <p className={`text-xs font-semibold ${summary.deltaKg > 0 ? "text-emerald-500" : summary.deltaKg < 0 ? "text-amber-500" : "text-muted-foreground"}`}>Maior carga: {summary.fromKg}kg → {summary.toKg}kg ({summary.deltaKg > 0 ? "+" : ""}{summary.deltaKg}kg)</p>}
      {sessions.length === 0 && <p className="text-xs text-muted-foreground">{exercise.sessions.length ? 'Sem registros nesta semana — veja "Todas as semanas".' : "Ainda sem cargas registradas."}</p>}
      {sessions.slice(0, 12).map(session => <div key={session.sessionId} className="border-t border-border/50 pt-2 text-xs space-y-1">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold">{fmtDate(session.executedAt)}{session.week != null && ` · Sem. ${session.week + 1}`}</span><Trend session={session} /></div>
        <SetsLine session={session} />
        {session.swappedTo && <p className="text-muted-foreground">Executado com: {session.swappedTo}</p>}
      </div>)}
      {sessions.length > 12 && <p className="text-xs text-muted-foreground">Mostrando os 12 treinos mais recentes.</p>}
    </AccordionContent>
  </AccordionItem>;
}

export function LoadProgressionDrawer({ userId, workouts, periodizationEnabled, currentWeek, todayWorkoutKey }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProgressionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [weekOnly, setWeekOnly] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const collected: ProgressionRow[] = [];
      let from = 0;
      while (from < 5000) {
        const { data, error: fetchError } = await supabase.from("workout_sets")
          .select("id, session_id, exercise_name, exercise_key, swapped_from_name, set_number, weight_kg, reps, executed_at, periodization_week, periodization_key")
          .eq("user_id", userId).eq("completed", true).eq("skipped", false)
          .order("executed_at", { ascending: false }).order("id", { ascending: true })
          .range(from, Math.min(from + 999, 4999));
        if (fetchError) throw fetchError;
        if (!data?.length) break;
        collected.push(...data);
        from += data.length;
      }
      if (!cancelled) { setRows(collected); setTruncated(collected.length >= 5000); }
    })().catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, userId]);

  const { groups, removed } = useMemo(() => buildProgression({
    rows,
    dayKeys: workouts.map(workout => workout.key),
    currentByDay: Object.fromEntries(workouts.map(workout => [workout.key, (workout.exercises ?? []).filter(ex => !isMobilityExercise(ex))])),
  }), [rows, workouts]);
  const week = periodizationEnabled && weekOnly ? currentWeek : null;
  const trigger = <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full h-auto min-h-16 justify-between text-left px-4 py-3 gap-3 border-border bg-card">
    <TrendingUp className="w-5 h-5 text-primary shrink-0" />
    <span className="flex-1 min-w-0"><span className="block font-bold whitespace-normal">Como está minha progressão de carga?</span><span className="block text-xs text-muted-foreground font-normal whitespace-normal">Veja como suas cargas evoluíram em cada exercício.</span></span>
    <ChevronRight className="w-4 h-4 shrink-0" />
  </Button>;

  const body = <div className="space-y-4 pb-6">
    {periodizationEnabled && <div role="group" aria-label="Filtro de semana" className="flex gap-1 rounded-md bg-muted/40 p-1">
      <Button type="button" variant={weekOnly ? "secondary" : "ghost"} size="sm" aria-pressed={weekOnly} onClick={() => setWeekOnly(true)} className="flex-1 text-xs h-auto min-h-9 whitespace-normal">Semana atual · Sem. {currentWeek + 1}</Button>
      <Button type="button" variant={!weekOnly ? "secondary" : "ghost"} size="sm" aria-pressed={!weekOnly} onClick={() => setWeekOnly(false)} className="flex-1 text-xs h-auto min-h-9 whitespace-normal">Todas as semanas</Button>
    </div>}
    {truncated && !loading && !error && <p className="text-xs text-muted-foreground">Histórico muito longo: mostrando os registros mais recentes.</p>}
    {loading ? <div className="flex justify-center py-10" role="status"><Loader2 className="w-5 h-5 animate-spin text-primary" /><span className="sr-only">Carregando</span></div> : error ? <p className="text-sm text-muted-foreground">Não foi possível carregar seu histórico agora. Tente novamente em instantes.</p> : <>
      {groups.every(g => !g.exercises.length) && !removed.length && <p className="text-sm text-muted-foreground">Nenhum exercício neste treino.</p>}
      {groups.filter(group => group.exercises.length).map(group => <section key={group.key} className="space-y-1">
        <h3 className="text-sm font-bold flex items-center gap-2">Treino {group.key}{group.key === todayWorkoutKey && <Badge>Hoje</Badge>}</h3>
        <Accordion type="single" collapsible>{group.exercises.map(exercise => <ExerciseItem key={exercise.key} exercise={exercise} week={week} value={`${group.key}:${exercise.key}`} />)}</Accordion>
      </section>)}
      {removed.length > 0 && <section aria-label="Exercícios que saíram do treino" className="space-y-1"><h3 className="text-sm font-bold text-destructive">Saíram do treino</h3><Accordion type="single" collapsible>{removed.map(exercise => <ExerciseItem key={exercise.key} exercise={exercise} week={week} value={`removed:${exercise.key}`} />)}</Accordion></section>}
    </>}
  </div>;

  return <>{trigger}{isMobile ? <Drawer open={open} onOpenChange={setOpen}><DrawerContent className="max-h-[85dvh] flex flex-col"><DrawerHeader className="flex flex-row items-center justify-between"><DrawerTitle>Progressão de carga</DrawerTitle><Button type="button" variant="ghost" size="icon" aria-label="Fechar progressão de carga" onClick={() => setOpen(false)}><X className="w-5 h-5" /></Button></DrawerHeader><div className="px-4 overflow-y-auto min-h-0">{body}</div></DrawerContent></Drawer> : <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl max-h-[85dvh] flex flex-col"><DialogHeader><DialogTitle>Progressão de carga</DialogTitle><DialogDescription className="sr-only">Histórico de cargas por exercício</DialogDescription></DialogHeader><div className="overflow-y-auto min-h-0 pr-1">{body}</div></DialogContent></Dialog>}</>;
}

export default LoadProgressionDrawer;