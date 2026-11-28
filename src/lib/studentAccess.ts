/**
 * studentAccess.ts — situação de pagamento/acesso do aluno e cobrança de planos.
 *
 * As regras ficam no banco (migração 20261128090000_billing_access_rules):
 *  - 7 dias de tolerância depois do vencimento; no 8º dia o acesso é pausado;
 *  - o coach pode liberar até uma data; isentos e parceiras nunca são pausados;
 *  - preço sempre do "Meus Planos", com 10% de parceria só no 1º pagamento de
 *    plano trimestral/semestral;
 *  - pagamento manual e online seguem o mesmo caminho (`apply_paid_charge`).
 *
 * Aqui só chamamos essas funções e traduzimos o resultado para a tela.
 * Falha de rede/servidor NUNCA pausa o aluno (fail-open): a garantia real é
 * a regra do banco.
 */
import { sb } from "@/integrations/supabase/untyped";
import { formatCents } from "@/lib/studentPlans";
import { localDateKey, parseDateOnly } from "@/lib/dateOnly";

export type AccessReason = "ok" | "no_coach" | "exempt" | "granted" | "overdue" | "grace";

export interface AccessState {
  blocked: boolean;
  reason: AccessReason;
  coach_id?: string | null;
  exempt?: boolean;
  exempt_reason?: string | null;
  granted_until?: string | null;
  plan_slug?: string | null;
  plan_name?: string | null;
  plan_kind?: "coaching" | "access" | string | null;
  plan_status?: string | null;
  /** Fim do período pago. */
  paid_through?: string | null;
  /** Vencimento da cobrança de plano em aberto. */
  pending_due?: string | null;
  pending_cents?: number | null;
  overdue_since?: string | null;
  /** Dia em que o acesso é (ou foi) pausado. */
  block_on?: string | null;
}

export interface PlanQuote {
  plan_id: string;
  coach_id: string;
  slug: string;
  name: string;
  kind: "coaching" | "access" | "one_off" | string;
  duration_months: number;
  list_cents: number;
  discount_bp: number;
  discount_cents: number;
  final_cents: number;
  partner_applied: boolean;
  partner_code: string | null;
}

/** "28/11/2026" a partir de "2026-11-28" (sem o erro de 1 dia do fuso). */
export function formatDay(value: string | null | undefined): string {
  const d = parseDateOnly(value ?? null);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}

/** "28/11" — versão curta para selos. */
export function formatDayShort(value: string | null | undefined): string {
  const d = parseDateOnly(value ?? null);
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}

export function formatBRL(cents: number | null | undefined): string {
  return formatCents(Math.round(cents ?? 0)).replace(/\u00a0/g, " ");
}

/** Situação do próprio aluno. null = não deu para verificar (segue liberado). */
export async function fetchMyAccessStatus(): Promise<AccessState | null> {
  try {
    const { data, error } = await sb.rpc("my_access_status");
    if (error || !data) return null;
    return data as AccessState;
  } catch {
    return null;
  }
}

/** Situação de todos os alunos ativos do coach logado. null = indisponível. */
export async function fetchCoachAccessOverview(): Promise<Map<string, AccessState> | null> {
  try {
    const { data, error } = await sb.rpc("coach_access_overview");
    if (error || !Array.isArray(data)) return null;
    return new Map((data as { student_id: string; state: AccessState }[]).map((r) => [r.student_id, r.state]));
  } catch {
    return null;
  }
}

/** Planos do coach do aluno logado, já com o preço final dele. */
export async function fetchMyPlanQuotes(): Promise<PlanQuote[] | null> {
  try {
    const { data, error } = await sb.rpc("my_plan_quotes");
    if (error || !Array.isArray(data)) return null;
    return (data as (PlanQuote | null)[]).filter((q): q is PlanQuote => !!q);
  } catch {
    return null;
  }
}

/** Preço final de um plano para um aluno (o coach confere antes de cobrar). */
export async function fetchPlanQuote(studentId: string, planSlug: string): Promise<PlanQuote | null> {
  const { data, error } = await sb.rpc("plan_quote", { p_student: studentId, p_plan_slug: planSlug });
  if (error) throw error;
  return (data ?? null) as PlanQuote | null;
}

