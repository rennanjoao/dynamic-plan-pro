/**
 * busyWeek.ts — "Semana Corrida": treino secundário (Full Body ou Upper/Lower)
 * que o coach monta FORA do protocolo e libera para a aluna usar quando a
 * rotina apertar.
 *
 * Decisões do Rennan (20/11/2026):
 *  - O coach cria o plano numa biblioteca e ativa para uma ou várias alunas.
 *    Cada aluna recebe uma CÓPIA independente (dá para ajustar só a dela);
 *    "atualizar nas alunas" reaplica a versão da biblioteca.
 *  - Ativado, fica opcional: a ALUNA escolhe quando trocar e quando voltar.
 *    Sem prazo — segue a rotina dela.
 *  - Sequência A · descanso · B · descanso (ou A/B/C): o app sugere o próximo
 *    da rotação; treinou em dias seguidos → ordem invertida (configurável por
 *    treino, ver workoutInversion.ts). Mobilidade sempre antes.
 *  - Periodização com liga/desliga no plano (desligada = faixa fixa).
 *  - Dieta (revisão 20/11 noite): o plano tem a MESMA faixa da semana do
 *    treino atual — dias com treino/descanso e carbo Alto/Base/Baixo por dia,
 *    ajustados pelo coach no mesmo lugar. A dieta da aluna usa essa semana com
 *    os mesmos botões "Hoje não vou treinar / Hoje vou treinar". Os treinos
 *    em si seguem a rotação (ela escolhe quando treinar).
 *
 * Arquivo puro (sem Supabase/React) — testado em busyWeek.test.ts.
 */
import { z } from "zod";
import { PeriodizationSchema, WorkoutDaySchema, type ProtocolPayload } from "./protocolSchema";
import { DAY_KEYS, normalizeCarb, type CarbLevel } from "./weekCycle";
import { localDateKey } from "./dateOnly";
import type { SessionMark } from "./workoutInversion";

export const BUSY_KEY_PREFIX = "SC_";
export type BusyKind = "fullbody" | "upper_lower";

export const BUSY_KIND_LABEL: Record<BusyKind, string> = {
  fullbody: "Full Body",
  upper_lower: "Upper / Lower",
};

const CarbLevelSchema = z.enum(["high", "base", "off"]).catch("base");

export const BusyWeekPayloadSchema = z.object({
  workouts: z.array(WorkoutDaySchema).default([]),
  periodization: PeriodizationSchema.default({} as never),
  /** Dia da semana → treino (SC_A…) ou "REST". Mesma faixa do protocolo. */
  weekDays: z.record(z.string()).catch({}).default({}),
  /** Dia da semana → carbo (high/base/off). Mesma faixa do protocolo. */
  carbCycle: z.record(z.string()).catch({}).default({}),
  restNotes: z.string().max(2000).catch("").default(""),
  /** Legado (planos criados antes da faixa da semana): vira o carbo padrão dos dias. */
  dietRule: z
    .object({
      training: CarbLevelSchema.default("base"),
      rest: CarbLevelSchema.default("off"),
    })
    .default({ training: "base", rest: "off" }),
  /** Legado — hoje vem da faixa da semana (busyTrainingDays). */
  sessionsPerWeek: z.number().int().min(1).max(6).catch(3).default(3),
  /** Recado curto para a aluna (opcional). */
  note: z.string().max(500).catch("").default(""),
});
export type BusyWeekPayload = z.infer<typeof BusyWeekPayloadSchema>;

export function isBusyKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.startsWith(BUSY_KEY_PREFIX);
}

export function busyLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Normaliza o plano: chaves SC_A, SC_B… (nunca colidem com A/B/C do
 * protocolo, então histórico e cargas não se misturam com o treino padrão) e
 * inversão "dias seguidos" como padrão de cada treino.
 */
