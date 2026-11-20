/**
 * Editor de um plano da Semana Corrida (biblioteca do coach) ou da cópia de
 * UMA aluna. Reaproveita o editor de treinos do protocolo (WorkoutsTab no
 * modo "busyWeek"): mesmos exercícios, biblioteca, mobilidade, periodização
 * com liga/desliga e o seletor de inverter a ordem.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkoutsTab } from "@/components/coach/protocol-builder/WorkoutsTab";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import { CARB_LABEL, type CarbLevel } from "@/lib/weekCycle";
import {
  BUSY_KIND_LABEL, busyToEditorPayload, editorToBusyPayload, emptyBusyPayload,
  type BusyKind, type BusyWeekPayload,
} from "@/lib/busyWeek";

export interface BusyPlanDraft {
  name: string;
  kind: BusyKind;
  payload: BusyWeekPayload;
}

const CARB_OPTIONS: CarbLevel[] = ["high", "base", "off"];

export function BusyWeekPlanEditor({
  open,
  onOpenChange,
  coachId,
  initial,
  title,
  description,
  lockName = false,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string | null;
  initial: BusyPlanDraft | null;
  title: string;
  description?: string;
  /** Cópia de uma aluna: nome e tipo vêm do plano. */
  lockName?: boolean;
  saving?: boolean;
  onSave: (draft: BusyPlanDraft) => void;
}) {
  const baseEditor = useMemo<ProtocolPayload>(() => ProtocolPayloadSchema.parse({ setup: {} }), []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BusyKind>("fullbody");
  const [plan, setPlan] = useState<BusyWeekPayload>(() => emptyBusyPayload("fullbody"));
  const [editor, setEditor] = useState<ProtocolPayload>(baseEditor);

  useEffect(() => {
    if (!open) return;
    const start = initial ?? { name: "", kind: "fullbody" as BusyKind, payload: emptyBusyPayload("fullbody") };
    setName(start.name);
    setKind(start.kind);
    setPlan(start.payload);
    setEditor(busyToEditorPayload(start.payload, baseEditor));
  }, [open, initial, baseEditor]);

  const changeKind = (k: BusyKind) => {
    setKind(k);
    // Plano ainda vazio: troca os nomes sugeridos (Full Body A/B ↔ Upper/Lower).
    const empty = editor.workouts.every((w) => w.exercises.every((e) => !String(e.name ?? "").trim()));
    if (empty) {
      const fresh = emptyBusyPayload(k);
      setEditor(busyToEditorPayload({ ...plan, workouts: fresh.workouts }, baseEditor));
    }
  };

  const handleSave = () => {
    if (!lockName && !name.trim()) {
      toast.error("Dê um nome ao plano (ex.: Full Body Dezembro).");
      return;
    }
    const payload = editorToBusyPayload(editor, plan);
    if (payload.workouts.length === 0) {
      toast.error("Monte pelo menos um treino.");
      return;
    }
    const strength = payload.workouts.some((w) => w.exercises.some((e) => String(e.name ?? "").trim()));
    if (!strength) {
      toast.error("Os treinos ainda estão sem exercícios.");
      return;
    }
    onSave({ name: name.trim(), kind, payload });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="busy-plan-editor">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="space-y-1">
            <Label htmlFor="busy-plan-name">Nome do plano</Label>
            <Input
              id="busy-plan-name"
              value={name}
              disabled={lockName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Full Body Dezembro"
              maxLength={120}
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => changeKind(v as BusyKind)} disabled={lockName}>
              <SelectTrigger data-testid="busy-plan-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(BUSY_KIND_LABEL) as BusyKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{BUSY_KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3 rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Treinos por semana (para a aderência)</Label>
            <Select value={String(plan.sessionsPerWeek)} onValueChange={(v) => setPlan({ ...plan, sessionsPerWeek: Number(v) })}>
              <SelectTrigger className="h-9" data-testid="busy-plan-sessions"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}x na semana</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Carbo no dia de treino</Label>
            <Select value={plan.dietRule.training} onValueChange={(v) => setPlan({ ...plan, dietRule: { ...plan.dietRule, training: v as CarbLevel } })}>
              <SelectTrigger className="h-9" data-testid="busy-plan-carb-training"><SelectValue /></SelectTrigger>
              <SelectContent>{CARB_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CARB_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Carbo no dia de descanso</Label>
            <Select value={plan.dietRule.rest} onValueChange={(v) => setPlan({ ...plan, dietRule: { ...plan.dietRule, rest: v as CarbLevel } })}>
              <SelectTrigger className="h-9" data-testid="busy-plan-carb-rest"><SelectValue /></SelectTrigger>
              <SelectContent>{CARB_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CARB_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="md:col-span-3 text-[11px] text-muted-foreground">
            A dieta continua a mesma do protocolo; na Semana Corrida o carbo segue o dia de treino ou de descanso, com os
            percentuais de carbo alto/baixo que você já usa. Refeições com versão treino/descanso trocam junto.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="busy-plan-note" className="text-xs">Recado para a aluna (opcional)</Label>
          <Textarea
            id="busy-plan-note"
            value={plan.note}
            onChange={(e) => setPlan({ ...plan, note: e.target.value.slice(0, 500) })}
            placeholder="Ex.: Use nas semanas apertadas. Treino em dias alternados; se treinar seguido, a ordem inverte sozinha."
            className="min-h-[60px] text-base md:text-sm"
          />
        </div>

        <WorkoutsTab payload={editor} setPayload={setEditor} coachId={coachId} variant="busyWeek" />

        <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t border-border bg-background/95 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="busy-plan-save">
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
