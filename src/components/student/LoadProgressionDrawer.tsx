import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Minus, TrendingDown, TrendingUp, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isMobilityExercise } from "@/lib/protocolSchema";
import { periodizationKeyLabel } from "@/lib/periodizationKey";
import { buildProgression, describeChange, formatKg, formatLoad, formatSet, heaviestLoad, progressSummary, sessionsForWeek, type ChangeKind, type ProgressionExercise, type ProgressionRow, type ProgressionSession } from "@/lib/loadProgression";

interface Props {
  userId: string;
  workouts: { key: string; exercises?: { name: string }[] }[];
  periodizationEnabled: boolean;
  currentWeek: number;
  todayWorkoutKey?: string | null;
}

const fmtDate = (date: string) => new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtTime = (date: string) => new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Cor + ícone + texto: o aluno nunca depende só da cor para entender.
const TONE: Record<ChangeKind, { cls: string; Icon: typeof TrendingUp }> = {
  up: { cls: "text-emerald-500", Icon: TrendingUp },
  down: { cls: "text-amber-500", Icon: TrendingDown },
  same: { cls: "text-muted-foreground", Icon: Minus },
};

// Selo curto na linha do exercício: "Evoluiu +2 kg", "Manteve", "Carga menor −2 kg"...
function StatusBadge({ session }: { session: ProgressionSession }) {
  if (session.swappedTo) return <span className="text-muted-foreground">Exercício trocado</span>;
  if (!session.change) return <span className="text-muted-foreground">Primeiro registro</span>;
  const { tone, badge } = describeChange(session.change);
  const { cls, Icon } = TONE[tone];
  return <span className={cn("inline-flex items-center gap-1 font-semibold", cls)}><Icon className="w-3.5 h-3.5" aria-hidden="true" />{badge}</span>;
}

// Cada série é uma etiqueta "carga × repetições"; a mais pesada (a que foi comparada) fica destacada.
function SetChips({ session }: { session: ProgressionSession }) {
  return <ul className="flex flex-wrap gap-1.5" aria-label="Suas séries: carga × repetições">
    {session.sets.map(set => {
      const isBest = !session.swappedTo && set === session.best;
      return <li key={set.setNumber} className={cn("rounded-md border px-2 py-1", isBest ? "border-primary/60 bg-primary/10 font-semibold text-foreground" : "border-border text-muted-foreground")}>
        {formatSet(set)}{isBest && <span className="sr-only"> (série mais pesada)</span>}
      </li>;
    })}
  </ul>;
}

function SessionCard({ session, showTime, showWeek }: { session: ProgressionSession; showTime: boolean; showWeek: boolean }) {
  const text = session.change ? describeChange(session.change) : null;
  const tone = text ? TONE[text.tone] : null;
  const compared = session.comparedWith;
  // Se o treino anterior foi no mesmo dia, mostra a hora para o aluno distinguir um do outro.
  const comparedSameDay = compared ? fmtDate(compared.executedAt) === fmtDate(session.executedAt) : false;
  return <div className="border-t border-border/50 pt-3 text-xs space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold">{fmtDate(session.executedAt)}{showTime && ` · ${fmtTime(session.executedAt)}`}</span>
      {showWeek && session.week != null && <span className="text-muted-foreground">Sem. {session.week + 1}</span>}
    </div>
    {session.swappedTo
      ? <p className="text-muted-foreground">Feito com {session.swappedTo} (exercício trocado). Esse treino não entra na comparação.</p>
      : text && tone
        ? <p className={cn("flex items-start gap-1.5 font-semibold", tone.cls)}><tone.Icon className="w-4 h-4 shrink-0" aria-hidden="true" /><span>{text.sentence}</span></p>
        : <p className="text-muted-foreground">{session.week != null ? "Primeiro registro desta semana do ciclo. " : "Primeiro registro. "}Ainda não há treino anterior para comparar.</p>}
    {compared && !session.swappedTo && <p className="text-muted-foreground">Comparado com o treino de {fmtDate(compared.executedAt)}{comparedSameDay && ` · ${fmtTime(compared.executedAt)}`}</p>}
    <SetChips session={session} />
  </div>;
}

// Na aba "Todas as semanas" os treinos ficam agrupados por semana do ciclo (cada semana tem seu próprio objetivo).
function groupByWeek(sessions: ProgressionSession[]): { week: number | null; sessions: ProgressionSession[] }[] {
  const map = new Map<number | null, ProgressionSession[]>();
  for (const session of sessions) map.set(session.week, [...(map.get(session.week) ?? []), session]);
  return Array.from(map, ([week, list]) => ({ week, sessions: list })).sort((a, b) => (a.week == null ? 1 : b.week == null ? -1 : a.week - b.week));
}

