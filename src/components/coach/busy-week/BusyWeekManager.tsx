/**
 * Coach → Treinos → "Semana Corrida": biblioteca de planos secundários
 * (Full Body / Upper-Lower), ativação para várias alunas de uma vez, ajuste
 * só de uma aluna e "atualizar nas alunas que usam".
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ConfirmProvider";
import { Private } from "@/components/coach/PrivacyMode";
import { useCoachStudentsLite } from "@/hooks/useCoachStudents";
import {
  BUSY_SQL_MISSING_MSG, useApplyBusyWeekPlan, useBusyWeekAssignments, useBusyWeekPlans, useDeleteBusyWeekPlan,
  useSaveAssignmentPayload, useSaveBusyWeekPlan, useSetBusyWeekEnabled,
  type BusyWeekAssignment, type BusyWeekPlan,
} from "@/hooks/useBusyWeek";
import { BUSY_KIND_LABEL, isAssignmentOutdated } from "@/lib/busyWeek";
import { BusyWeekPlanEditor, type BusyPlanDraft } from "./BusyWeekPlanEditor";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const norm = (v: string) => (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type EditorState =
  | { mode: "plan"; plan: BusyWeekPlan | null; kindForNew?: BusyWeekPlan["kind"] }
  | { mode: "student"; assignment: BusyWeekAssignment; studentName: string };

/** Escolher alunas (com busca e "todas"). */
function StudentPicker({
  open, onOpenChange, title, description, students, preselected, notes, confirmLabel, busy, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  students: Array<{ id: string; name: string }>;
  preselected: Set<string>;
  notes: Record<string, string>;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(preselected);
  const [search, setSearch] = useState("");
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) { setSelected(new Set(preselected)); setSearch(""); }
  }
  const q = norm(search.trim());
  const list = q ? students.filter((s) => norm(s.name).includes(q)) : students;
  const allOn = list.length > 0 && list.every((s) => selected.has(s.id));
  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col" data-testid="busy-student-picker">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {students.length > 6 && (
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluna..." className="h-9" />
        )}
        <button
          type="button"
          className="self-start text-xs text-primary underline underline-offset-2"
          onClick={() => setSelected((prev) => {
            const n = new Set(prev);
            list.forEach((s) => (allOn ? n.delete(s.id) : n.add(s.id)));
            return n;
          })}
        >
          {allOn ? "Desmarcar todas" : "Marcar todas"}
        </button>
        <ul className="flex-1 overflow-y-auto space-y-1 pr-1">
          {list.map((s) => (
            <li key={s.id}>
              <label className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} data-testid={`pick-${s.id}`} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm"><Private>{s.name || "Aluna"}</Private></span>
                  {notes[s.id] && <span className="block text-[11px] text-muted-foreground">{notes[s.id]}</span>}
                </span>
              </label>
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-muted-foreground text-center py-6">Nenhuma aluna encontrada.</li>}
        </ul>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => onConfirm([...selected])} disabled={busy || selected.size === 0} data-testid="busy-picker-confirm">
            {confirmLabel} {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BusyWeekManager({ open, onOpenChange, coachId }: { open: boolean; onOpenChange: (v: boolean) => void; coachId: string | null }) {
  const confirm = useConfirm();
  const { data: plansData, isLoading: loadingPlans } = useBusyWeekPlans(open ? coachId : null);
  const { data: assignments = [] } = useBusyWeekAssignments(open ? coachId : null);
  const { data: students = [] } = useCoachStudentsLite(open ? coachId : null);
  const savePlan = useSaveBusyWeekPlan(coachId);
  const deletePlan = useDeleteBusyWeekPlan(coachId);
  const applyPlan = useApplyBusyWeekPlan(coachId);
  const setEnabled = useSetBusyWeekEnabled(coachId);
  const saveAssignment = useSaveAssignmentPayload(coachId);

  const plans = plansData?.plans ?? [];
  const missingTable = !!plansData?.missingTable;
  const nameOf = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
  const studentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const myAssignments = assignments.filter((a) => studentIds.has(a.student_id));

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [activating, setActivating] = useState<BusyWeekPlan | null>(null);
  const [syncing, setSyncing] = useState<BusyWeekPlan | null>(null);

  const usersOf = (planId: string) => myAssignments.filter((a) => a.plan_id === planId && a.enabled);

  const editorInitial: BusyPlanDraft | null = editor
    ? editor.mode === "plan"
      ? editor.plan
        ? { name: editor.plan.name, kind: editor.plan.kind, payload: editor.plan.payload }
        : null
      : { name: editor.assignment.plan_name, kind: editor.assignment.kind, payload: editor.assignment.payload }
    : null;

  const handleSave = (draft: BusyPlanDraft) => {
    if (!editor) return;
    if (editor.mode === "student") {
      saveAssignment.mutate(
        { studentId: editor.assignment.student_id, payload: draft.payload },
        {
          onSuccess: () => { toast.success(`Ajuste salvo só para ${editor.studentName}.`); setEditor(null); },
          onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
        },
      );
      return;
    }
    savePlan.mutate(
      { id: editor.plan?.id, ...draft },
      {
        onSuccess: (saved) => {
          setEditor(null);
          const using = editor.plan ? usersOf(editor.plan.id).length : 0;
          toast.success(using > 0 ? `Plano salvo. Use "Atualizar nas alunas" para levar às ${using} que usam.` : "Plano salvo. Agora é só ativar para as alunas.");
          if (!editor.plan) setActivating(saved);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
      },
    );
  };

  const handleDelete = async (plan: BusyWeekPlan) => {
    const using = usersOf(plan.id).length;
    const ok = await confirm({
      title: `Excluir "${plan.name}"?`,
      description: using > 0
        ? `${using} aluna(s) têm este plano ativo. A cópia delas continua funcionando, só deixa de receber atualizações.`
        : "O plano sai da sua biblioteca.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    deletePlan.mutate(plan.id, { onSuccess: () => toast.success("Plano excluído.") });
  };

  const activateNotes = (plan: BusyWeekPlan): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const a of myAssignments) {
      if (!a.enabled) continue;
      if (a.plan_id === plan.id) out[a.student_id] = a.customized ? "Já usa este plano (ajustado só pra ela — será substituído)" : "Já usa este plano";
      else out[a.student_id] = `Hoje usa: ${a.plan_name || "outro plano"} — será trocado`;
    }
    return out;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" data-testid="busy-week-manager">
        <SheetHeader className="mb-3">
          <SheetTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" /> Semana Corrida</SheetTitle>
          <SheetDescription>
            Treino secundário (Full Body ou Upper/Lower) para semanas apertadas. Você monta aqui e ativa; a aluna escolhe
            quando usar e quando voltar para a rotina normal. A dieta acompanha treino e descanso.
          </SheetDescription>
        </SheetHeader>

        {missingTable && (
          <div className="mb-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /> {BUSY_SQL_MISSING_MSG}
          </div>
        )}

        <Tabs defaultValue="plans">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="plans">Planos ({plans.length})</TabsTrigger>
            <TabsTrigger value="students">Alunas ({myAssignments.filter((a) => a.enabled).length})</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" className="gap-1.5" disabled={missingTable} onClick={() => setEditor({ mode: "plan", plan: null })} data-testid="busy-new-plan">
                <Plus className="w-4 h-4" /> Novo plano
              </Button>
            </div>
            {loadingPlans && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!loadingPlans && plans.length === 0 && !missingTable && (
              <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                Nenhum plano ainda. Crie um Full Body ou Upper/Lower e ative para quem precisar.
              </p>
            )}
            {plans.map((plan) => {
              const using = usersOf(plan.id);
              const outdated = using.filter((a) => isAssignmentOutdated(a, plan.updated_at));
              return (
                <div key={plan.id} className="rounded-xl border border-border bg-card p-4 space-y-2" data-testid={`busy-plan-${plan.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {BUSY_KIND_LABEL[plan.kind]} · {plan.payload.workouts.length} treino(s) · {plan.payload.sessionsPerWeek}x/semana
                        {plan.payload.periodization.enabled ? " · com periodização" : " · faixa fixa"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 gap-1"><Users className="w-3 h-3" /> {using.length}</Badge>
                  </div>
                  {outdated.length > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      {outdated.length} aluna(s) estão com a versão anterior deste plano.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditor({ mode: "plan", plan })}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                    <Button size="sm" className="h-8 gap-1" onClick={() => setActivating(plan)} data-testid={`busy-activate-${plan.id}`}>
                      <Users className="w-3.5 h-3.5" /> Ativar para alunas
                    </Button>
                    {using.length > 0 && (
                      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setSyncing(plan)} data-testid={`busy-sync-${plan.id}`}>
                        <RefreshCw className="w-3.5 h-3.5" /> Atualizar nas alunas
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(plan)} title="Excluir plano">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="students" className="space-y-2">
            {myAssignments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                Nenhuma aluna com Semana Corrida ativada.
              </p>
            )}
            {myAssignments
              .slice()
              .sort((a, b) => Number(b.enabled) - Number(a.enabled) || Number(b.student_on) - Number(a.student_on))
              .map((a) => {
                const plan = plans.find((p) => p.id === a.plan_id);
                const outdated = plan ? isAssignmentOutdated(a, plan.updated_at) : false;
                const name = nameOf.get(a.student_id) ?? "Aluna";
                return (
                  <div key={a.id} className="rounded-lg border border-border p-3 flex items-start gap-3" data-testid={`busy-assignment-${a.student_id}`}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium"><Private>{name}</Private></p>
                      <p className="text-xs text-muted-foreground truncate">{a.plan_name || "Plano"} · {BUSY_KIND_LABEL[a.kind]}</p>
                      <div className="flex flex-wrap gap-1">
                        {!a.enabled ? (
                          <Badge variant="outline">Desativado</Badge>
                        ) : a.student_on ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">Usando desde {fmt(a.student_on_since)}</Badge>
                        ) : (
                          <Badge variant="secondary">Liberado · rotina normal</Badge>
                        )}
                        {a.customized && <Badge variant="outline">Ajustado só pra ela</Badge>}
                        {outdated && <Badge variant="outline" className="border-amber-500/60 text-amber-600">Versão anterior</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditor({ mode: "student", assignment: a, studentName: name })}>
                        Ajustar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={setEnabled.isPending}
                        onClick={() => setEnabled.mutate(
                          { studentIds: [a.student_id], enabled: !a.enabled },
                          { onSuccess: () => toast.success(a.enabled ? "Semana Corrida desativada para ela." : "Semana Corrida liberada de novo.") },
                        )}
                        data-testid={`busy-toggle-${a.student_id}`}
                      >
                        {a.enabled ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
          </TabsContent>
        </Tabs>

        <BusyWeekPlanEditor
          open={!!editor}
          onOpenChange={(v) => { if (!v) setEditor(null); }}
          coachId={coachId}
          initial={editorInitial}
          title={editor?.mode === "student" ? `Ajustar só para ${editor.studentName}` : editor?.plan ? "Editar plano" : "Novo plano da Semana Corrida"}
          description={editor?.mode === "student"
            ? "Muda apenas a cópia desta aluna. Se depois você atualizar o plano para ela, este ajuste é substituído."
            : "Monte os treinos como no protocolo. Mobilidade fica sempre antes; o seletor de inverter vale por treino."}
          lockName={editor?.mode === "student"}
          saving={savePlan.isPending || saveAssignment.isPending}
          onSave={handleSave}
        />

        {activating && (
          <StudentPicker
            open={!!activating}
            onOpenChange={(v) => { if (!v) setActivating(null); }}
            title={`Ativar "${activating.name}"`}
            description="Cada aluna recebe uma cópia e escolhe quando usar. Quem já tinha outro plano passa a ter este."
            students={students}
            preselected={new Set(usersOf(activating.id).map((a) => a.student_id))}
            notes={activateNotes(activating)}
            confirmLabel="Ativar"
            busy={applyPlan.isPending}
            onConfirm={(ids) => applyPlan.mutate(
              { plan: activating, studentIds: ids },
              {
                onSuccess: (n) => { toast.success(`Semana Corrida ativada para ${n} aluna(s).`); setActivating(null); },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao ativar."),
              },
            )}
          />
        )}

        {syncing && (
          <StudentPicker
            open={!!syncing}
            onOpenChange={(v) => { if (!v) setSyncing(null); }}
            title={`Atualizar "${syncing.name}" nas alunas`}
            description="Leva a versão atual do plano para as alunas marcadas. Quem tem ajuste individual vem desmarcada."
            students={usersOf(syncing.id).map((a) => ({ id: a.student_id, name: nameOf.get(a.student_id) ?? "Aluna" }))}
            preselected={new Set(usersOf(syncing.id).filter((a) => !a.customized).map((a) => a.student_id))}
            notes={Object.fromEntries(usersOf(syncing.id).filter((a) => a.customized).map((a) => [a.student_id, "Ajustado só pra ela — o ajuste será substituído"]))}
            confirmLabel="Atualizar"
            busy={applyPlan.isPending}
            onConfirm={(ids) => applyPlan.mutate(
              { plan: syncing, studentIds: ids },
              {
                onSuccess: (n) => { toast.success(`Plano atualizado para ${n} aluna(s).`); setSyncing(null); },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar."),
              },
            )}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
