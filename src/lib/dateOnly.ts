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

/**
 * Chave "AAAA-MM-DD" do dia LOCAL do aparelho.
 *
 * Substitui `new Date().toISOString().slice(0, 10)`, que usa UTC: no Brasil
 * (UTC-3), depois das 21h isso já devolvia o dia SEGUINTE — refeição marcada
 * às 21h30 caía em amanhã, a sequência de treinos quebrava etc.
 * Aceita Date, timestamp ISO (ex.: completed_at do banco) ou epoch ms.
 */
export function localDateKey(value: Date | string | number = new Date()): string {
  // Data "só dia" já é a chave — new Date("AAAA-MM-DD") leria como UTC e voltaria um dia.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
