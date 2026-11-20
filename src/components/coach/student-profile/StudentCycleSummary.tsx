/**
 * Aba "Resumo" da ficha do aluno: como está indo o protocolo atual, num
 * relance. Responde as perguntas que antes exigiam abrir 4 telas:
 * há quanto tempo está publicado, em que semana da periodização a aluna
 * está, se está treinando o previsto, se marca as refeições, se o último
 * check-in já foi respondido e o que ela deixou de recado nos treinos.
 */
import { useMemo } from "react";
import { Loader2, Dumbbell, UtensilsCrossed, MessageSquareReply, CalendarDays, CheckCircle2, StickyNote, Eye, Target, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStudentCycleSummary } from "@/hooks/useStudentCycleSummary";
import {
  adherenceTotals, currentPeriodizationWeekNumber, mealAdherence, plannedMealsPerDay,
  plannedSessionsPerWeek, weeklyTrainingAdherence, weeksSince,
} from "@/lib/coachCycleSummary";
import { waitingLabel } from "@/lib/coachPending";
import { FELT_LABEL, summarizeFeel, type FeltRegion } from "@/lib/exerciseFeel";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtLong = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Card({ icon, title, children, testId }: { icon: React.ReactNode; title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 space-y-2" data-testid={testId}>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{title}
      </h3>
      {children}
    </section>
  );
}

