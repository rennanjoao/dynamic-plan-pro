/**
 * supplementsToday.ts — o que a aluna toma HOJE (faixa "Hoje" em
 * Diretrizes & Suplementação). Decisão do Rennan (18/11): só mostrar, sem check.
 *
 * Regras:
 *  - Item com `weeklyFrequency` preenchido só aparece nos dias marcados
 *    (ex.: manipulado só seg/qua/sex).
 *  - Item sem dias marcados vale todos os dias.
 *  - Itens agrupados em combo aparecem dentro do combo, no horário do combo.
 *  - Ordem do dia: Ao acordar → Manhã → Pré-treino → Pós-treino → Tarde →
 *    Noite → Antes de dormir → outros horários → sem horário.
 */

export interface TodaySupplementItem {
  name: string;
  dose: string;
  mealRef: string;
}

export interface TodaySupplementGroup {
  /** Horário (ex.: "Manhã"); "Sem horário" quando o coach não informou. */
  timing: string;
  /** Nome do combo, quando o grupo é um combo. */
  comboName?: string;
  items: TodaySupplementItem[];
}

export const TIMING_ORDER = ["Ao acordar", "Manhã", "Pré-treino", "Pós-treino", "Tarde", "Noite", "Antes de dormir"];
const NO_TIMING = "Sem horário";

type AnySupp = {
  name?: unknown; dose?: unknown; timing?: unknown; mealRef?: unknown; weeklyFrequency?: unknown;
};
type AnyCombo = { name?: unknown; timing?: unknown; supplementIndexes?: unknown };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function takesToday(s: AnySupp, dayKey: string): boolean {
  const days = Array.isArray(s.weeklyFrequency) ? s.weeklyFrequency.map(String) : [];
  return days.length === 0 || days.includes(dayKey);
}

function timingRank(t: string): number {
  const i = TIMING_ORDER.indexOf(t);
  if (i >= 0) return i;
  return t === NO_TIMING ? 1000 : 500;
}

export function supplementsForToday(
  supplements: AnySupp[] | null | undefined,
  combos: AnyCombo[] | null | undefined,
  dayKey: string,
): TodaySupplementGroup[] {
  const list = Array.isArray(supplements) ? supplements : [];
  const comboList = Array.isArray(combos) ? combos : [];
  const toItem = (s: AnySupp): TodaySupplementItem => ({ name: str(s.name), dose: str(s.dose), mealRef: str(s.mealRef) });

  const bound = new Set<number>();
  const groups: TodaySupplementGroup[] = [];

  comboList.forEach((c) => {
    const idx = Array.isArray(c.supplementIndexes) ? c.supplementIndexes.filter((n): n is number => typeof n === "number") : [];
    idx.forEach((i) => bound.add(i));
    const items = idx
      .map((i) => list[i])
      .filter((s): s is AnySupp => !!s && !!str(s.name) && takesToday(s, dayKey))
      .map(toItem);
    if (items.length) groups.push({ timing: str(c.timing) || NO_TIMING, comboName: str(c.name) || undefined, items });
  });

  const byTiming = new Map<string, TodaySupplementItem[]>();
  list.forEach((s, i) => {
    if (bound.has(i) || !s || !str(s.name) || !takesToday(s, dayKey)) return;
    const t = str(s.timing) || NO_TIMING;
    byTiming.set(t, [...(byTiming.get(t) ?? []), toItem(s)]);
  });
  byTiming.forEach((items, timing) => groups.push({ timing, items }));

  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => timingRank(a.g.timing) - timingRank(b.g.timing) || a.g.timing.localeCompare(b.g.timing) || a.i - b.i)
    .map(({ g }) => g);
}
