import type { ProtocolPayload } from "./protocolSchema";

export type WeekFieldError = {
  weekIndex: number;
  field: "label" | "sets" | "reps" | "rest" | "cadence";
  message: string;
};

export type OverrideError = {
  weekIndex: number;
  exerciseId: string;
  field: "sets" | "reps" | "rest" | "cadence";
  message: string;
};

export type PeriodizationValidationResult = {
  ok: boolean;
  weekErrors: WeekFieldError[];
  overrideErrors: OverrideError[];
};

// Aceita formatos: "3", "3-5", "3 a 5", "3 a 5 séries", "8-12 reps", "8 a 12 repetições"
const RANGE_RE = /(\d+)\s*(?:a|-|–|—|to)\s*(\d+)/i;
const SINGLE_RE = /(\d+)/;

function parseRange(raw: string): { min: number; max: number } | null {
  if (!raw || !raw.trim()) return null;
  const m = raw.match(RANGE_RE);
  if (m) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }
  const s = raw.match(SINGLE_RE);
  if (s) {
    const v = Number(s[1]);
    if (Number.isFinite(v)) return { min: v, max: v };
  }
  return null;
}

// Descanso: aceita "60s", "2 min", "60-90s", "60 a 90s", "1-2 min"
function parseRestSeconds(raw: string): { min: number; max: number } | null {
  if (!raw || !raw.trim()) return null;
  const lower = raw.toLowerCase();
  const hasMin = /\bmin\b|\bm\b/.test(lower);
  const factor = hasMin ? 60 : 1;
  const range = parseRange(lower);
  if (!range) return null;
  return { min: range.min * factor, max: range.max * factor };
}

// Cadência: aceita "1s conc / 2s exc", "2-0-1", "1/2", "tempo 2020"
function looksLikeCadence(raw: string): boolean {
  if (!raw || !raw.trim()) return true; // opcional
  // precisa conter ao menos um dígito
  return /\d/.test(raw);
}

const RANGES = {
  sets:  { min: 1, max: 10, label: "séries (1-10)" },
  reps:  { min: 1, max: 60, label: "repetições (1-60)" },
  restSec: { min: 10, max: 600, label: "descanso (10s-10min)" },
};

function checkSets(raw: string) {
  const r = parseRange(raw);
  if (!r) return "Informe número ou faixa de séries (ex: 3 ou 3-5)";
  if (r.min < RANGES.sets.min || r.max > RANGES.sets.max) return `Fora da faixa permitida — ${RANGES.sets.label}`;
  if (r.min > r.max) return "Faixa invertida (mínimo > máximo)";
  return null;
}

function checkReps(raw: string) {
  const r = parseRange(raw);
  if (!r) return "Informe número ou faixa de reps (ex: 8-12)";
  if (r.min < RANGES.reps.min || r.max > RANGES.reps.max) return `Fora da faixa permitida — ${RANGES.reps.label}`;
  if (r.min > r.max) return "Faixa invertida (mínimo > máximo)";
  return null;
}

function checkRest(raw: string) {
  const r = parseRestSeconds(raw);
  if (!r) return "Informe descanso (ex: 60s, 1-2 min)";
  if (r.min < RANGES.restSec.min || r.max > RANGES.restSec.max) return `Fora da faixa — ${RANGES.restSec.label}`;
  if (r.min > r.max) return "Faixa invertida (mínimo > máximo)";
  return null;
}

function checkCadence(raw: string) {
  if (!looksLikeCadence(raw)) return "Cadência deve conter pelo menos um número (ex: 2-0-1 ou 1s conc / 2s exc)";
  return null;
}

function checkLabel(raw: string) {
  if (!raw || !raw.trim()) return "Defina um nome para a semana";
  if (raw.length > 80) return "Nome muito longo (máx. 80 caracteres)";
  return null;
}

export function validatePeriodization(payload: ProtocolPayload): PeriodizationValidationResult {
  const weekErrors: WeekFieldError[] = [];
  const overrideErrors: OverrideError[] = [];
  const p = payload.periodization;
  if (!p?.enabled) return { ok: true, weekErrors, overrideErrors };

  p.weeks.forEach((w, i) => {
    const push = (field: WeekFieldError["field"], msg: string | null) => {
      if (msg) weekErrors.push({ weekIndex: i, field, message: msg });
    };
    push("label", checkLabel(w.label));
    push("sets", checkSets(w.sets));
    push("reps", checkReps(w.reps));
    push("rest", checkRest(w.rest));
    push("cadence", checkCadence(w.cadence));
  });

  const ov = p.overrides || {};
  Object.entries(ov).forEach(([wk, exs]) => {
    const weekIndex = Number(wk);
    if (!Number.isFinite(weekIndex)) return;
    Object.entries(exs || {}).forEach(([exId, patch]) => {
      const pushO = (field: OverrideError["field"], msg: string | null) => {
        if (msg) overrideErrors.push({ weekIndex, exerciseId: exId, field, message: msg });
      };
      if (patch.sets)    pushO("sets", checkSets(patch.sets));
      if (patch.reps)    pushO("reps", checkReps(patch.reps));
      if (patch.rest)    pushO("rest", checkRest(patch.rest));
      if (patch.cadence) pushO("cadence", checkCadence(patch.cadence));
    });
  });

  return {
    ok: weekErrors.length === 0 && overrideErrors.length === 0,
    weekErrors,
    overrideErrors,
  };
}

// Resolve um exercício considerando overrides + meta da semana como fallback.
export function resolveExerciseForWeek(
  payload: ProtocolPayload,
  weekIndex: number,
  dayKey: string,
  exerciseIndex: number
) {
  const day = payload.workouts.find((d) => d.key === dayKey);
  const base = day?.exercises[exerciseIndex];
  if (!base) return null;
  const p = payload.periodization;
  const weekMeta = p.weeks[weekIndex];
  const ov = p.overrides?.[String(weekIndex)]?.[`${dayKey}_${exerciseIndex}`] || {};
  return {
    name: ov.name || base.name || "",
    sets:    ov.sets    || base.sets    || weekMeta?.sets    || "",
    reps:    ov.reps    || base.reps    || weekMeta?.reps    || "",
    cadence: ov.cadence || base.cadence || weekMeta?.cadence || "",
    rest:    ov.rest    || base.rest    || weekMeta?.rest    || "",
    notes:   ov.notes   || base.notes   || "",
    overridden: Object.keys(ov).length > 0,
  };
}