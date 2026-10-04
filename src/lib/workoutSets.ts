// src/lib/workoutSets.ts
// Regras puras do Modo Treino para as séries de UM exercício (estado local).
// Ficam fora do componente para serem testadas sem renderizar nada.

/** Série como guardada no estado local do Modo Treino (e no localStorage). */
export interface LocalSetData {
  weight?: number;
  reps?: number;
  effort?: 1 | 2 | 3 | null;
  done?: boolean;
  skipped?: boolean;
  /** Momento real em que a série foi feita (ISO). Preservado ao editar/renumerar. */
  executedAt?: string;
}

type Slot<T> = T | null | undefined;

/**
 * Índice da PRÓXIMA série a registrar: a primeira posição sem série concluída.
 * Diferente de "contar as concluídas": se o estado tiver um buraco (série que
 * não chegou ao servidor, `null` vindo do localStorage), a próxima série
 * preenche o buraco em vez de sobrescrever uma série que já existe.
 */
export function nextSetIndex(sets: ReadonlyArray<Slot<LocalSetData>>): number {
  for (let i = 0; i < sets.length; i++) {
    if (!sets[i]?.done) return i;
  }
  return sets.length;
}

/** Quantas séries estão concluídas (pulada também conta como "consumida"). */
export function countDoneSets(sets: ReadonlyArray<Slot<LocalSetData>>): number {
  let n = 0;
  for (let i = 0; i < sets.length; i++) if (sets[i]?.done) n++;
  return n;
}

export interface SetRemovalPlan<T extends LocalSetData> {
  /** Séries restantes, já compactadas e renumeradas (índice 0 = série 1). */
  nextSets: T[];
  /** Primeiro número de série (1-based) cujo conteúdo muda no servidor. */
  fromSetNumber: number;
  /** Séries que mudam de número, já com o número NOVO. */
  shifted: { setNumber: number; data: T }[];
  /** Quantas séries devem sobrar no servidor para este exercício. */
  keepCount: number;
}

/**
 * Remover a série do meio NÃO pode deixar o servidor com a numeração antiga:
 * no banco a série é identificada por (sessão, exercício, nº da série), então
 * "tirar a 2 de 3" tem de virar "reescrever a 2 com o conteúdo da 3 e apagar
 * tudo acima de 2". Este plano descreve exatamente isso.
 */
export function planSetRemoval<T extends LocalSetData>(
  sets: ReadonlyArray<Slot<T>>,
  removedIdx: number,
): SetRemovalPlan<T> {
  const all = Array.from(sets);
  const hole = all.findIndex((s, i) => i < removedIdx && !s);
  const firstChangedIdx = hole >= 0 ? hole : Math.max(0, removedIdx);
  const nextSets = all.filter((s, i): s is T => i !== removedIdx && !!s);
  return {
    nextSets,
    fromSetNumber: firstChangedIdx + 1,
    shifted: nextSets.slice(firstChangedIdx).map((data, j) => ({ setNumber: firstChangedIdx + j + 1, data })),
    keepCount: nextSets.length,
  };
}

/**
 * "Novo recorde" só existe quando há um recorde ANTERIOR para bater.
 * - sem baseline (primeiro treino do exercício, ou histórico ainda carregando):
 *   nunca é recorde — evita comemorar a primeira carga da vida;
 * - compara com o melhor de sempre do exercício (qualquer semana/fase) e com o
 *   melhor já feito nesta sessão.
 */
export function isNewRecord(
  weightKg: number,
  baselineKg: number | null | undefined,
  sessionBestKg: number,
): boolean {
  if (!(weightKg > 0)) return false;
  if (baselineKg == null || !(baselineKg > 0)) return false;
  return weightKg > Math.max(baselineKg, sessionBestKg || 0);
}
