import { toExerciseKey, type ExerciseSessionLoad, type SessionLoadSet } from "@/lib/workoutTypes";

export interface SetRowLike {
  session_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  perceived_effort?: number | null;
  executed_at: string;
  periodization_week: number | null;
  /** Fase da periodização gravada junto da série (peso/tecnica/resistencia/deload). */
  periodization_key?: string | null;
}

export function groupSetRowsIntoSessions(rows: SetRowLike[], maxSessions = 3): ExerciseSessionLoad[] {
  const groups = new Map<string, ExerciseSessionLoad>();
  for (const row of rows) {
    if (!groups.has(row.session_id)) {
      if (groups.size >= maxSessions) continue;
      groups.set(row.session_id, { sessionId: row.session_id, executedAt: row.executed_at, periodizationWeek: row.periodization_week, sets: [] });
    }
    const group = groups.get(row.session_id);
    if (group) group.sets.push({ setNumber: row.set_number, weightKg: row.weight_kg ?? 0, reps: row.reps ?? 0, perceivedEffort: row.perceived_effort == null ? undefined : row.perceived_effort as 1 | 2 | 3 });
  }
  return Array.from(groups.values()).map(group => ({ ...group, sets: group.sets.sort((a, b) => a.setNumber - b.setNumber) }));
}

export function pickSetForPrefill(lastSets: SessionLoadSet[], setNumber: number): SessionLoadSet | null {
  if (lastSets.length === 0) return null;
  const ordered = [...lastSets].sort((a, b) => a.setNumber - b.setNumber);
  return ordered.find(s => s.setNumber === setNumber) ?? ordered.filter(s => s.setNumber < setNumber).at(-1) ?? ordered[0];
}

export interface ProgressionRow extends SetRowLike {
  exercise_name: string;
  exercise_key: string;
  swapped_from_name: string | null;
}
export type SetTrend = "up" | "down" | "same" | "new";

export interface SetComparison {
  /** Resultado de cada série da sessão atual contra a MESMA série (mesmo nº) da anterior. */
  perSet: Partial<Record<number, SetTrend>>;
  improved: number;
  regressed: number;
  same: number;
  /** Séries que existem nas duas sessões (as únicas comparáveis). */
  compared: number;
}

/**
 * Compara série a série (carga e reps) uma sessão com a anterior.
 * Mais carga = evoluiu (mesmo com menos reps); mesma carga: mais reps = evoluiu.
 * Série que só existe na sessão atual é "new" e não entra na contagem.
 */
export function compareSets(current: SessionLoadSet[], previous: SessionLoadSet[]): SetComparison {
  const prevByNumber = new Map(previous.map(s => [s.setNumber, s]));
  const out: SetComparison = { perSet: {}, improved: 0, regressed: 0, same: 0, compared: 0 };
  for (const set of current) {
    const before = prevByNumber.get(set.setNumber);
    if (!before) { out.perSet[set.setNumber] = "new"; continue; }
    const diff = set.weightKg !== before.weightKg ? set.weightKg - before.weightKg : set.reps - before.reps;
    const trend: SetTrend = diff > 0 ? "up" : diff < 0 ? "down" : "same";
    out.perSet[set.setNumber] = trend;
    out.compared++;
    if (trend === "up") out.improved++; else if (trend === "down") out.regressed++; else out.same++;
  }
  return out;
}

export interface ProgressionSession {
  sessionId: string;
  executedAt: string;
  week: number | null;
  /** Fase da periodização da sessão (null = sem fase gravada). */
  phase: string | null;
  sets: SessionLoadSet[];
  topWeightKg: number;
  /** Tendência da sessão, decidida série a série (não só pela maior carga). */
  trend: "up" | "down" | "same" | null;
  /** Diferença da MAIOR carga contra a sessão anterior comparável. */
  deltaKg: number | null;
  /** Resultado por série contra a sessão anterior comparável. */
  setTrends: Partial<Record<number, SetTrend>>;
  setsImproved: number;
  setsRegressed: number;
  setsCompared: number;
  swappedTo: string | null;
}
export interface ProgressionExercise { key: string; name: string; sessions: ProgressionSession[]; removed?: boolean }
export interface ProgressionGroup { key: string; exercises: ProgressionExercise[] }

