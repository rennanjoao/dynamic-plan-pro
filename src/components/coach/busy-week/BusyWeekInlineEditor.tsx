/**
 * Protocolo da aluna → aba Treinos → "Semana corrida".
 *
 * Pedido do Rennan (20/11 noite): no protocolo, um botão troca o treino atual
 * pelo treino de dias corridos e ali ele ajusta tudo do mesmo jeito — inclusive
 * o carbo na faixa da semana. Este componente é essa visão: o MESMO editor de
 * treinos (WorkoutsTab, modo busyWeek), editando a cópia da aluna.
 *
 * Salva separado do protocolo (tabela busy_week_assignments) e vale na hora.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, Copy, Loader2, MoreHorizontal, Plus, RefreshCw, Library } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ConfirmProvider";
import { WorkoutsTab } from "@/components/coach/protocol-builder/WorkoutsTab";
import {
  BUSY_SQL_MISSING_MSG, useBusyWeekAssignments, useBusyWeekPlans, useSaveBusyWeekPlan, useSetBusyWeekEnabled,
  useUpsertStudentBusyWeek, type BusyWeekAssignment, type BusyWeekPlan,
} from "@/hooks/useBusyWeek";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import {
  BUSY_KIND_LABEL, busyFromProtocolWorkouts, busyToEditorPayload, editorToBusyPayload, emptyBusyPayload,
  isAssignmentOutdated, type BusyKind, type BusyWeekPayload,
} from "@/lib/busyWeek";
import { BusyWeekManager } from "./BusyWeekManager";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "a aluna";

interface Draft {
  planId: string | null;
  planName: string;
  kind: BusyKind;
  /** Como estava no banco (null = ainda não salvo para ela). */
  base: BusyWeekPayload | null;
  editor: ProtocolPayload;
  planSyncedAt?: string | null;
}

export interface BusyWeekInlineHandle {
  hasUnsaved: () => boolean;
}