/** Cria a cobrança de um plano (coach). Sem data: herda o atraso ou o fim do período. */
export async function createPlanCharge(args: { studentId: string; planSlug: string; dueDate?: string | null }): Promise<string> {
  const { data, error } = await sb.rpc("create_plan_charge", {
    p_student: args.studentId,
    p_plan_slug: args.planSlug,
    p_due_date: args.dueDate || null,
    p_source: "manual",
    p_provider: null,
  });
  if (error) throw error;
  return data as string;
}

/** Pagamento recebido por fora (PIX, dinheiro...): ativa o plano como no online. */
export async function settleCharge(financeId: string, method: string): Promise<{ applied: boolean; period_end?: string | null; commission_created?: boolean }> {
  const { data, error } = await sb.rpc("coach_settle_charge", { p_finance_id: financeId, p_method: method });
  if (error) throw error;
  return (data ?? { applied: false }) as { applied: boolean; period_end?: string | null; commission_created?: boolean };
}

export type AccessTone = "ok" | "warn" | "danger" | "info" | "muted";

export interface AccessBadge {
  label: string;
  tone: AccessTone;
  /** Linha curta de apoio (ex.: "pausa em 05/12"). */
  detail?: string;
}

/** Texto do selo de situação (Financeiro do coach). */
export function describeAccess(state: AccessState | null | undefined, today: string = localDateKey()): AccessBadge {
  if (!state || state.reason === "no_coach") return { label: "Sem plano", tone: "muted" };
  if (state.reason === "exempt") {
    return state.exempt_reason === "partner"
      ? { label: "Vitalícia", tone: "info", detail: "parceira" }
      : { label: "Isento", tone: "info" };
  }
  if (state.reason === "granted") return { label: `Liberado até ${formatDayShort(state.granted_until)}`, tone: "info" };
  if (state.blocked) return { label: "Acesso pausado", tone: "danger", detail: state.block_on ? `desde ${formatDayShort(state.block_on)}` : undefined };
  if (state.reason === "grace") {
    return { label: "Atrasado", tone: "danger", detail: state.block_on ? `pausa em ${formatDayShort(state.block_on)}` : undefined };
  }
  if (state.paid_through && state.paid_through >= today) {
    return { label: `Em dia até ${formatDayShort(state.paid_through)}`, tone: "ok" };
  }
  if (state.pending_due) return { label: `Vence ${formatDayShort(state.pending_due)}`, tone: "warn" };
  return { label: "Sem plano", tone: "muted" };
}

/** Ordem da lista do Financeiro: o que pede ação primeiro. */
export function accessPriority(state: AccessState | null | undefined): number {
  if (!state) return 5;
  if (state.blocked) return 0;
  if (state.reason === "grace") return 1;
  if (state.pending_due) return 2;
  if (state.reason === "ok" && state.paid_through) return 3;
  if (state.reason === "granted") return 4;
  if (state.reason === "exempt") return 6;
  return 5;
}

/**
 * Sem a regra nova no servidor (migração ainda não aplicada): monta uma
 * situação equivalente à tela antiga, sem nunca pausar ninguém.
 */
export function fallbackAccessState(args: {
  isExempt: boolean;
  pendingDue: string | null;
  pendingCents: number | null;
  sub: { plan_slug: string; plan_name: string; status: string; next_due_date: string | null } | null;
  today?: string;
}): AccessState {
  const today = args.today ?? localDateKey();
  if (args.isExempt) return { blocked: false, reason: "exempt", exempt: true, exempt_reason: "manual" };
  const paidThrough = args.sub && args.sub.status === "active" ? args.sub.next_due_date : null;
  const latest = [paidThrough, args.pendingDue].filter(Boolean).sort().pop() ?? null;
  return {
    blocked: false,
    reason: latest && latest < today ? "grace" : "ok",
    plan_slug: args.sub?.plan_slug ?? null,
    plan_name: args.sub?.plan_name ?? null,
    plan_kind: "coaching",
    plan_status: args.sub?.status ?? null,
    paid_through: paidThrough,
    pending_due: args.pendingDue,
    pending_cents: args.pendingCents,
    overdue_since: latest && latest < today ? latest : null,
    block_on: null,
  };
}

/** Data de hoje + n dias, "AAAA-MM-DD" (para "liberar por 30 dias"). */
export function addDaysKey(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDateKey(d);
}