function pctClass(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function StudentCycleSummary({
  studentId, onReply, onEditProtocol, onPreviewProtocol,
}: {
  studentId: string;
  onReply: () => void;
  onEditProtocol: () => void;
  onPreviewProtocol?: () => void;
}) {
  const { data, isLoading, error } = useStudentCycleSummary(studentId);

  const view = useMemo(() => {
    if (!data) return null;
    const payload = data.protocol?.payload ?? null;
    const planned = plannedSessionsPerWeek(payload);
    const weeks = planned ? weeklyTrainingAdherence(data.sessions, planned, 4, new Date(), data.busyWeek?.sessionsPerWeek ?? null) : [];
    const totals = adherenceTotals(weeks);
    const current = weeks.find((w) => w.isCurrent) ?? null;
    return {
      planned,
      weeks,
      totals,
      current,
      perWeek: currentPeriodizationWeekNumber(payload, data.protocol?.firstViewedAt),
      meals: mealAdherence(data.meals, 7),
      mealsPlanned: plannedMealsPerDay(payload),
      publishedWeeks: weeksSince(data.protocol?.createdAt),
      feel: data.feel ? summarizeFeel(data.feel).slice(0, 6) : null,
    };
  }, [data]);

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }
  if (error || !data || !view) {
    return <p className="text-sm text-muted-foreground text-center py-8">Não foi possível carregar o resumo agora.</p>;
  }

  const { protocol, lastCheckin, notes } = data;

  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="cycle-summary">
      <Card icon={<CalendarDays className="w-3.5 h-3.5" />} title="Protocolo" testId="summary-protocol">
        {protocol ? (
          <div className="space-y-1.5 text-sm">
            <p>
              Publicado em <strong>{fmtLong(protocol.createdAt)}</strong>
              {view.publishedWeeks != null && (
                <span className="text-muted-foreground"> · {view.publishedWeeks === 0 ? "esta semana" : `há ${view.publishedWeeks} semana${view.publishedWeeks === 1 ? "" : "s"}`}</span>
              )}
            </p>
            {protocol.updatedAt && fmtLong(protocol.updatedAt) !== fmtLong(protocol.createdAt) && (
              <p className="text-xs text-muted-foreground">Última atualização: {fmtLong(protocol.updatedAt)}</p>
            )}
            {!protocol.firstViewedAt && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">A aluna ainda não abriu este protocolo.</p>
            )}
            {view.perWeek && (
              <p data-testid="summary-periodization">
                Periodização: <strong>Semana {view.perWeek.week} de {view.perWeek.total}</strong>
                {view.perWeek.label && <span className="block text-xs text-muted-foreground">{view.perWeek.label}</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-8" onClick={onEditProtocol}>
                <Dumbbell className="w-3.5 h-3.5 mr-1.5" /> Editar protocolo
              </Button>
              {onPreviewProtocol && (
                <Button size="sm" variant="ghost" className="h-8" onClick={onPreviewProtocol}>
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Ver como a aluna vê
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum protocolo publicado ainda.</p>
            <Button size="sm" variant="outline" className="h-8" onClick={onEditProtocol}>
              <Dumbbell className="w-3.5 h-3.5 mr-1.5" /> Montar protocolo
            </Button>
          </div>
        )}
      </Card>

      <Card icon={<MessageSquareReply className="w-3.5 h-3.5" />} title="Check-in" testId="summary-checkin">
        {lastCheckin ? (
          <div className="space-y-1.5 text-sm">
            <p>Último enviado {waitingLabel(lastCheckin.submittedAt)} <span className="text-muted-foreground">({fmtLong(lastCheckin.submittedAt)})</span></p>
            {lastCheckin.answered ? (
              <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Respondido{lastCheckin.readByStudent ? " · aluna já viu" : " · aluna ainda não viu"}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Aguardando sua resposta</p>
                <Button size="sm" className="h-8 bg-amber-500 hover:bg-amber-600 text-white" onClick={onReply}>
                  <MessageSquareReply className="w-3.5 h-3.5 mr-1.5" /> Responder agora
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum check-in enviado ainda.</p>
        )}
      </Card>

      <Card icon={<Dumbbell className="w-3.5 h-3.5" />} title="Treinos feitos × previstos" testId="summary-training">
        {!view.planned ? (
          <p className="text-sm text-muted-foreground">O protocolo não tem treino de força para comparar.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {data.busyWeek?.enabled && (
              <p className="text-xs rounded-md bg-primary/5 border border-primary/20 px-2 py-1" data-testid="summary-busy-week">
                Semana Corrida ({data.busyWeek.planName || "plano"}):{" "}
                {data.busyWeek.studentOn
                  ? <strong>usando desde {data.busyWeek.since ? fmt(data.busyWeek.since) : "agora"}</strong>
                  : "liberada, ela está na rotina normal"}
              </p>
            )}
            {view.current && (
              <p>
                Esta semana: <strong>{view.current.done} de {view.current.planned}</strong>
                {view.current.busy && <span className="text-xs text-muted-foreground"> · Semana Corrida</span>}
              </p>
            )}
            <p>
              Últimas 3 semanas:{" "}
              <strong className={pctClass(view.totals.pct)} data-testid="summary-adherence-pct">
                {view.totals.done} de {view.totals.planned}
                {view.totals.pct != null && ` (${view.totals.pct}%)`}
              </strong>
            </p>
            <div className="flex items-end gap-1.5 h-12" aria-hidden>
              {view.weeks.map((w) => {
                const ratio = Math.min(1, w.done / Math.max(1, w.planned));
                return (
                  <div key={w.weekStart.toISOString()} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full rounded-sm bg-muted relative h-9 overflow-hidden">
                      <div
                        className={cn("absolute bottom-0 inset-x-0 rounded-sm", w.isCurrent ? "bg-primary/50" : "bg-primary")}
                        style={{ height: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{w.isCurrent ? "atual" : fmt(w.weekStart.toISOString())}{w.busy ? " · SC" : ""}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Previsto: {view.planned} treino{view.planned === 1 ? "" : "s"} por semana
              {data.busyWeek ? ` (${data.busyWeek.sessionsPerWeek} nas semanas em que ela usou a Semana Corrida — marcadas "SC")` : ""}. Conta só treino registrado no app.
            </p>
          </div>
        )}
      </Card>

      <Card icon={<UtensilsCrossed className="w-3.5 h-3.5" />} title="Dieta (refeições marcadas)" testId="summary-diet">
        {view.meals.daysWithChecks === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma refeição marcada nos últimos 7 dias.</p>
        ) : (
          <div className="space-y-1 text-sm">
            <p>Marcou refeições em <strong>{view.meals.daysWithChecks} dos últimos 7 dias</strong></p>
            <p>
              Média de <strong>{view.meals.avgPerDay.toLocaleString("pt-BR")}</strong> por dia
              {view.mealsPlanned > 0 && <span className="text-muted-foreground"> (o plano tem {view.mealsPlanned})</span>}
            </p>
          </div>
        )}
      </Card>

      {view.feel && (
        <div className="sm:col-span-2">
          <Card icon={<Target className="w-3.5 h-3.5" />} title="Onde a aluna sente (exercícios de glúteo)" testId="summary-feel">
            {view.feel.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda sem respostas. Aparece quando a aluna marca "onde sentiu mais" no fim do exercício.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {view.feel.map((f) => (
                  <li key={f.exerciseKey} className="text-sm space-y-1" data-testid={`feel-${f.exerciseKey}`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{f.exerciseName}</span>
                      {(Object.entries(f.counts) as [FeltRegion, number][])
                        .sort((a, b) => b[1] - a[1])
                        .map(([region, n]) => (
                          <span
                            key={region}
                            className={cn(
                              "text-[11px] px-1.5 py-px rounded border",
                              region === f.compensation
                                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {FELT_LABEL[region]} {n}
                          </span>
                        ))}
                      <span className="text-[11px] text-muted-foreground">(últimas {f.total})</span>
                    </div>
                    {f.compensation && f.hint && (
                      <p className="text-xs text-amber-800 dark:text-amber-300 flex gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span><strong>{FELT_LABEL[f.compensation]} dominando.</strong> {f.hint}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <div className="sm:col-span-2">
        <Card icon={<StickyNote className="w-3.5 h-3.5" />} title="Recados da aluna nos treinos" testId="summary-notes">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum recado nos últimos 35 dias.</p>
          ) : (
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n.sessionId} className="text-sm">
                  <span className="text-xs text-muted-foreground">{fmt(n.date)}{n.workoutLabel ? ` · ${n.workoutLabel}` : ""}: </span>
                  <span className="whitespace-pre-wrap">{n.note}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
