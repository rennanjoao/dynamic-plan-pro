/**
 * slug.ts
 *
 * Helper compartilhado para gerar identificadores estáveis a partir de nomes
 * humanos (exercícios, refeições, suplementos, alimentos). O MESMO helper é
 * usado no ProtocolBuilder (coach) e na tela do aluno para garantir que os
 * `target_anchor` gerados em `protocol_change_events` batem com os ids
 * renderizados no DOM.
 *
 * Regras:
 *  - minúsculo
 *  - acentos removidos (NFD)
 *  - qualquer sequência de caracteres não [a-z0-9] vira um único "-"
 *  - sem "-" no começo/fim
 */
export function slug(input: unknown): string {
  const s = typeof input === "string" ? input : input == null ? "" : String(input);
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}