function ExerciseItem({ exercise, week, value }: { exercise: ProgressionExercise; week: number | null; value: string }) {
  const sessions = sessionsForWeek(exercise.sessions, week);
  const latest = sessions[0];
  const shown = sessions.slice(0, 12);
  // Semanas diferentes têm objetivos diferentes: nunca somamos "do primeiro ao último" entre elas.
  const mixedWeeks = new Set(sessions.map(s => s.week)).size > 1;
  const rawSummary = mixedWeeks ? null : progressSummary(sessions);
  const summary = rawSummary && (rawSummary.fromKg > 0 || rawSummary.toKg > 0) ? rawSummary : null;
  const heaviest = mixedWeeks ? heaviestLoad(sessions) : null;
  const dateCount = new Map<string, number>();
  for (const session of shown) { const day = fmtDate(session.executedAt); dateCount.set(day, (dateCount.get(day) ?? 0) + 1); }
  const card = (session: ProgressionSession, showWeek: boolean) => <SessionCard key={session.sessionId} session={session} showTime={(dateCount.get(fmtDate(session.executedAt)) ?? 0) > 1} showWeek={showWeek} />;
  return <AccordionItem value={value} className={exercise.removed ? "border border-destructive/40 bg-destructive/5 px-3 rounded-md" : "border-b border-border"}>
    <AccordionTrigger className="text-left hover:no-underline gap-2">
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold break-words ${exercise.removed ? "text-destructive" : "text-foreground"}`}>{exercise.name}</div>
        {exercise.removed && <span className="inline-flex gap-1 items-center text-xs text-destructive"><AlertTriangle className="w-3 h-3" />Fora do treino atual</span>}
        <div className="text-xs text-muted-foreground">{latest
          ? `Última vez: ${latest.swappedTo ? `feito com ${latest.swappedTo}` : latest.best ? formatSet(latest.best) : "sem carga"} · ${fmtDate(latest.executedAt)}`
          : "Sem registros"}</div>
      </div>
      {latest && <span className="text-xs shrink-0 text-right"><StatusBadge session={latest} /></span>}
    </AccordionTrigger>
    <AccordionContent className="space-y-3 pb-4">
      {summary && <p className={cn("text-xs font-semibold", summary.deltaKg > 0 ? "text-emerald-500" : summary.deltaKg < 0 ? "text-amber-500" : "text-muted-foreground")}>
        {summary.deltaKg === 0
          ? `Sua maior carga continua a mesma: ${formatLoad(summary.toKg)}.`
          : `${week != null ? "Nesta semana do ciclo, do primeiro registro até hoje" : "Do primeiro registro até hoje"}: ${formatLoad(summary.fromKg)} → ${formatLoad(summary.toKg)} (${summary.deltaKg > 0 ? "+" : "−"}${formatKg(Math.abs(summary.deltaKg))}).`}
      </p>}
      {heaviest && <p className="text-xs font-semibold text-foreground">Sua maior carga já registrada: {formatKg(heaviest.weightKg)} ({fmtDate(heaviest.executedAt)}).</p>}
      {sessions.length === 0 && <p className="text-xs text-muted-foreground">{exercise.sessions.length ? 'Sem registros nesta semana — veja "Todas as semanas".' : "Ainda sem cargas registradas."}</p>}
      {mixedWeeks
        ? groupByWeek(shown).map(group => {
          const phase = periodizationKeyLabel(group.sessions[0]?.phase);
          return <section key={group.week ?? "none"} className="space-y-3">
            <h4 className="text-xs font-bold text-foreground pt-1">{group.week != null ? `Semana ${group.week + 1}${phase ? ` · ${phase}` : ""}` : "Treinos sem semana definida"}</h4>
            {group.sessions.map(session => card(session, false))}
          </section>;
        })
        : shown.map(session => card(session, true))}
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
    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
      <p className="font-semibold text-foreground">Como ler esta tela</p>
      <p>{periodizationEnabled
        ? "Comparamos a sua série mais pesada com a da última vez que você treinou nesta mesma semana do ciclo, porque cada semana tem um objetivo diferente."
        : "Comparamos a sua série mais pesada com a do treino anterior."}</p>
      <p><span className="font-semibold text-foreground">Evoluiu</span> = mais carga, ou a mesma carga com mais repetições.</p>
      <p>Cada etiqueta é uma série (carga × repetições). A destacada é a mais pesada.</p>
    </div>
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

  return <>{trigger}{isMobile ? <Drawer open={open} onOpenChange={setOpen}><DrawerContent className="max-h-[85dvh] flex flex-col"><DrawerHeader className="flex flex-row items-center justify-between"><DrawerTitle>Progressão de carga</DrawerTitle><Button type="button" variant="ghost" size="icon" aria-label="Fechar progressão de carga" onClick={() => setOpen(false)}><X className="w-5 h-5" /></Button></DrawerHeader><div className="px-4 overflow-y-auto min-h-0">{body}</div></DrawerContent></Drawer> : <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl max-h-[85dvh] flex flex-col"><DialogHeader><DialogTitle>Progressão de carga</DialogTitle><DialogDescription className="sr-only">Compare suas cargas com a última vez que você fez cada exercício</DialogDescription></DialogHeader><div className="overflow-y-auto min-h-0 pr-1">{body}</div></DialogContent></Dialog>}</>;
}

export default LoadProgressionDrawer;
