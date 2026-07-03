import { supabase } from "@/integrations/supabase/client";
import { toExerciseKey } from "@/lib/workoutTypes";

export const EXERCISE_GIFS_BUCKET = "exercicios-gifs";

export interface LibraryEntry {
  key: string;
  displayName: string;
  aliases: string[];
  url: string;
}

let cache: Map<string, LibraryEntry> | null = null;
let inflight: Promise<Map<string, LibraryEntry>> | null = null;

async function loadLibrary(): Promise<Map<string, LibraryEntry>> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const map = new Map<string, LibraryEntry>();
    const { data, error } = await supabase
      .from("exercise_library")
      // display_name/aliases foram adicionados via migration aditiva; usamos any-cast porque
      // os types gerados podem ainda não conter as novas colunas.
      .select("exercise_key, file_name, display_name, aliases") as unknown as {
        data: Array<{ exercise_key: string; file_name: string; display_name: string | null; aliases: string[] | null }> | null;
        error: unknown;
      };

    if (!error && data) {
      for (const row of data) {
        const { data: pub } = supabase.storage
          .from(EXERCISE_GIFS_BUCKET)
          .getPublicUrl(row.file_name);
        map.set(row.exercise_key, {
          key: row.exercise_key,
          displayName: row.display_name?.trim() || row.exercise_key.replace(/_/g, " "),
          aliases: row.aliases ?? [],
          url: pub.publicUrl,
        });
      }
    }
    cache = map;
    return map;
  })();

  return inflight;
}

/**
 * Retorna a URL pública do gif do exercício, ou null se não houver match na biblioteca.
 * Se `gifKey` for informado e existir na lib, resolve por ele diretamente (match garantido).
 * Caso contrário, cai no fallback por nome — mantendo compatibilidade com protocolos
 * antigos que nunca gravaram gifKey.
 */
export async function getExerciseGifUrl(
  exerciseName: string,
  gifKey?: string,
): Promise<string | null> {
  const lib = await loadLibrary();
  if (gifKey) {
    const byKey = lib.get(gifKey);
    if (byKey) return byKey.url;
  }
  return lib.get(toExerciseKey(exerciseName))?.url ?? null;
}

/**
 * Busca em memória por exercícios cujo `exercise_key`, `display_name` ou algum alias
 * contém o termo. Case/acento-insensitive.
 */
export async function searchExerciseLibrary(
  query: string,
  limit = 8,
): Promise<Array<{ key: string; displayName: string; url: string }>> {
  const lib = await loadLibrary();
  const q = query.trim();
  if (!q) return [];
  const needle = toExerciseKey(q);
  const results: Array<{ key: string; displayName: string; url: string; score: number }> = [];
  for (const entry of lib.values()) {
    const haystacks = [entry.key, toExerciseKey(entry.displayName), ...entry.aliases.map(toExerciseKey)];
    let score = -1;
    for (const h of haystacks) {
      if (h === needle) { score = 100; break; }
      if (h.startsWith(needle)) { score = Math.max(score, 50); continue; }
      if (h.includes(needle)) { score = Math.max(score, 10); }
    }
    if (score >= 0) {
      results.push({ key: entry.key, displayName: entry.displayName, url: entry.url, score });
    }
  }
  results.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return results.slice(0, limit).map(({ key, displayName, url }) => ({ key, displayName, url }));
}