export function buildProgression({ rows, currentByDay, dayKeys }: {
  rows: ProgressionRow[];
  currentByDay: Record<string, { name: string }[]>;
  dayKeys: string[];
}): { groups: ProgressionGroup[]; removed: ProgressionExercise[] } {
  const history = new Map<string, ProgressionExercise>();
  const bySession = new Map<string, Map<string, ProgressionSession>>();
  for (const row of rows) {
    if ((row.weight_kg ?? 0) <= 0 && (row.reps ?? 0) <= 0) continue;
    const name = row.swapped_from_name || row.exercise_name;
    const key = toExerciseKey(name);
    if (!history.has(key)) { history.set(key, { key, name, sessions: [] }); bySession.set(key, new Map()); }
    const sessions = bySession.get(key);
    if (!sessions) continue;
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, { sessionId: row.session_id, executedAt: row.executed_at, week: row.periodization_week, phase: row.periodization_key ?? null, sets: [], topWeightKg: 0, trend: null, deltaKg: null, setTrends: {}, setsImproved: 0, setsRegressed: 0, setsCompared: 0, swappedTo: row.swapped_from_name ? row.exercise_name : null });
    const session = sessions.get(row.session_id);
    if (!session) continue;
    if (row.executed_at > session.executedAt) session.executedAt = row.executed_at;
    session.sets.push({ setNumber: row.set_number, weightKg: row.weight_kg ?? 0, reps: row.reps ?? 0, perceivedEffort: row.perceived_effort == null ? undefined : row.perceived_effort as 1 | 2 | 3 });
    session.topWeightKg = Math.max(session.topWeightKg, row.weight_kg ?? 0);
    if (row.swapped_from_name) session.swappedTo = row.exercise_name;
  }
  for (const [key, exercise] of history) {
    const sessions = Array.from(bySession.get(key)?.values() ?? []).sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    for (const session of sessions) {
      session.sets.sort((a, b) => a.setNumber - b.setNumber);
      if (session.swappedTo) continue;
      // Só compara com treino da mesma semana E da mesma fase (o slot da semana é
      // posicional: se o coach reordena as semanas, o mesmo slot vira outro estímulo).
      // Registro sem fase gravada (antigo) continua comparável.
      const previous = sessions.find(other =>
        other.executedAt < session.executedAt && other.week === session.week && !other.swappedTo &&
        (other.phase == null || session.phase == null || other.phase === session.phase));
      if (previous) {
        session.deltaKg = Math.round((session.topWeightKg - previous.topWeightKg) * 100) / 100;
        const cmp = compareSets(session.sets, previous.sets);
        session.setTrends = cmp.perSet;
        session.setsImproved = cmp.improved;
        session.setsRegressed = cmp.regressed;
        session.setsCompared = cmp.compared;
        // A tendência vem das SÉRIES: mais séries melhores que piores = subiu.
        session.trend = cmp.compared === 0 ? null : cmp.improved > cmp.regressed ? "up" : cmp.regressed > cmp.improved ? "down" : "same";
      }
    }
    exercise.sessions = sessions;
  }
  const currentKeys = new Set(dayKeys.flatMap(day => (currentByDay[day] ?? []).map(ex => toExerciseKey(ex.name))));
  const groups = dayKeys.map(key => ({ key, exercises: (currentByDay[key] ?? []).filter((ex, i, list) => list.findIndex(item => toExerciseKey(item.name) === toExerciseKey(ex.name)) === i).map(ex => ({ key: toExerciseKey(ex.name), name: ex.name, sessions: history.get(toExerciseKey(ex.name))?.sessions ?? [] })) }));
  const removed = Array.from(history.values()).filter(ex => !currentKeys.has(ex.key)).map(ex => ({ ...ex, removed: true })).sort((a, b) => (b.sessions[0]?.executedAt ?? "").localeCompare(a.sessions[0]?.executedAt ?? ""));
  return { groups, removed };
}

export function sessionsForWeek(sessions: ProgressionSession[], week: number | null): ProgressionSession[] {
  return week == null ? sessions : sessions.filter(session => session.week === week);
}

export function progressSummary(sessionsNewestFirst: ProgressionSession[]): { fromKg: number; toKg: number; deltaKg: number } | null {
  const comparable = sessionsNewestFirst.filter(s => !s.swappedTo);
  if (comparable.length < 2) return null;
  const fromKg = comparable.at(-1)?.topWeightKg ?? 0;
  const toKg = comparable[0].topWeightKg;
  return { fromKg, toKg, deltaKg: Math.round((toKg - fromKg) * 100) / 100 };
}

export function formatSets(sets: SessionLoadSet[]): string {
  return sets.map(s => s.weightKg > 0 ? `${s.weightKg}kg×${s.reps}` : `${s.reps} reps`).join(" · ");
}
