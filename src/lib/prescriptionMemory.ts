/**
 * prescriptionMemory — memoriza a última prescrição usada pelo coach para
 * cada exercício, permitindo autocompletar Sets/Reps/Cadência/Descanso.
 * Escopo por coachId + nome de exercício (case/acento-insensitivo).
 */

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
  try {
    const raw = localStorage.getItem(keyFor(coachId, exerciseName));
    if (!raw) return null;
    return JSON.parse(raw) as RememberedPrescription;
  } catch {
    return null;
  }
}

/** Presets rápidos exibidos como chips abaixo do input. */
export const QUICK_SET_PRESETS: Array<{ label: string; sets: string; reps: string }> = [
  { label: "4x8-12", sets: "4", reps: "8-12" },
  { label: "3x10-15", sets: "3", reps: "10-15" },
  { label: "5x5", sets: "5", reps: "5" },
  { label: "3x12", sets: "3", reps: "12" },
  { label: "4x15-20", sets: "4", reps: "15-20" },
];