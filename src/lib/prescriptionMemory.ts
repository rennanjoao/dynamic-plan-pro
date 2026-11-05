/**
 * prescriptionMemory — lembra a última prescrição usada pelo coach para
 * cada exercício, permitindo autocompletar Sets/Reps/Cadência/Descanso.
 * Escopo por coachId + nome de exercício (case/acento-insensitivo).
 *
 * Passo 8 (F6 — DNA do coach): a fonte é a tabela coach_ai_profile, agregada
 * no banco (RPC refresh_coach_ai_profile) a partir do histórico real de
 * protocol_versions. O cache em memória abaixo evita repetir a consulta na
 * mesma sessão; getLastPrescription continua síncrona para não exigir
 * nenhuma mudança em ExercisePickerInput.tsx.
 *
 * O cache é carregado 1x por sessão (loadCoachProfile). Depois que um
 * protocolo é publicado e o RPC de refresh termina, o ProtocolBuilder chama
 * reloadCoachProfile para o autocompletar já enxergar o que acabou de ser
 * prescrito, sem precisar recarregar a página.
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

const profileCache: Record<string, Record<string, RememberedPrescription>> = {};
const loadedFor = new Set<string>();
// Número da leitura mais recente por coach: se uma leitura antiga terminar
// depois de uma mais nova (ex.: reload logo após publicar), ela é descartada.
const loadSeq: Record<string, number> = {};

/** Carrega (1x por coachId, por sessão) o coach_ai_profile pro cache em memória. */
export async function loadCoachProfile(coachId: string | null | undefined): Promise<void> {
  if (!coachId || loadedFor.has(coachId)) return;
  loadedFor.add(coachId);
  const seq = (loadSeq[coachId] = (loadSeq[coachId] ?? 0) + 1);
  try {
    const { data, error } = await supabase
      .from("coach_ai_profile")
      .select("exercise_key, sets, reps, cadence, rest, updated_at")
      .eq("coach_id", coachId);
    if (error) throw error;
    if (loadSeq[coachId] !== seq) return; // chegou uma leitura mais nova — esta é obsoleta
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
    if (loadSeq[coachId] === seq) loadedFor.delete(coachId);
  }
}

/**
 * Força uma nova leitura do coach_ai_profile (ex.: logo após publicar um
 * protocolo e o refresh_coach_ai_profile concluir). Mantém o cache atual até a
 * nova leitura chegar; se ela falhar, o cache antigo continua valendo.
 */
export async function reloadCoachProfile(coachId: string | null | undefined): Promise<void> {
  if (!coachId) return;
  loadedFor.delete(coachId);
  await loadCoachProfile(coachId);
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
