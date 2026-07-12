import type { ProtocolChange } from "./protocolChangeDetector";

/**
 * Mescla o array de mudanças já existente (evento aberto, ainda não visto pelo
 * aluno) com a nova leva de mudanças recém-detectadas.
 *
 * Regras:
 *  - Identidade de cada item = `target_anchor` quando não-nulo; caso contrário,
 *    `label` (fallback só pra itens sem anchor, tipo os eventos "geral").
 *  - Se um item novo tem a MESMA identidade de um item existente, o item novo
 *    SUBSTITUI o antigo mantendo a posição original — garante que o aluno vê
 *    o `detail` mais recente.
 *  - Itens novos sem identidade conhecida entram no fim.
 *  - Se o total mesclado passar de 20, colapsa tudo em um único evento "geral"
 *    ("Seu protocolo foi totalmente atualizado pelo seu coach").
 *  - Se o array existente já for esse evento único "geral", mantém como está.
 */
const GLOBAL_UPDATE_LABEL = "Seu protocolo foi totalmente atualizado pelo seu coach";

const globalUpdateEvent = (): ProtocolChange => ({
  category: "geral",
  importance: "alta",
  label: GLOBAL_UPDATE_LABEL,
  target_tab: null,
  target_anchor: null,
  detail: null,
});

const identityOf = (c: ProtocolChange): string =>
  c?.target_anchor ? `a:${c.target_anchor}` : `l:${c?.label ?? ""}`;

const isCollapsedGlobal = (arr: ProtocolChange[]): boolean =>
  arr.length === 1 && arr[0]?.label === GLOBAL_UPDATE_LABEL && arr[0]?.category === "geral";

export function mergeProtocolChanges(
  existing: ProtocolChange[],
  incoming: ProtocolChange[]
): ProtocolChange[] {
  const existingArr = Array.isArray(existing) ? existing : [];
  const incomingArr = Array.isArray(incoming) ? incoming : [];

  if (isCollapsedGlobal(existingArr)) return existingArr;

  const merged: ProtocolChange[] = existingArr.slice();
  const indexByIdentity = new Map<string, number>();
  merged.forEach((c, i) => indexByIdentity.set(identityOf(c), i));

  for (const item of incomingArr) {
    const key = identityOf(item);
    const idx = indexByIdentity.get(key);
    if (idx !== undefined) {
      merged[idx] = item;
    } else {
      indexByIdentity.set(key, merged.length);
      merged.push(item);
    }
  }

  if (merged.length > 20) return [globalUpdateEvent()];
  return merged;
}