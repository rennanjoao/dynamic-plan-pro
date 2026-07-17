/**
 * Utilitários centralizados de formatação de data em pt-BR.
 * Migração incremental — não altera nenhum comportamento existente,
 * apenas centraliza funções que estavam duplicadas em várias páginas.
 */

export function formatDatePtBR(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTimePtBR(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR");
}

/**
 * "hoje" · "ontem" · "há N dias" · "há N semana(s)" · dd/MM/yyyy (>= 30 dias).
 * Comportamento idêntico ao helper que existia inline em Evolution.tsx.
 */
export function formatRelativePtBR(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `há ${weeks} semana${weeks > 1 ? "s" : ""}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR");
}