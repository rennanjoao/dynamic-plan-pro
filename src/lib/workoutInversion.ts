/**
 * workoutInversion.ts — "Inverter a ordem do treino" para variar o estímulo.
 *
 * Decisões do Rennan (20/11/2026):
 *  - A mobilidade fica SEMPRE antes do treino; só os exercícios de força
 *    invertem (o último vira o primeiro).
 *  - O coach liga por treino (só o A, só o B, ou todos) e escolhe a frequência:
 *      every       → alterna a cada vez que a aluna faz ESSE treino
 *                    (1ª normal, 2ª invertida, 3ª normal…)
 *      weekly      → uma semana normal, a seguinte invertida
 *      biweekly    → duas semanas normal, duas invertida
 *      monthly     → um mês normal, o seguinte invertido
 *      consecutive → inverte quando a aluna treinou no dia anterior
 *                    (padrão da Semana Corrida: "fez seguido, inverte")
 *  - O resultado é o mesmo o dia inteiro (não muda no meio do treino).
 *
 * Os overrides da periodização são por POSIÇÃO do exercício, então inverter
 * também remapeia esses overrides (senão a carga da semana iria para o
 * exercício errado).
 */
import { isMobilityExercise } from "./protocolSchema";
import { remapDayOverrides } from "./workoutExerciseOps";
import { localDateKey } from "./dateOnly";

export type InvertMode = "off" | "every" | "weekly" | "biweekly" | "monthly" | "consecutive";

export interface InvertSetting {
  mode: InvertMode;
  since?: string;
}

export const INVERT_OPTIONS: Array<{ value: InvertMode; label: string; hint: string }> = [
  { value: "off", label: "Ordem normal", hint: "Sempre na ordem montada." },
  { value: "every", label: "A cada treino", hint: "Alterna toda vez que ela faz este treino." },
  { value: "weekly", label: "1x por semana", hint: "Uma semana normal, a seguinte invertida." },
  { value: "biweekly", label: "A cada 2 semanas", hint: "Duas semanas normal, duas invertida." },
  { value: "monthly", label: "1x por mês", hint: "Um mês normal, o seguinte invertido." },
  { value: "consecutive", label: "Quando treinar dias seguidos", hint: "Inverte se ela treinou ontem." },
];

export const INVERT_LABEL: Record<InvertMode, string> = Object.fromEntries(
  INVERT_OPTIONS.map((o) => [o.value, o.label]),
) as Record<InvertMode, string>;

/** Referência fixa (uma segunda-feira) para configurações antigas sem `since`. */
const FALLBACK_SINCE = "2026-01-05";

function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function daysBetween(fromKey: string, to: Date): number {
  const a = parseDay(fromKey);
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface SessionMark {
  workout_key: string;
  started_at: string;
}

export interface InvertContext {
  today: Date;
  /** Sessões recentes da aluna (qualquer treino). */
  sessions: SessionMark[];
}

/** A aluna registrou treino no dia anterior (qualquer treino). */
export function trainedYesterday(sessions: SessionMark[], today: Date): boolean {
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yKey = localDateKey(y);
  return sessions.some((s) => localDateKey(new Date(s.started_at)) === yKey);
}

/** Quantos dias ANTES de hoje ela fez este treino (2 sessões no mesmo dia = 1). */
export function timesDoneBeforeToday(sessions: SessionMark[], workoutKey: string, today: Date): number {
  const todayKey = localDateKey(today);
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.workout_key !== workoutKey) continue;
    const k = localDateKey(new Date(s.started_at));
    if (k < todayKey) days.add(k);
  }
  return days.size;
}

export function shouldInvert(setting: InvertSetting | undefined | null, workoutKey: string, ctx: InvertContext): boolean {
  const mode = setting?.mode ?? "off";
  if (mode === "off") return false;
  const since = setting?.since && /^\d{4}-\d{2}-\d{2}$/.test(setting.since) ? setting.since : FALLBACK_SINCE;
  const days = Math.max(0, daysBetween(since, ctx.today));
  switch (mode) {
    case "every":
      return timesDoneBeforeToday(ctx.sessions, workoutKey, ctx.today) % 2 === 1;
    case "weekly":
      return Math.floor(days / 7) % 2 === 1;
    case "biweekly":
      return Math.floor(days / 14) % 2 === 1;
    case "monthly": {
      const a = parseDay(since);
      const months = (ctx.today.getFullYear() - a.getFullYear()) * 12 + (ctx.today.getMonth() - a.getMonth());
      return Math.max(0, months) % 2 === 1;
    }
    case "consecutive":
      return trainedYesterday(ctx.sessions, ctx.today);
    default:
      return false;
  }
}

/**
 * Inverte só a força; a mobilidade vai para o começo na ordem original.
 * Devolve também o mapa posição antiga → posição nova (para os overrides).
 */
export function invertExerciseOrder<T>(exercises: T[]): { exercises: T[]; indexMap: Map<number, number | null> } {
  const mobility: number[] = [];
  const strength: number[] = [];
  exercises.forEach((ex, i) => (isMobilityExercise(ex as never) ? mobility : strength).push(i));
  const order = [...mobility, ...strength.reverse()];
  const indexMap = new Map<number, number | null>();
  order.forEach((oldIdx, newIdx) => indexMap.set(oldIdx, newIdx));
  return { exercises: order.map((i) => exercises[i]), indexMap };
}

type DayLike = { key: string; exercises?: unknown[]; invert?: InvertSetting | null; [k: string]: unknown };
type PeriodizationLike = { overrides?: Record<string, Record<string, unknown>>; [k: string]: unknown } | undefined | null;

/**
 * Aplica a inversão do dia aos treinos que estiverem configurados. Os treinos
 * invertidos hoje recebem `__inverted: true` (para a tela avisar a aluna).
 */
export function applyWorkoutInversion<W extends DayLike, P extends PeriodizationLike>(
  workouts: W[],
  periodization: P,
  ctx: InvertContext,
): { workouts: Array<W & { __inverted?: boolean }>; periodization: P; invertedKeys: string[] } {
  let per = periodization;
  const invertedKeys: string[] = [];
  const out = workouts.map((day) => {
    const exercises = Array.isArray(day.exercises) ? day.exercises : [];
    if (exercises.length < 2 || !shouldInvert(day.invert, day.key, ctx)) return day;
    const { exercises: next, indexMap } = invertExerciseOrder(exercises);
    const strengthCount = exercises.filter((e) => !isMobilityExercise(e as never)).length;
    if (strengthCount < 2) return day;
    invertedKeys.push(day.key);
    if (per && (per as { overrides?: unknown }).overrides) {
      per = remapDayOverrides(per as never, day.key, indexMap) as P;
    }
    return { ...day, exercises: next, __inverted: true };
  });
  return { workouts: out, periodization: per, invertedKeys };
}

/** Valor salvo quando o coach escolhe um modo (reinicia a referência). */
export function makeInvertSetting(mode: InvertMode, today: Date = new Date()): InvertSetting | undefined {
  if (mode === "off") return undefined;
  return { mode, since: localDateKey(today) };
}
