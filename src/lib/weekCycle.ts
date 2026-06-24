/**
 * weekCycle.ts — Helpers para mapear dia da semana ↔ workout / carb level.
 */
import { WEEKDAYS } from "@/lib/protocolSchema";

export const DAY_KEYS = WEEKDAYS.map((d) => d.key) as readonly string[];

// JS getDay(): 0=dom..6=sab
const JS_TO_KEY = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

export function todayKey(d: Date = new Date()): string {
  return JS_TO_KEY[d.getDay()];
}

export function tomorrowKey(d: Date = new Date()): string {
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  return JS_TO_KEY[t.getDay()];
}

/** Normaliza a carb level salva ("low" → "off"). */
export type CarbLevel = "high" | "base" | "off";
export function normalizeCarb(v: unknown): CarbLevel {
  if (v === "high" || v === "base" || v === "off") return v;
  if (v === "low") return "off";
  return "base";
}

/** Cicla o nível ao clicar: high → base → off → high. */
export function cycleCarb(v: CarbLevel): CarbLevel {
  return v === "high" ? "base" : v === "base" ? "off" : "high";
}

export const CARB_LABEL: Record<CarbLevel, string> = {
  high: "Alto",
  base: "Base",
  off: "Off",
};

/** Classes Tailwind por nível, padronizadas no projeto. */
export const CARB_COLOR: Record<CarbLevel, { text: string; bg: string; border: string; pill: string }> = {
  high: {
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    pill: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  },
  base: {
    text: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    pill: "bg-blue-500/15 text-blue-500 border-blue-500/40",
  },
  off: {
    text: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border/50",
    pill: "bg-muted/40 text-muted-foreground border-border/50",
  },
};

export interface DayInfo {
  key: string;
  abbr: string; // "Seg"
  label: string; // "Segunda"
  workoutKey: string; // "" = descanso
  carb: CarbLevel;
  isToday: boolean;
}

const ABBR: Record<string, string> = {
  seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui",
  sex: "Sex", sab: "Sáb", dom: "Dom",
};

export function buildWeekStrip(payload: any, today = todayKey()): DayInfo[] {
  const weekDays: Record<string, string> = payload?.weekDays ?? {};
  const carbCycle: Record<string, unknown> = payload?.carbCycle ?? {};
  return DAY_KEYS.map((k) => ({
    key: k,
    abbr: ABBR[k] ?? k,
    label: WEEKDAYS.find((d) => d.key === k)?.label ?? k,
    workoutKey: weekDays[k] ?? "",
    carb: normalizeCarb(carbCycle[k]),
    isToday: k === today,
  }));
}

import { WEEKDAYS } from "@/lib/protocolSchema";