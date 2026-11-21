/**
 * prescriptionResolve.ts — UMA regra para séries/reps/cadência/descanso.
 *
 * Problema encontrado na auditoria (20/11/2026): com periodização ligada, cada
 * tela resolvia de um jeito —
 *   Plano de Treino (acordeão) … semana > exercício (ignorava exceções)
 *   Plano (visão periodizada) … exceção > exercício (ignorava a semana)
 *   Modo Treino …………………… exceção > semana > exercício (exceção achada
 *                                 pela posição SEM a mobilidade → errada)
 *   Prévia do coach …………… exceção > exercício > semana
 * e a aluna via um número no plano e treinava outro.
 *
 * Regra aprovada pelo Rennan ("a semana manda"):
 *   periodização desligada → o que está no exercício;
 *   periodização ligada    → exceção daquela semana > valor da semana >
 *                            exercício (só se a semana estiver vazia).
 * Exceção = override da periodização (por exerciseId; posição só no legado).
 * "Exceção em todas as semanas" é o mesmo override gravado nas 4 semanas —
 * é o que o coach cria ao digitar no campo do exercício com periodização ligada.
 */

export const RX_FIELDS = ["sets", "reps", "cadence", "rest"] as const;
export type RxField = (typeof RX_FIELDS)[number];
export type Rx = Record<RxField, string>;

type Patch = Record<string, unknown> & { exerciseId?: string };
type WeekLike = Partial<Record<RxField, string>>;
export interface PeriodizationLike {
  enabled?: boolean;
  weeks?: WeekLike[];
  overrides?: Record<string, Record<string, Patch>>;
  [k: string]: unknown;
}
type ExLike = { __id?: string; name?: string; gifKey?: string; notes?: string } & Partial<Record<RxField, string>> & Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** Exceção de um exercício numa semana: por exerciseId; posição (dia_índice) só para dados antigos. */
export function findOverride(
  per: PeriodizationLike | null | undefined,
  weekIndex: number,
  dayKey: string,
  fullIndex: number,
  exerciseId?: string,
): Patch | undefined {
  const week = per?.overrides?.[String(weekIndex)];
  if (!week) return undefined;
  if (exerciseId) {
    const stable = Object.values(week).find((p) => p?.exerciseId === exerciseId);
    if (stable) return stable;
  }
  const legacy = week[`${dayKey}_${fullIndex}`];
  if (legacy && (!legacy.exerciseId || legacy.exerciseId === exerciseId)) return legacy;
  return undefined;
}

export function resolveRx(
  ex: ExLike,
  opts: { periodizationOn: boolean; week?: WeekLike | null; override?: Patch | null },
): Rx {
  const out = {} as Rx;
  for (const k of RX_FIELDS) {
    out[k] = opts.periodizationOn
      ? str(opts.override?.[k]) || str(opts.week?.[k]) || str(ex[k])
      : str(ex[k]);
  }
  return out;
}

/**
 * Exercício como a aluna deve fazer naquela semana: prescrição pela regra
 * acima + troca de exercício da semana (nome/gif/obs da exceção).
 * `fullIndex` = posição no treino CONTANDO a mobilidade.
 */
export function resolveExerciseInWeek<T extends ExLike>(
  ex: T,
  per: PeriodizationLike | null | undefined,
  weekIndex: number,
  dayKey: string,
  fullIndex: number,
): T & Rx & { overridden: boolean } {
  const on = !!per?.enabled;
  const ov = on ? findOverride(per, weekIndex, dayKey, fullIndex, ex.__id) : undefined;
  const rx = resolveRx(ex, { periodizationOn: on, week: on ? per?.weeks?.[weekIndex] : null, override: ov });
  const swappedName = str(ov?.name);
  const renamed = !!swappedName && swappedName !== str(ex.name);
  return {
    ...ex,
    ...rx,
    name: swappedName || ex.name,
    gifKey: renamed ? (str(ov?.gifKey) || undefined) : ex.gifKey,
    notes: str(ov?.notes) || ex.notes,
    overridden: !!ov && Object.keys(ov).some((k) => k !== "exerciseId" && str(ov[k])),
  };
}

// ── Exceção em todas as semanas (campo do exercício com periodização ligada) ──

function weekCount(per: PeriodizationLike | null | undefined): number {
  return per?.weeks?.length || 4;
}

/** Valor da exceção nas semanas: igual em todas → value; diferente entre semanas → mixed. */
export function exceptionValue(
  per: PeriodizationLike | null | undefined,
  dayKey: string,
  fullIndex: number,
  exerciseId: string | undefined,
  field: RxField,
): { value: string; mixed: boolean } {
  const vals = Array.from({ length: weekCount(per) }, (_, w) => str(findOverride(per, w, dayKey, fullIndex, exerciseId)?.[field]));
  if (vals.every((v) => v === vals[0])) return { value: vals[0], mixed: false };
  return { value: "", mixed: vals.some(Boolean) };
}

/**
 * Grava (ou apaga, com valor vazio) a exceção do campo nas semanas todas,
 * no mesmo formato que o editor de periodização usa (chave dia_índice +
 * exerciseId). Entradas que ficam vazias são removidas.
 */
export function setExceptionAllWeeks<P extends PeriodizationLike>(
  per: P,
  dayKey: string,
  fullIndex: number,
  exerciseId: string | undefined,
  field: RxField,
  value: string,
): P {
  const overrides: Record<string, Record<string, Patch>> = { ...(per.overrides ?? {}) };
  const v = value.trim();
  for (let w = 0; w < weekCount(per); w++) {
    const wk = String(w);
    const week = { ...(overrides[wk] ?? {}) };
    let key = exerciseId ? Object.keys(week).find((k) => week[k]?.exerciseId === exerciseId) : undefined;
    if (!key) {
      const legacy = `${dayKey}_${fullIndex}`;
      if (week[legacy] && (!week[legacy].exerciseId || week[legacy].exerciseId === exerciseId)) key = legacy;
    }
    if (!key) {
      if (!v) continue;
      key = `${dayKey}_${fullIndex}`;
    }
    const next: Patch = { ...(week[key] ?? {}), ...(exerciseId ? { exerciseId } : {}) };
    if (v) next[field] = v;
    else delete next[field];
    const meaningful = Object.keys(next).some((k) => k !== "exerciseId" && str(next[k]));
    if (meaningful) week[key] = next;
    else delete week[key];
    if (Object.keys(week).length) overrides[wk] = week;
    else delete overrides[wk];
  }
  return { ...per, overrides };
}
