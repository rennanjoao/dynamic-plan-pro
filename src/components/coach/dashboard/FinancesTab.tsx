/**
 * FinancesTab — Financeiro do coach.
 *
 * Uma linha por aluno: plano, situação (em dia, atrasado, pausado, liberado,
 * isento, vitalícia), uma ação principal (Cobrar ou Receber) e um menu "⋯".
 * Preço, desconto de parceria, vencimento, bloqueio e ativação do plano são
 * regras do banco (ver src/lib/studentAccess.ts); aqui só mostramos e chamamos.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign, Calendar, AlertTriangle, Lock, MoreHorizontal, Plus, HandCoins } from "lucide-react";
import { sb } from "@/integrations/supabase/untyped";
import { useCoachFinances, type FinanceRecord } from "@/hooks/useCoachFinances";
import { usePlatformBilling, worstPlatformStatus } from "@/hooks/usePlatformBilling";
import type { StudentLite } from "@/hooks/useCoachStudents";
import { queryKeys } from "@/lib/queryKeys";
import { useConfirm } from "@/components/ConfirmProvider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatCard } from "./dashboardUtils";
import { useStudentPlanCatalog, useCoachSubscriptions } from "@/hooks/useStudentPlans";
import { PlanCatalogManager } from "./PlanCatalogManager";
import { computeFinanceMetrics } from "@/lib/coachFinanceMetrics";
import { Private } from "@/components/coach/PrivacyMode";
import { parseDateOnly } from "@/lib/dateOnly";
import {
  accessPriority, describeAccess, fallbackAccessState, fetchCoachAccessOverview, formatBRL,
  type AccessState, type AccessTone,
} from "@/lib/studentAccess";
import { ChargeDialog, GrantAccessDialog, ReceiveDialog } from "./FinanceDialogs";
import { chargeCents } from "@/lib/financeActions";

const TONE_CLASS: Record<AccessTone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  danger: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
  info: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground border-border",
};

function isSameMonth(dateStr: string | null | undefined) {
  if (!dateStr) return false;
  const d = parseDateOnly(dateStr);
  const now = new Date();
  return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** "R$ 1.250" — valores redondos nos cartões de resumo. */
function brlRound(reais: number): string {
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");
}

const isPlanCharge = (f: FinanceRecord) => f.charge_kind !== "one_off";
const byDue = (a: FinanceRecord, b: FinanceRecord) =>
  (parseDateOnly(a.due_date)?.getTime() ?? Infinity) - (parseDateOnly(b.due_date)?.getTime() ?? Infinity);

interface Row {
  student: StudentLite;
  state: AccessState;
  open: FinanceRecord[];
  planName: string | null;
  planPrice: number | null;
  accessOnly: boolean;
}

