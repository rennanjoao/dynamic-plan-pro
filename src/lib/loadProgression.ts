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

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Regra única de comparação ────────────────────────────────────────────────
// Cada treino é resumido por UMA série: a mais pesada (com a mesma carga, a de mais
// repetições). Essa série é comparada com a série mais pesada do treino anterior.
// Aquecimento, séries progressivas e treinos com número de séries diferente não
// atrapalham, e o selo ("Evoluiu") e os números (+2 kg) saem sempre da mesma conta.

/** Série que representa o treino. Tentativa com 0 reps só vale se não houver outra série. */
export function pickBestSet(sets: SessionLoadSet[]): SessionLoadSet | null {
  const done = sets.filter(s => s.reps > 0);
  const pool = done.length ? done : sets;
  let best: SessionLoadSet | null = null;
  for (const set of pool) {
    if (!best || set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps)) best = set;
  }
  return best;
}

export type ChangeKind = "up" | "down" | "same";
/** O que decidiu: a carga (kg) ou, com a mesma carga, as repetições. */
export type ChangeBasis = "kg" | "reps" | "none";

export interface SessionChange {
  kind: ChangeKind;
  basis: ChangeBasis;
  /** Variação da carga da série mais pesada (kg). */
  deltaKg: number;
  /** Variação das repetições da série mais pesada. */
  deltaReps: number;
  /** Série mais pesada do treino anterior. */
  from: SessionLoadSet;
  /** Série mais pesada do treino atual. */
  to: SessionLoadSet;
}

/** Mais carga = evoluiu (mesmo com menos reps). Mesma carga: mais reps = evoluiu. */
export function compareBest(current: SessionLoadSet, previous: SessionLoadSet): SessionChange {
  const deltaKg = round2(current.weightKg - previous.weightKg);
  const deltaReps = current.reps - previous.reps;
  let kind: ChangeKind = "same";
  let basis: ChangeBasis = "none";
  if (deltaKg !== 0) { kind = deltaKg > 0 ? "up" : "down"; basis = "kg"; }
  else if (deltaReps !== 0) { kind = deltaReps > 0 ? "up" : "down"; basis = "reps"; }
  return { kind, basis, deltaKg, deltaReps, from: previous, to: current };
}

