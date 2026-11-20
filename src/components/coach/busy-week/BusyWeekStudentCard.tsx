/**
 * Protocolo da aluna → aba Treinos → card "Semana Corrida".
 *
 * Anexa o treino secundário (Full Body / Upper-Lower) à aluna que o coach está
 * montando: escolher um plano da biblioteca, criar um novo, ajustar só para
 * ela, atualizar com a biblioteca ou desativar. Vale na hora — não depende de
 * salvar/publicar o protocolo (fica numa tabela própria, não no payload).
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Library, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BUSY_SQL_MISSING_MSG, useApplyBusyWeekPlan, useBusyWeekAssignments, useBusyWeekPlans,
  useSaveAssignmentPayload, useSaveBusyWeekPlan, useSetBusyWeekEnabled,
} from "@/hooks/useBusyWeek";
import { BUSY_KIND_LABEL, busyLetter, isAssignmentOutdated } from "@/lib/busyWeek";
import { BusyWeekPlanEditor, type BusyPlanDraft } from "./BusyWeekPlanEditor";
import { BusyWeekManager } from "./BusyWeekManager";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "a aluna";

export function BusyWeekStudentCard({ coachId, studentId, studentName }: { coachId: string | null; studentId: string; studentName: string }) {
  const { data: plansData, isLoading } = useBusyWeekPlans(coachId);
  const { data: assignments = [] } = useBusyWeekAssignments(coachId);
  const savePlan = useSaveBusyWeekPlan(coachId);
  const applyPlan = useApplyBusyWeekPlan(coachId);
  const setEnabled = useSetBusyWeekEnabled(coachId);
  const saveAssignment = useSaveAssignmentPayload(coachId);

  const plans = useMemo(() => plansData?.plans ?? [], [plansData]);
  const missingTable = !!plansData?.missingTable;
  const assignment = assignments.find((a) => a.student_id === studentId) ?? null;
  const active = assignment?.enabled ? assignment : null;
  const plan = active?.plan_id ? plans.find((p) => p.id === active.plan_id) ?? null : null;
  const outdated = active && plan ? isAssignmentOutdated(active, plan.updated_at) : false;
  const who = firstName(studentName);

  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string>("");
  const [editor, setEditor] = useState<null | "new" | "student">(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const activate = (planId: string) => {
    const p = plans.find((x) => x.id === planId);
    if (!p) return;
    applyPlan.mutate(
      { plan: p, studentIds: [studentId] },
      {
        onSuccess: () => { toast.success(`Semana Corrida "${p.name}" liberada para ${who}.`); setPicking(false); setChosen(""); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ativar."),
      },
    );
  };

  const handleSave = (draft: BusyPlanDraft) => {
    if (editor === "student" && active) {
      saveAssignment.mutate(
        { studentId, payload: draft.payload },
        {
          onSuccess: () => { toast.success(`Ajuste salvo só para ${who}.`); setEditor(null); },
          onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
        },
      );
      return;
    }
    savePlan.mutate(draft, {
      onSuccess: (saved) => {
        setEditor(null);
        applyPlan.mutate(
          { plan: saved, studentIds: [studentId] },
          {
            onSuccess: () => toast.success(`Plano "${saved.name}" criado na biblioteca e liberado para ${who}.`),
            onError: (e) => toast.error(e instanceof Error ? e.message : "Plano salvo, mas não foi possível ativar."),
          },
        );
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
    });
  };

  const planPicker = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={chosen} onValueChange={setChosen}>
        <SelectTrigger className="h-9 w-full sm:w-64" data-testid="busy-student-plan-select">
          <SelectValue placeholder={plans.length ? "Escolha um plano da biblioteca" : "Biblioteca vazia"} />
        </SelectTrigger>
        <SelectContent>
          {plans.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} · {BUSY_KIND_LABEL[p.kind]} · {p.payload.workouts.length} treino(s)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-9" disabled={!chosen || applyPlan.isPending} onClick={() => activate(chosen)} data-testid="busy-student-activate">
        Liberar para {who}
      </Button>
    </div>
  );

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 mb-4" data-testid="busy-student-card">
      <div className="flex items-start gap-3">
        <CalendarClock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Semana Corrida — treino secundário</p>
          <p className="text-xs text-muted-foreground">
            Full Body ou Upper/Lower para semanas apertadas, anexado a este protocolo. {who} escolhe quando usar e quando
            voltar; a dieta acompanha treino/descanso. Vale na hora, sem precisar publicar o protocolo.
          </p>
        </div>
      </div>

      {missingTable ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs" role="alert" data-testid="busy-student-missing-sql">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> {BUSY_SQL_MISSING_MSG}
        </div>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : active ? (
        <div className="space-y-2" data-testid="busy-student-active">
          <div className="rounded-lg border border-border bg-background/70 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{active.plan_name || "Plano"}</span>
              <span className="text-xs text-muted-foreground">{BUSY_KIND_LABEL[active.kind]}</span>
              {active.student_on
                ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Usando desde {fmt(active.student_on_since)}</Badge>
                : <Badge variant="secondary">Liberado · ela está na rotina normal</Badge>}
              {active.customized && <Badge variant="outline">Ajustado só pra ela</Badge>}
              {outdated && <Badge variant="outline" className="border-amber-500/60 text-amber-600">Biblioteca tem versão nova</Badge>}
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {active.payload.workouts.map((w, i) => (
                <li key={w.key}>
                  <span className="font-semibold text-foreground">{busyLetter(i)}</span> · {w.focus || "Treino"} ·{" "}
                  {w.exercises.filter((e) => String(e.name ?? "").trim()).length} exercício(s)
                </li>
              ))}
              <li>
                {active.payload.sessionsPerWeek}x/semana ·{" "}
                {active.payload.periodization.enabled ? "com periodização" : "faixa fixa"}
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditor("student")} data-testid="busy-student-adjust">
              <Pencil className="w-3.5 h-3.5" /> Ajustar só para {who}
            </Button>
            {outdated && plan && (
              <Button size="sm" variant="outline" className="h-8 gap-1" disabled={applyPlan.isPending} onClick={() => activate(plan.id)}>
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar com a biblioteca
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8" onClick={() => setPicking((v) => !v)}>
              Trocar plano
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:text-destructive"
              disabled={setEnabled.isPending}
              onClick={() => setEnabled.mutate(
                { studentIds: [studentId], enabled: false },
                { onSuccess: () => toast.success(`Semana Corrida desativada para ${who}.`) },
              )}
              data-testid="busy-student-disable"
            >
              Desativar
            </Button>
          </div>
          {picking && planPicker}
        </div>
      ) : (
        <div className="space-y-2" data-testid="busy-student-empty">
          {assignment && !assignment.enabled && (
            <p className="text-xs text-muted-foreground">
              Desativada (último plano: {assignment.plan_name || "—"}).{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => setEnabled.mutate(
                  { studentIds: [studentId], enabled: true },
                  { onSuccess: () => toast.success(`Semana Corrida liberada de novo para ${who}.`) },
                )}
              >
                Reativar
              </button>
            </p>
          )}
          {plans.length > 0 && planPicker}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={plans.length ? "outline" : "default"} className="h-8 gap-1" onClick={() => setEditor("new")} data-testid="busy-student-new">
              <Plus className="w-3.5 h-3.5" /> Criar plano novo
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setLibraryOpen(true)}>
              <Library className="w-3.5 h-3.5" /> Biblioteca completa
            </Button>
          </div>
        </div>
      )}

      <BusyWeekPlanEditor
        open={!!editor}
        onOpenChange={(v) => { if (!v) setEditor(null); }}
        coachId={coachId}
        initial={editor === "student" && active ? { name: active.plan_name, kind: active.kind, payload: active.payload } : null}
        title={editor === "student" ? `Ajustar só para ${who}` : "Novo plano da Semana Corrida"}
        description={editor === "student"
          ? "Muda só a cópia desta aluna. Os outros alunos com o mesmo plano não são afetados."
          : `O plano fica salvo na sua biblioteca (para reutilizar) e é liberado para ${who} ao salvar.`}
        lockName={editor === "student"}
        saving={savePlan.isPending || saveAssignment.isPending || applyPlan.isPending}
        onSave={handleSave}
      />
      {libraryOpen && <BusyWeekManager open={libraryOpen} onOpenChange={setLibraryOpen} coachId={coachId} />}
    </div>
  );
}
