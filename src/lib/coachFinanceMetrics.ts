/**
 * coachFinanceMetrics.ts — fórmulas centralizadas do financeiro do COACH.
 *
 * Considera apenas cobranças dos ALUNOS (`coach_finances`).
 * NUNCA inclui `platform_billing_charges` (assinatura da plataforma).
 */

export interface FinanceLike {
  id: string;
  student_id: string | null;
  amount: number | string;
  status: string;             // pending | paid | canceled | refunded | overdue
  due_date: string | null;
  paid_at: string | null;
  source?: string | null;     // 'manual' | 'gateway'
  description?: string | null;
}

export interface FinanceMetrics {
  receitaRecebida: number;
  receitaPrevista: number;
  atrasado: number;
  despesas: number;
  resultado: number;
  ticketMedio: number;
  alunosPagantes: number;
  alunosEmAtraso: number;
}

const num = (v: number | string) => Number(v) || 0;

const isCanceled = (s: string) => s === "canceled" || s === "cancelled" || s === "refunded";

/** Despesa gerencial = lançamento sem aluno e com valor negativo. */
export function isExpense(f: FinanceLike): boolean {
  return !f.student_id && num(f.amount) < 0;
}

export function computeFinanceMetrics(
  finances: FinanceLike[],
  opts: { now?: Date; inMonth?: (iso: string | null) => boolean } = {},
): FinanceMetrics {
  const now = opts.now ?? new Date();
  const inScope = opts.inMonth ?? (() => true);

  const studentCharges = finances.filter((f) => !isExpense(f));
  const expenses = finances.filter(isExpense);

  const paid = studentCharges.filter((f) => f.status === "paid" && inScope(f.paid_at));
  const receitaRecebida = paid.reduce((s, f) => s + num(f.amount), 0);

  const receitaPrevista = studentCharges
    .filter((f) => f.status !== "paid" && !isCanceled(f.status) && inScope(f.due_date))
    .reduce((s, f) => s + num(f.amount), 0);

  const overdue = studentCharges.filter(
    (f) => f.status !== "paid" && !isCanceled(f.status) && f.due_date && new Date(f.due_date) < now,
  );
  const atrasado = overdue.reduce((s, f) => s + num(f.amount), 0);

  const despesas = expenses
    .filter((f) => inScope(f.paid_at ?? f.due_date))
    .reduce((s, f) => s + Math.abs(num(f.amount)), 0);

  const alunosPagantes = new Set(paid.map((f) => f.student_id).filter(Boolean)).size;
  const alunosEmAtraso = new Set(overdue.map((f) => f.student_id).filter(Boolean)).size;

  return {
    receitaRecebida,
    receitaPrevista,
    atrasado,
    despesas,
    resultado: receitaRecebida - despesas,
    ticketMedio: alunosPagantes > 0 ? receitaRecebida / alunosPagantes : 0,
    alunosPagantes,
    alunosEmAtraso,
  };
}