export const BusyWeekInlineEditor = forwardRef<BusyWeekInlineHandle, {
  coachId: string | null;
  studentId: string;
  studentName: string;
  /** Treinos atuais do protocolo (para "copiar do treino atual"). */
  protocolWorkouts: ProtocolPayload["workouts"];
  onDirtyChange?: (dirty: boolean) => void;
}>(function BusyWeekInlineEditor({ coachId, studentId, studentName, protocolWorkouts, onDirtyChange }, ref) {
  const confirm = useConfirm();
  const { data: plansData, isLoading } = useBusyWeekPlans(coachId);
  const { data: assignments = [], isLoading: loadingAssign } = useBusyWeekAssignments(coachId);
  const upsert = useUpsertStudentBusyWeek(coachId);
  const savePlan = useSaveBusyWeekPlan(coachId);
  const setEnabled = useSetBusyWeekEnabled(coachId);

  const plans = useMemo(() => plansData?.plans ?? [], [plansData]);
  const missingTable = !!plansData?.missingTable;
  const assignment: BusyWeekAssignment | null = assignments.find((a) => a.student_id === studentId) ?? null;
  const active = assignment?.enabled ? assignment : null;
  const libPlan: BusyWeekPlan | null = active?.plan_id ? plans.find((p) => p.id === active.plan_id) ?? null : null;
  const outdated = active && libPlan ? isAssignmentOutdated(active, libPlan.updated_at) : false;
  const who = firstName(studentName);

  const emptyEditor = useMemo<ProtocolPayload>(() => ProtocolPayloadSchema.parse({ setup: {} }), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [startKind, setStartKind] = useState<BusyKind>("fullbody");
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Carrega (ou recarrega) a cópia salva da aluna no editor.
  const loadedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      if (loadedFrom.current && loadedFrom.current !== "draft") { setDraft(null); loadedFrom.current = null; }
      return;
    }
    const stamp = `${active.id}|${active.updated_at}`;
    if (loadedFrom.current === stamp) return;
    loadedFrom.current = stamp;
    setDraft({
      planId: active.plan_id,
      planName: active.plan_name || "Semana Corrida",
      kind: active.kind,
      base: active.payload,
      editor: busyToEditorPayload(active.payload, emptyEditor),
      planSyncedAt: active.plan_synced_at,
    });
  }, [active, emptyEditor]);

  const currentPayload = draft ? editorToBusyPayload(draft.editor, draft.base ?? emptyBusyPayload(draft.kind)) : null;
  const dirty = !!draft && (!draft.base || JSON.stringify(currentPayload) !== JSON.stringify(draft.base));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useImperativeHandle(ref, () => ({ hasUnsaved: () => dirty }), [dirty]);

  const start = (payload: BusyWeekPayload, opts: { planId: string | null; planName: string; kind: BusyKind; planSyncedAt?: string | null }) => {
    loadedFrom.current = "draft";
    setDraft({ ...opts, base: null, editor: busyToEditorPayload(payload, emptyEditor) });
  };

  const save = () => {
    if (!draft || !currentPayload) return;
    if (currentPayload.workouts.length === 0 || !currentPayload.workouts.some((w) => w.exercises.some((e) => String(e.name ?? "").trim()))) {
      toast.error("Monte pelo menos um treino com exercícios.");
      return;
    }
    upsert.mutate(
      {
        studentId,
        planId: draft.planId,
        planName: draft.planName,
        kind: draft.kind,
        payload: currentPayload,
        // Diferente do modelo da biblioteca → fica marcada como ajustada só pra ela.
        customized: !!draft.planId && JSON.stringify(currentPayload) !== JSON.stringify(plans.find((p) => p.id === draft.planId)?.payload ?? null),
        ...(draft.base ? {} : { planSyncedAt: draft.planSyncedAt ?? null }),
      },
      {
        onSuccess: () => toast.success(draft.base ? `Semana Corrida de ${who} salva.` : `Semana Corrida liberada para ${who}. Ela escolhe quando usar.`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
      },
    );
  };

  const discard = () => {
    if (!draft) return;
    if (!draft.base) { setDraft(null); loadedFrom.current = null; return; }
    setDraft({ ...draft, editor: busyToEditorPayload(draft.base, emptyEditor) });
  };

  const saveToLibrary = () => {
    if (!draft || !currentPayload) return;
    const name = window.prompt("Nome do modelo na biblioteca:", draft.planName && draft.planName !== "Semana Corrida" ? draft.planName : `${BUSY_KIND_LABEL[draft.kind]} — ${who}`);
    if (!name || !name.trim()) return;
    savePlan.mutate(
      { name: name.trim(), kind: draft.kind, payload: currentPayload },
      {
        onSuccess: (saved) => {
          upsert.mutate(
            { studentId, planId: saved.id, planName: saved.name, kind: saved.kind, payload: currentPayload, customized: false, planSyncedAt: saved.updated_at },
            { onSuccess: () => toast.success(`"${saved.name}" salvo na biblioteca. Dá para ativar em outras alunas pelo painel.`) },
          );
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar na biblioteca."),
      },
    );
  };

  const updateFromLibrary = async () => {
    if (!libPlan) return;
    const ok = !active?.customized || await confirm({
      title: "Atualizar com a biblioteca?",
      description: `O ajuste feito só para ${who} será substituído pela versão atual de "${libPlan.name}".`,
      confirmLabel: "Atualizar",
    });
    if (!ok) return;
    upsert.mutate(
      { studentId, planId: libPlan.id, planName: libPlan.name, kind: libPlan.kind, payload: libPlan.payload, customized: false, planSyncedAt: libPlan.updated_at },
      { onSuccess: () => toast.success("Atualizado com a biblioteca.") },
    );
  };

  const disable = async () => {
    const ok = await confirm({
      title: `Desativar a Semana Corrida de ${who}?`,
      description: "Ela volta para a rotina normal e o seletor some da tela dela. O plano fica guardado para reativar.",
      confirmLabel: "Desativar",
      destructive: true,
    });
    if (!ok) return;
    setEnabled.mutate({ studentIds: [studentId], enabled: false }, { onSuccess: () => toast.success("Semana Corrida desativada.") });
  };

  if (missingTable) {
    return (
      <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert" data-testid="busy-inline-missing-sql">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /> {BUSY_SQL_MISSING_MSG}
      </div>
    );
  }
  if (isLoading || loadingAssign) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>;
  }

  // ── Ainda sem Semana Corrida para ela ──
  if (!draft) {
    return (
      <div className="rounded-xl border border-dashed border-border p-5 space-y-4" data-testid="busy-inline-empty">
        <div>
          <p className="text-sm font-semibold">Semana Corrida de {who}</p>
          <p className="text-xs text-muted-foreground">
            Treino secundário para semanas apertadas. Você monta aqui como o treino atual (dias e carbo na faixa da
            semana); ela escolhe quando usar e quando voltar.
          </p>
          {assignment && !assignment.enabled && (
            <p className="text-xs mt-2">
              Desativada (último plano: {assignment.plan_name || "—"}).{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => setEnabled.mutate({ studentIds: [studentId], enabled: true }, { onSuccess: () => toast.success(`Semana Corrida liberada de novo para ${who}.`) })}
              >
                Reativar
              </button>
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold">Montar do zero</p>
            <Select value={startKind} onValueChange={(v) => setStartKind(v as BusyKind)}>
              <SelectTrigger className="h-8 text-xs" data-testid="busy-inline-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BUSY_KIND_LABEL) as BusyKind[]).map((k) => <SelectItem key={k} value={k}>{BUSY_KIND_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 w-full gap-1" onClick={() => start(emptyBusyPayload(startKind), { planId: null, planName: "Semana Corrida", kind: startKind })} data-testid="busy-inline-from-scratch">
              <Plus className="w-3.5 h-3.5" /> Começar
            </Button>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold">Copiar do treino atual</p>
            <p className="text-[11px] text-muted-foreground">Começa com os treinos deste protocolo para você enxugar.</p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full gap-1"
              disabled={protocolWorkouts.length === 0}
              onClick={() => start(busyFromProtocolWorkouts(protocolWorkouts), { planId: null, planName: "Semana Corrida", kind: "fullbody" })}
              data-testid="busy-inline-from-protocol"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar
            </Button>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold">Usar da biblioteca</p>
            {plans.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhum modelo salvo ainda.</p>
            ) : (
              <Select onValueChange={(id) => {
                const p = plans.find((x) => x.id === id);
                if (p) start(p.payload, { planId: p.id, planName: p.name, kind: p.kind, planSyncedAt: p.updated_at });
              }}>
                <SelectTrigger className="h-8 text-xs" data-testid="busy-inline-library"><SelectValue placeholder="Escolher modelo" /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {BUSY_KIND_LABEL[p.kind]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <button type="button" className="text-[11px] text-primary underline underline-offset-2" onClick={() => setLibraryOpen(true)}>
              <Library className="w-3 h-3 inline mr-1" />Abrir biblioteca
            </button>
          </div>
        </div>
        {libraryOpen && <BusyWeekManager open={libraryOpen} onOpenChange={setLibraryOpen} coachId={coachId} />}
      </div>
    );
  }

  // ── Editando a Semana Corrida dela ──
  return (
    <div className="space-y-3" data-testid="busy-inline-editor">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
        <span className="text-sm font-semibold">{draft.planName}</span>
        <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as BusyKind })}>
          <SelectTrigger className="h-7 w-auto text-xs gap-1" data-testid="busy-inline-kind-edit"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(BUSY_KIND_LABEL) as BusyKind[]).map((k) => <SelectItem key={k} value={k}>{BUSY_KIND_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        {!draft.base ? (
          <Badge variant="outline">Ainda não salvo</Badge>
        ) : active?.student_on ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Ela está usando desde {fmt(active.student_on_since)}</Badge>
        ) : (
          <Badge variant="secondary">Liberada · ela está na rotina normal</Badge>
        )}
        {active?.customized && <Badge variant="outline">Ajustada só pra ela</Badge>}
        {outdated && <Badge variant="outline" className="border-amber-500/60 text-amber-600">Biblioteca tem versão nova</Badge>}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Mais opções da Semana Corrida" data-testid="busy-inline-menu">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={saveToLibrary} disabled={!currentPayload}>
                <BookmarkPlus className="w-4 h-4 mr-2" /> Salvar como modelo na biblioteca
              </DropdownMenuItem>
              {libPlan && (
                <DropdownMenuItem onClick={updateFromLibrary}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar com a biblioteca
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
                <Library className="w-4 h-4 mr-2" /> Biblioteca (várias alunas)
              </DropdownMenuItem>
              {draft.base && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={disable} className="text-destructive focus:text-destructive">
                    Desativar para {who}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <WorkoutsTab
        payload={draft.editor}
        setPayload={(p) => setDraft((d) => (d ? { ...d, editor: p } : d))}
        coachId={coachId}
        variant="busyWeek"
      />

      {dirty && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-background/95 px-4 py-3 shadow-lg backdrop-blur" data-testid="busy-inline-savebar">
          <p className="text-xs text-muted-foreground flex-1 min-w-[180px]">
            {draft.base ? "Alterações na Semana Corrida ainda não salvas." : `Salvar libera a Semana Corrida para ${who}.`} Salva separado do protocolo e vale na hora.
          </p>
          <Button size="sm" variant="ghost" onClick={discard} disabled={upsert.isPending}>Descartar</Button>
          <Button size="sm" onClick={save} disabled={upsert.isPending} data-testid="busy-inline-save">
            {upsert.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {draft.base ? "Salvar Semana Corrida" : `Salvar e liberar para ${who}`}
          </Button>
        </div>
      )}
      {libraryOpen && <BusyWeekManager open={libraryOpen} onOpenChange={setLibraryOpen} coachId={coachId} />}
    </div>
  );
});
