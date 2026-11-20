/**
 * Cálculos do "Resumo do ciclo" na ficha do aluno (visão do coach).
 *
 * Tudo aqui é função pura (sem banco): recebe as linhas já buscadas e devolve
 * números prontos para a tela. Assim dá para testar cada regra isoladamente.
 */
import { WEEKDAYS, isMobilityExercise } from "@/lib/protocolSchema";
import { calendarWeekIndex } from "@/hooks/useCurrentPeriodizationWeek";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = Record<string, any> | null | undefined;

function hasStrengthWork(day: unknown): boolean {
  const exercises = (day as { exercises?: unknown[] } | null)?.exercises;
  return Array.isArray(exercises) && exercises.some((ex) => !isMobilityExercise(ex));
}

/**
 * Treinos PREVISTOS por semana (decisão do coach: "o número de dias de treino
 * do protocolo por semana").
 *
 * 1. Se o coach ligou os treinos aos dias da semana (weekDays), conta os dias
 *    da semana que apontam para um treino com exercício de força.
 * 2. Senão, conta os treinos (A/B/C…) com exercício de força.
 * Treino só de mobilidade não entra. null = protocolo sem treino.
 */
export function plannedSessionsPerWeek(payload: AnyPayload): number | null {
  const workouts: unknown[] = Array.isArray(payload?.workouts) ? payload!.workouts : [];
  const strengthKeys = new Set(
    workouts.filter(hasStrengthWork).map((d) => String((d as { key?: unknown }).key ?? "")),
  );
  const weekDays: Record<string, string> = payload?.weekDays ?? {};
  const linked = WEEKDAYS.filter((d) => {
    const wk = weekDays[d.key];
    return !!wk && wk !== "REST" && wk !== "rest" && strengthKeys.has(wk);
  }).length;
  if (linked > 0) return linked;
  return strengthKeys.size > 0 ? strengthKeys.size : null;
}

/** Segunda-feira 00:00 (horário do aparelho) da semana de `d`. */
export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = domingo
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  return out;
}

function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface SessionLite {
  started_at: string;
  ended_at: string | null;
  /** Chave do treino (SC_… = Semana Corrida). */
  workout_key?: string | null;
  /** true quando a sessão tem ao menos uma série concluída. */
  hasCompletedSets?: boolean;
}

/** Sessão que conta como "treinou": terminou ou registrou série concluída. */
export function sessionCounts(s: SessionLite): boolean {
  return !!s.ended_at || !!s.hasCompletedSets;
}

export interface WeekAdherence {
  weekStart: Date;
  /** Dias distintos com treino registrado (duas sessões no mesmo dia = 1). */
  done: number;
  planned: number;
  isCurrent: boolean;
  /** Semana em que a aluna usou a Semana Corrida (previsto = o do plano). */
  busy?: boolean;
}

/**
 * Adesão real por semana (segunda a domingo): dias com treino registrado ÷
 * treinos previstos. Devolve da semana mais antiga para a atual.
 *
 * Limite conhecido: só enxerga treino registrado no app (Modo Treino). Treino
 * feito sem abrir o Modo Treino não aparece aqui.
 */
export function weeklyTrainingAdherence(
  sessions: SessionLite[],
  planned: number,
  weeks = 4,
  now: Date = new Date(),
  /** Treinos por semana da Semana Corrida; semanas em que ela usou contam por ele. */
  busyPlanned?: number | null,
): WeekAdherence[] {
  const currentStart = startOfWeekMonday(now);
  const out: WeekAdherence[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(currentStart);
    ws.setDate(ws.getDate() - 7 * i);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    const days = new Set<string>();
    for (const s of sessions) {
      if (!sessionCounts(s)) continue;
      const t = new Date(s.started_at);
      if (t >= ws && t < we) days.add(dayKeyLocal(t));
    }
    const busy = !!busyPlanned && sessions.some((s) => {
      if (!s.workout_key || !s.workout_key.startsWith("SC_")) return false;
      const t = new Date(s.started_at);
      return t >= ws && t < we;
    });
    out.push({ weekStart: ws, done: days.size, planned: busy ? busyPlanned! : planned, isCurrent: i === 0, ...(busy ? { busy: true } : {}) });
  }
  return out;
}

/** Soma das semanas COMPLETAS (sem a atual, que ainda está em andamento). */
export function adherenceTotals(weeks: WeekAdherence[]): { done: number; planned: number; pct: number | null } {
  const closed = weeks.filter((w) => !w.isCurrent);
  // Mais treino que o previsto numa semana não "compensa" outra semana fraca.
  const done = closed.reduce((a, w) => a + Math.min(w.done, w.planned), 0);
  const planned = closed.reduce((a, w) => a + w.planned, 0);
  return { done, planned, pct: planned > 0 ? Math.round((done / planned) * 100) : null };
}

export interface MealCheckLite {
  date: string; // YYYY-MM-DD
  meal_index: number;
  checked: boolean;
}

/** Refeições do plano num dia de treino (as de descanso não somam). */
export function plannedMealsPerDay(payload: AnyPayload): number {
  const meals: unknown[] = Array.isArray(payload?.meals) ? payload!.meals : [];
  return meals.filter((m) => (m as { day_type?: string })?.day_type !== "rest").length;
}

export interface MealAdherence {
  /** Dias (dos últimos `days`) com pelo menos uma refeição marcada. */
  daysWithChecks: number;
  days: number;
  /** Média de refeições marcadas por dia, considerando todos os `days`. */
  avgPerDay: number;
}

/**
 * Refeições marcadas nos últimos `days` dias COMPLETOS (até ontem; hoje ainda
 * está em andamento e puxaria a média para baixo de manhã).
 */
export function mealAdherence(rows: MealCheckLite[], days = 7, now: Date = new Date()): MealAdherence {
  const keys = new Set<string>();
  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.add(dayKeyLocal(d));
  }
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.checked || !keys.has(r.date)) continue;
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);
  }
  const total = [...perDay.values()].reduce((a, b) => a + b, 0);
  return {
    daysWithChecks: perDay.size,
    days,
    avgPerDay: Math.round((total / days) * 10) / 10,
  };
}

/** Semanas inteiras desde uma data (0 = esta semana). */
export function weeksSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const a = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((b - a) / (7 * 86_400_000)));
}

/**
 * Semana da periodização em que a aluna está hoje (1..4), pela MESMA regra da
 * tela dela (loop pelo calendário a partir da 1ª abertura do protocolo).
 * null quando a periodização está desligada.
 */
export function currentPeriodizationWeekNumber(
  payload: AnyPayload,
  firstViewedAt: string | null | undefined,
  now: Date = new Date(),
): { week: number; total: number; label: string | null } | null {
  const per = payload?.periodization;
  if (!per?.enabled) return null;
  const weeks: unknown[] = Array.isArray(per.weeks) && per.weeks.length > 0 ? per.weeks : [{}, {}, {}, {}];
  const idx = calendarWeekIndex(firstViewedAt, weeks.length, now) ?? 0;
  const label = (weeks[idx] as { label?: string } | undefined)?.label ?? null;
  return { week: idx + 1, total: weeks.length, label };
}