export function FinancesTab({ coachId, students }: { coachId: string; students: StudentLite[] }) {
  const { data: finances = [], isLoading } = useCoachFinances(coachId);
  const { data: platformCharges = [] } = usePlatformBilling(coachId);
  const platformStatus = worstPlatformStatus(platformCharges);
  const { data: planCatalog = [] } = useStudentPlanCatalog(coachId);
  const { data: subscriptions = [] } = useCoachSubscriptions(coachId);
  const { data: overview = null, isLoading: loadingOverview } = useQuery({
    queryKey: ["coach-access-overview", coachId],
    enabled: !!coachId,
    queryFn: fetchCoachAccessOverview,
  });
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [chargeFor, setChargeFor] = useState<StudentLite | null>(null);
  const [receiveFor, setReceiveFor] = useState<string | null>(null);
  const [grantFor, setGrantFor] = useState<{ student: StudentLite; current: string | null } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.coachFinances(coachId) });
    qc.invalidateQueries({ queryKey: queryKeys.coachStudentSubscriptions() });
    qc.invalidateQueries({ queryKey: ["coach-access-overview", coachId] });
    qc.invalidateQueries({ queryKey: ["coach-priority-queue", coachId] });
    qc.invalidateQueries({ queryKey: queryKeys.coachStudentsLite(coachId) });
  };

  // Planos que o coach cobra: os dele; sem nenhum próprio, os padrão.
  const chargePlans = useMemo(() => {
    const own = planCatalog.filter((p) => p.coach_id === coachId && p.is_active);
    return own.length ? own : planCatalog.filter((p) => p.is_active);
  }, [planCatalog, coachId]);

  const rows: Row[] = useMemo(() => {
    const subByStudent = new Map(
      subscriptions.filter((s) => ["active", "pending", "overdue"].includes(s.status)).map((s) => [s.student_id, s]),
    );
    return students
      .map((student) => {
        const open = finances.filter((f) => f.student_id === student.id && f.status === "pending" && Number(f.amount) > 0).sort(byDue);
        const plan = open.find(isPlanCharge) ?? null;
        const sub = subByStudent.get(student.id) ?? null;
        const state = overview?.get(student.id) ?? fallbackAccessState({
          isExempt: student.isExempt,
          pendingDue: plan?.due_date ?? null,
          pendingCents: plan ? chargeCents(plan) : null,
          sub,
        });
        const paidPlan = sub && sub.status !== "pending" ? sub : null;
        return {
          student,
          state,
          open,
          planName: paidPlan?.plan_name ?? state.plan_name ?? null,
          planPrice: paidPlan?.price_cents ?? null,
          accessOnly: state.plan_kind === "access",
        };
      })
      .sort((a, b) => accessPriority(a.state) - accessPriority(b.state) || a.student.name.localeCompare(b.student.name, "pt-BR"));
  }, [students, finances, subscriptions, overview]);

  const metrics = computeFinanceMetrics(finances, { inMonth: isSameMonth });
  const pausedCount = rows.filter((r) => r.state.blocked).length;
  const receiveRow = rows.find((r) => r.student.id === receiveFor) ?? null;

  const toggleExempt = async (row: Row) => {
    const next = !row.student.isExempt;
    const partner = row.state.exempt_reason === "partner";
    if (!next && !(await confirm({
      title: partner ? "Remover vitalícia" : "Remover isenção",
      description: partner
        ? `${row.student.name} é parceira e está vitalícia. Sem a isenção, ela passa a ser cobrada como os outros alunos.`
        : `${row.student.name} volta a ser cobrado(a) normalmente.`,
      confirmLabel: "Remover",
      destructive: true,
    }))) return;
    const { error } = await sb.from("coach_students")
      .update({ is_exempt: next, exempt_reason: next ? "manual" : null })
      .eq("coach_id", coachId).eq("student_id", row.student.id);
    if (error) { toast.error("Não foi possível atualizar a isenção."); return; }
    toast.success(next ? "Aluno isento de cobranças." : "Isenção removida.");
    refresh();
  };

  return (
    <div className="space-y-5">
      {platformStatus && (
        <div role="status" className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
          platformStatus === "blocked"
            ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400"
        }`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold">
              {platformStatus === "blocked" ? "Assinatura da plataforma bloqueada" : "Assinatura da plataforma pendente"}
            </p>
            <p className="text-[11px] mt-0.5 opacity-90">
              {platformCharges.map((c) => `${c.period} — ${formatBRL(Math.round(Number(c.amount) * 100))}`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Recebido no mês" value={brlRound(metrics.receitaRecebida)} icon={<DollarSign className="w-4 h-4" />} accent="#10B981" />
        <StatCard label="A receber no mês" value={brlRound(metrics.receitaPrevista)} icon={<Calendar className="w-4 h-4" />} accent="#F59E0B" />
        <StatCard label="Em atraso" value={brlRound(metrics.atrasado)} icon={<AlertTriangle className="w-4 h-4" />} accent="#EF4444" />
        <StatCard label="Acesso pausado" value={overview ? pausedCount : "—"} icon={<Lock className="w-4 h-4" />} accent="#64748B" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Alunos</h3>
          <p className="text-xs text-muted-foreground">
            Quem não paga tem 7 dias de tolerância; no 8º dia o app pausa e mostra os planos para pagar.
          </p>
        </div>
        <PlanCatalogManager coachId={coachId} />
      </div>

      {isLoading || loadingOverview ? (
        <div className="space-y-2" aria-busy="true" aria-label="Carregando alunos">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno ativo para faturar.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] gap-4 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/40">
            <span>Aluno</span><span>Plano</span><span>Situação</span><span className="w-[148px] text-right">Ação</span>
          </div>
          {rows.map((row) => {
            const badge = describeAccess(row.state);
            const openCents = row.open.reduce((s, f) => s + chargeCents(f), 0);
            const exempt = row.state.reason === "exempt" || row.student.isExempt;
            return (
              <div key={row.student.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate"><Private>{row.student.name}</Private></p>
                  {row.accessOnly && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border text-muted-foreground" title="Plano só de acesso: sem alertas de acompanhamento">
                      Só acesso
                    </span>
                  )}
                </div>

                <div className="row-start-2 md:row-start-auto min-w-0 text-xs text-muted-foreground truncate">
                  {row.planName
                    ? <>{row.planName}{row.planPrice ? ` · ${formatBRL(row.planPrice)}` : ""}</>
                    : "Sem plano"}
                </div>

                <div className="row-start-3 md:row-start-auto min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONE_CLASS[badge.tone]}`}>{badge.label}</span>
                  {badge.detail && <span className="text-[11px] text-muted-foreground">{badge.detail}</span>}
                  {openCents > 0 && <span className="text-[11px] font-medium text-foreground">{formatBRL(openCents)} em aberto</span>}
                </div>

                <div className="row-span-3 md:row-span-1 col-start-2 md:col-start-auto row-start-1 md:row-start-auto flex items-center justify-end gap-1 md:w-[148px]">
                  {row.open.length > 0 ? (
                    <Button size="sm" className="h-8 gap-1.5" onClick={() => setReceiveFor(row.student.id)}>
                      <HandCoins className="w-3.5 h-3.5" aria-hidden="true" /> Receber
                    </Button>
                  ) : !exempt ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setChargeFor(row.student)}>
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Cobrar
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Mais opções para ${row.student.name}`}>
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {!exempt && (
                        <DropdownMenuItem onSelect={() => setChargeFor(row.student)}>Nova cobrança</DropdownMenuItem>
                      )}
                      {!exempt && (
                        <DropdownMenuItem onSelect={() => setGrantFor({ student: row.student, current: row.state.granted_until ?? null })}>
                          {row.state.granted_until ? "Alterar liberação de acesso" : "Liberar acesso até…"}
                        </DropdownMenuItem>
                      )}
                      {!exempt && <DropdownMenuSeparator />}
                      <DropdownMenuItem onSelect={() => void toggleExempt(row)}>
                        {exempt ? (row.state.exempt_reason === "partner" ? "Remover vitalícia (parceira)" : "Remover isenção") : "Isentar de cobrança"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLoading ? null : overview === null && students.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Situação de acesso indisponível no momento; mostrando só as cobranças.
        </p>
      )}

      <ChargeDialog
        open={!!chargeFor}
        onOpenChange={(o) => { if (!o) setChargeFor(null); }}
        student={chargeFor}
        plans={chargePlans}
        coachId={coachId}
        onDone={refresh}
      />
      <ReceiveDialog
        open={!!receiveRow && receiveRow.open.length > 0}
        onOpenChange={(o) => { if (!o) setReceiveFor(null); }}
        studentName={receiveRow?.student.name ?? ""}
        charges={receiveRow?.open ?? []}
        onChanged={refresh}
      />
      <GrantAccessDialog
        open={!!grantFor}
        onOpenChange={(o) => { if (!o) setGrantFor(null); }}
        student={grantFor?.student ?? null}
        current={grantFor?.current ?? null}
        coachId={coachId}
        onDone={refresh}
      />
    </div>
  );
}

export default FinancesTab;
