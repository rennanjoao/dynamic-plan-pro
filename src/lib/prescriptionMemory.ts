/**
 * prescriptionMemory — memoriza a última prescrição usada pelo coach para
 * cada exercício, permitindo autocompletar Sets/Reps/Cadência/Descanso.
 * Escopo por coachId + nome de exercício (case/acento-insensitivo).
 *
 * Passo 8 (F6 — DNA do coach): a fonte deixou de ser localStorage (a escrita
 * nunca era chamada em nenhum lugar do app) e passou a ser coach_ai_profile,
 * agregada no banco a partir do histórico real de protocol_versions. O cache
 * em memória abaixo só evita repetir a mesma consulta várias vezes na mesma
 * sessão; getLastPrescription continua síncrona para não exigir nenhuma
 * mudança em ExercisePickerInput.tsx.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RememberedPrescription {
  sets?: string;
  reps?: string;
  cadence?: string;
  rest?: string;
  updatedAt?: number;
}

function normalize(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function keyFor(coachId: string, exerciseName: string) {
  return `rx_mem::${coachId}::${normalize(exerciseName)}`;
}

const profileCache: Record<string, Record<string, RememberedPrescription>> = {};
const loadedFor = new Set<string>();

/** Carrega (1x por coachId, por sessão) o coach_ai_profile pro cache em memória. */
export async function loadCoachProfile(coachId: string | null | undefined): Promise<void> {
  if (!coachId || loadedFor.has(coachId)) return;
  loadedFor.add(coachId);
  try {
    const { data, error } = await supabase
      .from("coach_ai_profile")
      .select("exercise_key, sets, reps, cadence, rest, updated_at")
      .eq("coach_id", coachId);
    if (error) throw error;
    const map: Record<string, RememberedPrescription> = {};
    for (const row of data ?? []) {
      map[row.exercise_key] = {
        sets: row.sets ?? undefined,
        reps: row.reps ?? undefined,
        cadence: row.cadence ?? undefined,
        rest: row.rest ?? undefined,
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : undefined,
      };
    }
    profileCache[coachId] = map;
  } catch {
    // silencioso — picker continua funcionando, só sem sugestão
    loadedFor.delete(coachId);
  }
}

export function saveLastPrescription(
  coachId: string | null | undefined,
  exerciseName: string,
  data: RememberedPrescription,
): void {
  if (!coachId || !exerciseName) return;
  try {
    const clean: RememberedPrescription = {
      sets: data.sets?.trim() || undefined,
      reps: data.reps?.trim() || undefined,
      cadence: data.cadence?.trim() || undefined,
      rest: data.rest?.trim() || undefined,
      updatedAt: Date.now(),
    };
    localStorage.setItem(keyFor(coachId, exerciseName), JSON.stringify(clean));
  } catch { /* noop */ }
}

export function getLastPrescription(
  coachId: string | null | undefined,
  exerciseName: string,
): RememberedPrescription | null {
  if (!coachId || !exerciseName) return null;
  return profileCache[coachId]?.[normalize(exerciseName)] ?? null;
}

/** Presets rápidos exibidos como chips abaixo do input. */
export const QUICK_SET_PRESETS: Array<{ label: string; sets: string; reps: string }> = [
  { label: "4x8-12", sets: "4", reps: "8-12" },
  { label: "3x10-15", sets: "3", reps: "10-15" },
  { label: "5x5", sets: "5", reps: "5" },
  { label: "3x12", sets: "3", reps: "12" },
  { label: "4x15-20", sets: "4", reps: "15-20" },
];
