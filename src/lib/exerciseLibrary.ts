import { supabase } from "@/integrations/supabase/client";
import { toExerciseKey } from "@/lib/workoutTypes";
import type { MuscleGroup } from "@/lib/muscleGroupClassifier";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const EXERCISE_GIFS_BUCKET = "exercicios-gifs";

export interface LibraryEntry {
  key: string;
  displayName: string;
  aliases: string[];
  url: string;
  primaryMuscleGroup: MuscleGroup | null;
  secondaryMuscleGroups: MuscleGroup[];
}

let cache: Map<string, LibraryEntry> | null = null;
let inflight: Promise<Map<string, LibraryEntry>> | null = null;

/**
 * Limpa o cache em memória da biblioteca. Precisa ser chamada depois de
 * qualquer escrita em `exercise_library` (upload de gif novo, classificação),
 * senão buscas/matches na mesma aba continuam usando os dados antigos até
 * o próximo reload da página.
 */
export function invalidateExerciseLibraryCache(): void {
  cache = null;
  inflight = null;
}

/**
 * Exportada (era função privada do módulo) para permitir que telas que
 * precisam do Map inteiro — ex. WeeklyVolumeDashboard.tsx, que roda
 * `calculateWeeklyVolume` de forma síncrona sobre todos os exercícios da
 * semana de uma vez — resolvam a Promise UMA vez e guardem o resultado em
 * estado local, em vez de repetir N chamadas a `getLibraryEntry` (uma por
 * exercício). Continua sendo o MESMO cache/inflight-promise usado por todo
 * o resto do arquivo — não é uma segunda fonte de dados.
 */
export async function loadLibrary(): Promise<Map<string, LibraryEntry>> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const map = new Map<string, LibraryEntry>();
    const { data, error } = await supabase
      .from("exercise_library")
      // display_name/aliases/grupos foram adicionados via migrations aditivas; usamos any-cast
      // porque os types gerados podem ainda não conter as novas colunas.
      .select("exercise_key, file_name, display_name, aliases, primary_muscle_group, secondary_muscle_groups")
      // Exclui linhas "só classificação" — criadas pelo RPC classify_exercise_library_entry
      // (disparado no onBlur do picker para registrar grupo muscular) quando o exercício
      // ainda não tem gif de verdade. Sem esse filtro, essas linhas entram no mapa com
      // file_name nulo e getPublicUrl(null) gera uma URL quebrada em vez de "sem gif".
      .not("file_name", "is", null) as unknown as {
        data: Array<{
          exercise_key: string;
          file_name: string;
          display_name: string | null;
          aliases: string[] | null;
          primary_muscle_group: string | null;
          secondary_muscle_groups: string[] | null;
        }> | null;
        error: unknown;
      };

    if (!error && data) {
      for (const row of data) {
        // Segunda trava (defensiva): mesmo que o filtro acima falhe por algum motivo,
        // nunca registra entrada sem file_name real no mapa.
        if (!row.file_name) continue;
        const { data: pub } = supabase.storage
          .from(EXERCISE_GIFS_BUCKET)
          .getPublicUrl(row.file_name);
        map.set(row.exercise_key, {
          key: row.exercise_key,
          displayName: row.display_name?.trim() || row.exercise_key.replace(/_/g, " "),
          aliases: row.aliases ?? [],
          url: pub.publicUrl,
          primaryMuscleGroup: (row.primary_muscle_group as MuscleGroup | null) ?? null,
          secondaryMuscleGroups: (row.secondary_muscle_groups as MuscleGroup[] | null) ?? [],
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

/**
 * Lista TODAS as entradas da biblioteca, ordenadas por nome — usado por
 * telas de navegação/seleção em massa (ex.: CoachExerciseLibraryDialog).
 * Reaproveita o mesmo cache de `loadLibrary()` usado por `searchExerciseLibrary`;
 * não é uma fonte de dados paralela.
 */
export async function listAllLibraryExercises(): Promise<
  Array<{ key: string; displayName: string; url: string }>
> {
  const lib = await loadLibrary();
  return [...lib.values()]
    .map(({ key, displayName, url }) => ({ key, displayName, url }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

/** Entrada da biblioteca por gifKey (preferencial) ou nome. */
export async function getLibraryEntry(
  exerciseName?: string | null,
  gifKey?: string | null,
): Promise<LibraryEntry | null> {
  const lib = await loadLibrary();
  if (gifKey && lib.has(gifKey)) return lib.get(gifKey)!;
  if (!exerciseName) return null;
  return lib.get(toExerciseKey(exerciseName)) ?? null;
}

/**
 * Lista alternativas da biblioteca que compartilham o mesmo grupo muscular
 * primário — usado pelo aluno no Modo Treino para trocar um exercício
 * (ex.: aparelho ocupado) sem sair do estímulo prescrito.
 */
export async function listExercisesByMuscleGroup(
  group: MuscleGroup,
  excludeKey?: string | null,
  limit = 40,
): Promise<LibraryEntry[]> {
  const lib = await loadLibrary();
  return [...lib.values()]
    .filter((e) => e.primaryMuscleGroup === group && e.key !== excludeKey)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, limit);
}

/**
 * Upsert de classificação de grupo muscular para um exercício. Usado pelo
 * picker do coach (quando o coach digita um exercício novo, silenciosamente)
 * e pelo prompt inline de "grupo muscular" (quando o coach preenche a
 * pergunta opcional). Nunca sobrescreve uma classificação `manual`
 * existente com um valor menos confiável (`auto` ou `unclassified`).
 *
 * Este é o único caminho que grava exercícios sem `file_name` — o campo
 * foi tornado opcional na mesma migration que criou as colunas de grupo
 * muscular, justamente para permitir esse cadastro leve.
 */
export async function upsertExerciseClassification(params: {
  exerciseKey: string;
  displayName: string;
  primaryMuscleGroup: MuscleGroup | null;
  secondaryMuscleGroups: MuscleGroup[];
  source: "auto" | "manual" | "unclassified";
}): Promise<{ ok: boolean; error?: string }> {
  try {
    // A prioridade manual > auto > unclassified é resolvida atomicamente
    // dentro da função de banco (SECURITY DEFINER), que também é o único
    // caminho de escrita autorizado para coaches (role user) — INSERT/UPDATE
    // direto na tabela exige role admin via RLS.
    const { error } = await sb.rpc("classify_exercise_library_entry", {
      p_exercise_key: params.exerciseKey,
      p_display_name: params.displayName,
      p_primary_group: params.primaryMuscleGroup,
      p_secondary_groups: params.secondaryMuscleGroups,
      p_source: params.source,
    });

    // Invalida cache local para próximas buscas verem o novo item.
    if (!error) {
      invalidateExerciseLibraryCache();
    }
    return { ok: !error, error: error?.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro desconhecido" };
  }
}
