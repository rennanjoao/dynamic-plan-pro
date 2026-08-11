/**
 * coachPriorityQueue.ts — regras puras de ordenação/recorte da fila de
 * prioridade do coach, compartilhadas pelo painel visual e pelo contexto
 * enviado ao assistente de IA.
 */

export type QueueSeverity = "critical" | "warning" | "info";

export const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** Máximo de itens da fila enviados ao assistente de IA. */
export const AI_QUEUE_LIMIT = 10;

export interface QueueSortable {
  severity: string;
  reference_at: string;
}

/** Severidade (critical → warning → info) e depois reference_at mais recente. */
export function sortPriorityQueue<T extends QueueSortable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
    if (diff !== 0) return diff;
    return new Date(b.reference_at).getTime() - new Date(a.reference_at).getTime();
  });
}

export interface QueueRowLite extends QueueSortable {
  student_id: string | null;
  source: string;
  title: string;
  message: string;
}

export interface OpenAlert {
  studentName: string;
  source: string;
  severity: string;
  title: string;
  message: string;
}

/** Fila ordenada e limitada, já resolvida com o nome do aluno. */
export function buildOpenAlerts(
  rows: QueueRowLite[],
  nameById: Map<string, string | null | undefined>,
  limit: number = AI_QUEUE_LIMIT,
): OpenAlert[] {
  return sortPriorityQueue(rows)
    .slice(0, limit)
    .map((r) => ({
      studentName: (r.student_id ? nameById.get(r.student_id) : null) ?? "Aluno",
      source: r.source,
      severity: r.severity,
      title: r.title,
      message: r.message,
    }));
}

/** Detalhe legível dos grupamentos acima do MRV vindos do context do alerta. */
export function formatMrvGroups(context: unknown): { label: string; series: number }[] {
  const groups = (context as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((g): g is { label?: string; group?: string; series?: number } => !!g && typeof g === "object")
    .map((g) => ({ label: String(g.label ?? g.group ?? ""), series: Number(g.series ?? 0) }))
    .filter((g) => g.label.length > 0);
}