export function normalizeBusyPayload(raw: unknown): BusyWeekPayload {
  const parsed = BusyWeekPayloadSchema.safeParse(raw ?? {});
  const base = parsed.success ? parsed.data : BusyWeekPayloadSchema.parse({});
  const renames = new Map<string, string>();
  const workouts = base.workouts.map((w, i) => {
    const key = `${BUSY_KEY_PREFIX}${busyLetter(i)}`;
    if (w.key !== key) renames.set(w.key, key);
    return { ...w, key };
  });
  // Overrides posicionais da periodização seguem a chave nova.
  let periodization = base.periodization;
  if (renames.size > 0 && periodization?.overrides) {
    const overrides: typeof periodization.overrides = {};
    for (const [week, byEx] of Object.entries(periodization.overrides)) {
      const next: Record<string, (typeof byEx)[string]> = {};
      for (const [slot, patch] of Object.entries(byEx ?? {})) {
        const cut = slot.lastIndexOf("_");
        const dayKey = cut > 0 ? slot.slice(0, cut) : slot;
        const renamed = renames.get(dayKey);
        next[renamed ? `${renamed}${slot.slice(cut)}` : slot] = patch;
      }
      overrides[week] = next;
    }
    periodization = { ...periodization, overrides };
  }
  const keys = workouts.map((w) => w.key);
  // Dias da semana seguem a renomeação; dias apontando para treino que não existe saem.
  let weekDays: Record<string, string> = {};
  for (const [day, wk] of Object.entries(base.weekDays ?? {})) {
    const k = renames.get(wk) ?? wk;
    if (k === "REST" || keys.includes(k)) weekDays[day] = k;
  }
  let carbCycle: Record<string, string> = {};
  for (const d of DAY_KEYS) if (base.carbCycle?.[d]) carbCycle[d] = normalizeCarb(base.carbCycle[d]);
  // Plano antigo (sem faixa da semana): monta A · descanso · B · descanso…
  if (Object.keys(weekDays).length === 0 && keys.length > 0) {
    const def = defaultBusyWeek(keys, { training: base.dietRule?.training ?? "base", rest: base.dietRule?.rest ?? "off" });
    weekDays = def.weekDays;
    if (Object.keys(carbCycle).length === 0) carbCycle = def.carbCycle;
  }
  const trainingDays = Object.values(weekDays).filter((k) => k && k !== "REST").length;
  return {
    ...base,
    workouts,
    periodization,
    weekDays,
    carbCycle,
    sessionsPerWeek: trainingDays > 0 ? Math.min(6, trainingDays) : base.sessionsPerWeek,
  };
}

/**
 * Semana sugerida para a Semana Corrida: treino em dias alternados
 * (seg · qua · sex), descanso nos outros. 1 treino: A A A; 2: A B A; 3: A B C.
 */
export function defaultBusyWeek(
  workoutKeys: string[],
  rule: { training: CarbLevel; rest: CarbLevel } = { training: "base", rest: "off" },
): { weekDays: Record<string, string>; carbCycle: Record<string, CarbLevel> } {
  const trainDays = ["seg", "qua", "sex"];
  const weekDays: Record<string, string> = {};
  const carbCycle: Record<string, CarbLevel> = {};
  let i = 0;
  for (const d of DAY_KEYS) {
    if (trainDays.includes(d) && workoutKeys.length > 0) {
      weekDays[d] = workoutKeys[i % workoutKeys.length];
      carbCycle[d] = rule.training;
      i++;
    } else {
      weekDays[d] = "REST";
      carbCycle[d] = rule.rest;
    }
  }
  return { weekDays, carbCycle };
}

/** Quantos dias de treino a semana do plano tem (aderência do coach). */
export function busyTrainingDays(p: Pick<BusyWeekPayload, "weekDays" | "sessionsPerWeek">): number {
  const n = Object.values(p.weekDays ?? {}).filter((k) => k && k !== "REST").length;
  return n > 0 ? n : p.sessionsPerWeek;
}

/** Copia os treinos do protocolo como ponto de partida da Semana Corrida. */
export function busyFromProtocolWorkouts(workouts: ProtocolPayload["workouts"]): BusyWeekPayload {
  const copy = JSON.parse(JSON.stringify(workouts ?? [])) as ProtocolPayload["workouts"];
  return normalizeBusyPayload({
    workouts: copy.map((w) => ({ ...w, invert: w.invert ?? { mode: "consecutive" } })),
    periodization: { enabled: false },
  });
}

/** Plano em branco para o coach começar (2 treinos, inversão em dias seguidos). */
export function emptyBusyPayload(kind: BusyKind): BusyWeekPayload {
  const names = kind === "upper_lower" ? ["Superiores (Upper)", "Inferiores (Lower)"] : ["Full Body A", "Full Body B"];
  return normalizeBusyPayload({
    workouts: names.map((focus, i) => ({
      key: `${BUSY_KEY_PREFIX}${busyLetter(i)}`,
      focus,
      exercises: [],
      invert: { mode: "consecutive" },
    })),
    periodization: { enabled: false },
  });
}

