const DAY = 86_400_000;

/** Dias inteiros (calendário local) entre a data e agora; positivo = passado. */
export function daysAgo(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / DAY);
}

export function lastActivityLabel(iso: string | null | undefined, now = new Date()): string {
  const d = daysAgo(iso, now);
  if (d === null) return "Sem dados";
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  return `há ${d} dias`;
}

/** Vencimento: ends_on, senão next_due_date. */
export function dueLabel(plan: { ends_on?: string | null; next_due_date?: string | null } | null, now = new Date()): string {
  const due = plan?.ends_on || plan?.next_due_date;
  if (!due) return "Plano não informado";
  const d = daysAgo(due, now)!;
  if (d === 0) return "vence hoje";
  if (d < 0) return `vence em ${-d} dia${d === -1 ? "" : "s"}`;
  return `vencido há ${d} dia${d === 1 ? "" : "s"}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}
