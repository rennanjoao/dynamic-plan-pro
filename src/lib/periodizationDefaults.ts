export interface WeekMeta {
  label: string;
  sets: string;
  reps: string;
  rest: string;
  cadence: string;
}

export const DEFAULT_WEEKS: WeekMeta[] = [
  { label: "Semana 1 — Carga Máxima",            sets: "4 a 5 séries", reps: "5 a 8 reps",   rest: "2 min",     cadence: "1s conc / 2s exc" },
  { label: "Semana 2 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 3 — Qualidade Neuromuscular", sets: "3 a 4 séries", reps: "10 a 12 reps", rest: "60s a 90s", cadence: "1s conc / 1-2s exc" },
  { label: "Semana 4 — Estresse Metabólico",     sets: "2 a 4 séries", reps: "15 a 20 reps", rest: "30s a 45s", cadence: "1s conc / 1s exc" },
];

export function parseRepsMin(s?: string): number {
  const nums = String(s || "0").match(/\d+/g);
  return nums ? Math.min(...nums.map(Number)) : 0;
}
export function parseRepsMax(s?: string): number {
  const nums = String(s || "0").match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 0;
}

export type WeekFocusKey = "peso" | "tecnica" | "resistencia";

export const WEEK_FOCUS_COLOR: Record<WeekFocusKey, { text: string; bg: string; border: string; pill: string }> = {
  peso:        { text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/40", pill: "bg-orange-500/15 text-orange-500 border-orange-500/40" },
  tecnica:     { text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",   pill: "bg-blue-500/15 text-blue-500 border-blue-500/40" },
  resistencia: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40",pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
};

/** Classifica a semana pelo range de reps — sem precisar de campo novo no schema. */
export function classifyWeekFocus(reps?: string): { key: WeekFocusKey; label: string } {
  const min = parseRepsMin(reps);
  if (min > 0 && min <= 8) return { key: "peso", label: "Peso" };
  if (min >= 14) return { key: "resistencia", label: "Resistência" };
  return { key: "tecnica", label: "Técnica" };
}