/**
 * Datas "só dia" (coluna `date` do banco, ex.: due_date = "2026-11-10").
 *
 * `new Date("2026-11-10")` lê como meia-noite UTC; no Brasil (UTC-3) isso vira 21h do dia ANTERIOR.
 * Resultado: cobrança aparecia "em atraso" desde a noite anterior ao vencimento e o aluno via
 * "1 dia" quando faltavam 2. Aqui a data vira meia-noite LOCAL, que é o que o usuário espera.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Meia-noite local de hoje. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True quando o vencimento já passou: só considera atrasado a partir do dia SEGUINTE ao vencimento. */
export function isPastDue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  const due = parseDateOnly(dueDate);
  return !!due && due < startOfToday(now);
}