/**
 * O editor de treinos do coach trabalha com um ProtocolPayload; o plano usa só
 * treinos + periodização. Estas duas funções fazem a ponte sem perder nada.
 */
export function busyToEditorPayload(plan: BusyWeekPayload, base: ProtocolPayload): ProtocolPayload {
  return {
    ...base,
    workouts: plan.workouts,
    periodization: plan.periodization,
    weekDays: { ...plan.weekDays },
    carbCycle: { ...plan.carbCycle } as ProtocolPayload["carbCycle"],
    restNotes: plan.restNotes,
    cardio: [],
  };
}

export function editorToBusyPayload(editor: ProtocolPayload, plan: BusyWeekPayload): BusyWeekPayload {
  return normalizeBusyPayload({
    ...plan,
    workouts: editor.workouts,
    periodization: editor.periodization,
    weekDays: editor.weekDays,
    carbCycle: editor.carbCycle,
    restNotes: editor.restNotes,
  });
}

// ── Aluna: rotação e tipo do dia ─────────────────────────────────────────────

/** Próximo treino da rotação (A → B → C → A…), pela última sessão da Semana Corrida. */
export function nextBusyWorkoutKey(workoutKeys: string[], sessions: SessionMark[], today: Date = new Date()): string | null {
  if (workoutKeys.length === 0) return null;
  const todayKey = localDateKey(today);
  const busy = sessions
    .filter((s) => workoutKeys.includes(s.workout_key))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  // Treino já começado hoje continua sendo "o de hoje".
  const startedToday = busy.find((s) => localDateKey(new Date(s.started_at)) === todayKey);
  if (startedToday) return startedToday.workout_key;
  const last = busy[0];
  if (!last) return workoutKeys[0];
  const idx = workoutKeys.indexOf(last.workout_key);
  return workoutKeys[(idx + 1) % workoutKeys.length];
}

export type BusyDayType = "training" | "rest";

/**
 * Sugestão do tipo do dia na Semana Corrida:
 *  - já treinou hoje → treino;
 *  - treinou ontem → descanso (A · descanso · B · descanso);
 *  - senão → treino.
 * A aluna sempre pode trocar (a escolha dela vale só para hoje).
 */
export function suggestBusyDayType(sessions: SessionMark[], today: Date = new Date()): BusyDayType {
  const todayKey = localDateKey(today);
  if (sessions.some((s) => localDateKey(new Date(s.started_at)) === todayKey)) return "training";
  const y = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  if (sessions.some((s) => localDateKey(new Date(s.started_at)) === y)) return "rest";
  return "training";
}

export function busyCarbFor(rule: BusyWeekPayload["dietRule"], dayType: BusyDayType): CarbLevel {
  return dayType === "training" ? rule.training : rule.rest;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

/** "Treino A" ou "Semana corrida A" a partir da chave salva na sessão. */
export function workoutKeyLabel(key: string | null | undefined): string {
  if (!key) return "Treino";
  if (isBusyKey(key)) return `Semana corrida ${key.slice(BUSY_KEY_PREFIX.length)}`;
  return `Treino ${key}`;
}

// ── Coach: aderência ─────────────────────────────────────────────────────────

/** Semana (segunda a domingo) em que a aluna usou a Semana Corrida. */
export function isBusyWeek(sessions: Array<{ workout_key?: string | null; started_at: string }>, weekStart: Date): boolean {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return sessions.some((s) => {
    if (!isBusyKey(s.workout_key)) return false;
    const t = new Date(s.started_at);
    return t >= weekStart && t < end;
  });
}

// ── Coach: status da cópia de cada aluna ─────────────────────────────────────

export interface AssignmentLite {
  plan_id: string | null;
  plan_synced_at: string | null;
  customized: boolean;
  enabled: boolean;
}

/** A cópia da aluna está atrás da versão atual do plano na biblioteca. */
export function isAssignmentOutdated(a: AssignmentLite, planUpdatedAt: string | null | undefined): boolean {
  if (!a.plan_id || !planUpdatedAt) return false;
  if (!a.plan_synced_at) return true;
  return new Date(planUpdatedAt).getTime() > new Date(a.plan_synced_at).getTime() + 1000;
}
