// src/lib/studentContext.ts
//
// Faixa do aluno no topo do protocolo (auditoria de 21/11/2026, Pacote C):
// o essencial da anamnese e do último check-in à vista enquanto o coach
// monta o protocolo, sem abrir o painel da anamnese a cada aluno.

export interface StudentContext {
  goal: string | null;
  injuries: string | null;
  allergies: string | null;
  trainingDays: string | null;
  level: string | null;
  weightKg: number | null;
  /** De onde veio o peso: check-in mais recente ou anamnese. */
  weightSource: "checkin" | "anamnesis" | null;
  weightAt: string | null;
  lastCheckinAt: string | null;
  anamnesisAt: string | null;
  hasAnamnesis: boolean;
}

const NEGATIVE = /^(n[aã]o( tenho| possuo| uso| sei)?|nenhum[a]?|nada|sem|n\/?a|-+|\.)$/i;

/** Texto que diz algo de fato ("Não", "nenhuma", "-" não contam). */
export function meaningfulText(v: unknown): string | null {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length <= 20 && NEGATIVE.test(t.replace(/[.!]+$/, ""))) return null;
  return t;
}

export function parseWeightKg(raw: unknown): number | null {
  if (typeof raw === "number" && isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function buildStudentContext(input: {
  anamnesis: { payload?: unknown; baseline_metrics?: unknown; submitted_at?: string | null; updated_at?: string | null } | null;
  lastCheckin: { submitted_at?: string | null; current_metrics?: unknown } | null;
}): StudentContext {
  const p = (input.anamnesis?.payload ?? {}) as Record<string, unknown>;
  const base = (input.anamnesis?.baseline_metrics ?? {}) as Record<string, unknown>;
  const ci = (input.lastCheckin?.current_metrics ?? {}) as Record<string, unknown>;
  const anamnesisAt = input.anamnesis ? (input.anamnesis.submitted_at || input.anamnesis.updated_at || null) : null;

  const ciWeight = parseWeightKg(ci.peso ?? ci.weight);
  const anaWeight = parseWeightKg(base.peso ?? base.weight ?? p.peso);
  const weightSource = ciWeight != null ? "checkin" : anaWeight != null ? "anamnesis" : null;

  return {
    goal: meaningfulText(p.meta_prioridade),
    injuries: meaningfulText(p.lesoes),
    allergies: meaningfulText(p.alergias),
    trainingDays: meaningfulText(p.dias_treino),
    level: meaningfulText(p.nivel_treino),
    weightKg: ciWeight ?? anaWeight,
    weightSource,
    weightAt: weightSource === "checkin" ? input.lastCheckin?.submitted_at ?? null : weightSource === "anamnesis" ? anamnesisAt : null,
    lastCheckinAt: input.lastCheckin?.submitted_at ?? null,
    anamnesisAt,
    hasAnamnesis: !!input.anamnesis,
  };
}

/** "hoje", "ontem", "há 9 dias", "há 3 meses". */
export function relativeDays(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 60) return `há ${days} dias`;
  const months = Math.round(days / 30);
  return `há ${months} meses`;
}