export interface ProgressionSession {
  sessionId: string;
  executedAt: string;
  week: number | null;
  /** Fase da periodização da sessão (null = sem fase gravada). */
  phase: string | null;
  sets: SessionLoadSet[];
  /** Série mais pesada do treino (a que entra na comparação). */
  best: SessionLoadSet | null;
  /** Carga da série mais pesada (0 = peso corporal). */
  topWeightKg: number;
  /** Resultado contra o treino anterior comparável (null = primeiro registro ou exercício trocado). */
  change: SessionChange | null;
  /** Com qual treino anterior esta sessão foi comparada. */
  comparedWith: { executedAt: string; week: number | null } | null;
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
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, { sessionId: row.session_id, executedAt: row.executed_at, week: row.periodization_week, phase: row.periodization_key ?? null, sets: [], best: null, topWeightKg: 0, change: null, comparedWith: null, swappedTo: row.swapped_from_name ? row.exercise_name : null });
    const session = sessions.get(row.session_id);
    if (!session) continue;
    if (row.executed_at > session.executedAt) session.executedAt = row.executed_at;
    session.sets.push({ setNumber: row.set_number, weightKg: row.weight_kg ?? 0, reps: row.reps ?? 0, perceivedEffort: row.perceived_effort == null ? undefined : row.perceived_effort as 1 | 2 | 3 });
    if (row.swapped_from_name) session.swappedTo = row.exercise_name;
  }
  for (const [key, exercise] of history) {
    const sessions = Array.from(bySession.get(key)?.values() ?? []).sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    for (const session of sessions) {
      session.sets.sort((a, b) => a.setNumber - b.setNumber);
      session.best = pickBestSet(session.sets);
      session.topWeightKg = session.best?.weightKg ?? 0;
    }
    for (const session of sessions) {
      if (session.swappedTo || !session.best) continue;
      // Só compara com treino da mesma semana E da mesma fase (o slot da semana é
      // posicional: se o coach reordena as semanas, o mesmo slot vira outro estímulo).
      // Registro sem fase gravada (antigo) continua comparável.
      const previous = sessions.find(other =>
        other.executedAt < session.executedAt && other.week === session.week && !other.swappedTo && other.best &&
        (other.phase == null || session.phase == null || other.phase === session.phase));
      if (previous?.best) {
        session.change = compareBest(session.best, previous.best);
        session.comparedWith = { executedAt: previous.executedAt, week: previous.week };
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

/** Da primeira até a última vez (só vale com sessões da mesma semana do ciclo). */
export function progressSummary(sessionsNewestFirst: ProgressionSession[]): { fromKg: number; toKg: number; deltaKg: number } | null {
  const comparable = sessionsNewestFirst.filter(s => !s.swappedTo);
  if (comparable.length < 2) return null;
  const fromKg = comparable.at(-1)?.topWeightKg ?? 0;
  const toKg = comparable[0].topWeightKg;
  return { fromKg, toKg, deltaKg: round2(toKg - fromKg) };
}

/** Maior carga já registrada (em empate, a mais recente). Não compara semanas entre si. */
export function heaviestLoad(sessionsNewestFirst: ProgressionSession[]): { weightKg: number; executedAt: string } | null {
  let top: { weightKg: number; executedAt: string } | null = null;
  for (const session of sessionsNewestFirst) {
    if (session.swappedTo || session.topWeightKg <= 0) continue;
    if (!top || session.topWeightKg > top.weightKg) top = { weightKg: session.topWeightKg, executedAt: session.executedAt };
  }
  return top;
}

// ── Textos em linguagem simples ──────────────────────────────────────────────
const plural = (n: number, one: string, many: string) => (Math.abs(n) === 1 ? one : many);

export const formatKg = (kg: number) => `${String(round2(kg)).replace(".", ",")} kg`;
export const formatLoad = (kg: number) => (kg > 0 ? formatKg(kg) : "peso corporal");

/** "11 kg × 4" (carga × repetições) ou "12 reps" quando é peso corporal. */
export function formatSet(set: SessionLoadSet): string {
  return set.weightKg > 0 ? `${formatKg(set.weightKg)} × ${set.reps}` : `${set.reps} ${plural(set.reps, "rep", "reps")}`;
}

export function formatSets(sets: SessionLoadSet[]): string {
  return sets.map(formatSet).join(" · ");
}

export interface ChangeText {
  tone: ChangeKind;
  /** Selo curto, para a linha do exercício. */
  badge: string;
  /** Frase completa, para o detalhe do treino. */
  sentence: string;
}

export function describeChange(change: SessionChange): ChangeText {
  const { kind, basis, deltaKg, deltaReps, from, to } = change;
  if (kind === "same") return { tone: "same", badge: "Manteve", sentence: `Igual à última vez: ${formatSet(to)}.` };
  const up = kind === "up";
  if (basis === "kg") {
    const kg = formatKg(Math.abs(deltaKg));
    return {
      tone: kind,
      badge: up ? `Evoluiu +${kg}` : `Carga menor −${kg}`,
      sentence: `${up ? "Você aumentou a carga" : "Você usou menos carga"}: ${formatLoad(from.weightKg)} → ${formatLoad(to.weightKg)} (${up ? "+" : "−"}${kg}).`,
    };
  }
  const reps = Math.abs(deltaReps);
  const bodyweight = to.weightKg <= 0 && from.weightKg <= 0;
  const lead = bodyweight ? (up ? "Mais repetições" : "Menos repetições") : `Mesma carga (${formatKg(to.weightKg)}), ${up ? "mais" : "menos"} repetições`;
  return {
    tone: kind,
    badge: up ? `Evoluiu +${reps} ${plural(reps, "rep", "reps")}` : `Menos reps −${reps}`,
    sentence: `${lead}: ${from.reps} → ${to.reps} (${up ? "+" : "−"}${reps}).`,
  };
}
