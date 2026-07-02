import { supabase } from "@/integrations/supabase/client";
import { toExerciseKey } from "@/lib/workoutTypes";

export const EXERCISE_GIFS_BUCKET = "exercicios-gifs";

let cache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

async function loadLibrary(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const map = new Map<string, string>();
    const { data, error } = await supabase
      .from("exercise_library")
      .select("exercise_key, file_name");

    if (!error && data) {
      for (const row of data) {
        const { data: pub } = supabase.storage
          .from(EXERCISE_GIFS_BUCKET)
          .getPublicUrl(row.file_name);
        map.set(row.exercise_key, pub.publicUrl);
      }
    }
    cache = map;
    return map;
  })();

  return inflight;
}

/** Retorna a URL pública do gif do exercício, ou null se não houver match na biblioteca. */
export async function getExerciseGifUrl(exerciseName: string): Promise<string | null> {
  const lib = await loadLibrary();
  return lib.get(toExerciseKey(exerciseName)) ?? null;
}
