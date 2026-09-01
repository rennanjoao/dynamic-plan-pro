// WorkoutTemplateQuickPicker — fluxo rápido de treino, direto na aba de
// Workouts: aplicar/salvar um bloco de treino em 1-2 cliques.
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LayoutTemplate, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";
import {
  listWorkoutBlockTemplates,
  saveWorkoutBlockAsTemplate,
  injectWorkoutBlock,
  type WorkoutBlockTemplate,
} from "@/lib/workoutTemplates";

export function WorkoutTemplateQuickPicker({
  payload,
  setPayload,
  coachId,
}: {
  payload: ProtocolPayload;
  setPayload: (p: ProtocolPayload) => void;
  coachId: string | null;
}) {
  const confirm = useConfirm();

  // ── Aplicar (command menu) ──────────────────────────────────────────
  const [applyOpen, setApplyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<WorkoutBlockTemplate[]>([]);

  useEffect(() => {
    if (!applyOpen) return;
    let active = true;
    setLoading(true);
    listWorkoutBlockTemplates(coachId)
      .then((r) => { if (active) setItems(r); })
      .catch((e) => toast.error(e?.message || "Falha ao carregar templates"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyOpen, coachId]);

  async function applyTemplate(tpl: WorkoutBlockTemplate, mode: "filled" | "empty") {
    const hasContent = payload.workouts.some((d) => d.exercises.length > 0);
    if (hasContent && !(await confirm({
      title: "Substituir dias de treino",
      description: "Os dias de treino atuais serão substituídos pelos do template. Dieta, macros, suplementos e diretrizes não são afetados. Continuar?",
      confirmLabel: "Aplicar",
    }))) return;
    setPayload(injectWorkoutBlock(payload, tpl.payload, mode));
    toast.success(mode === "filled" ? `"${tpl.name}" aplicado` : `Estrutura de "${tpl.name}" aplicada`);
    setApplyOpen(false);
  }

  // ── Salvar treino atual ──────────────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingAsId, setSavingAsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = payload.workouts.some((d) => d.exercises.length > 0);

  async function quickSave() {
    if (!coachId || !canSave) return;
    if (savingAsId) {
      setSaving(true);
      try {
        await saveWorkoutBlockAsTemplate({
          coachId, name: saveName || "Treino", workouts: payload.workouts,
          periodization: payload.periodization?.enabled ? payload.periodization : undefined,
          existingId: savingAsId,
        });
        toast.success("Template atualizado");
      } catch (e: any) {
        toast.error(e?.message || "Falha ao salvar");
      } finally { setSaving(false); }
      return;
    }
    setSaveName(`Treino ${new Date().toLocaleDateString("pt-BR")}`);
    setSaveOpen(true);
  }

  async function confirmFirstSave() {
    if (!coachId) return;
    const trimmed = saveName.trim();
    if (!trimmed) { toast.error("Dê um nome"); return; }
    setSaving(true);
    try {
      const id = await saveWorkoutBlockAsTemplate({
        coachId, name: trimmed, workouts: payload.workouts,
        periodization: payload.periodization?.enabled ? payload.periodization : undefined,
      });
      setSavingAsId(id);
      toast.success("Salvo na biblioteca de treinos");
      setSaveOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={applyOpen} onOpenChange={setApplyOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 text-xs">
            <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" /> Aplicar treino
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Buscar template de treino..." />
            <CommandList>
              {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <CommandEmpty>Nenhum template encontrado.</CommandEmpty>
                  <CommandGroup>
                    {items.map((tpl) => (
                      <CommandItem
                        key={tpl.id}
                        value={`${tpl.name} ${tpl.division ?? ""} ${tpl.profile ?? ""}`}
                        onSelect={() => applyTemplate(tpl, "filled")}
                        className="flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">
                          {tpl.name}
                          {tpl.isSystem && <span className="ml-1.5 text-[9px] text-muted-foreground">· sistema</span>}
                        </span>
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 px-1.5 py-0.5 rounded border border-border/60"
                          title="Aplicar só a estrutura, sem exercícios"
                          onClick={(e) => { e.stopPropagation(); applyTemplate(tpl, "empty"); }}
                        >
                          só estrutura
                        </button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm" variant="outline" className="h-8 text-xs"
            disabled={!canSave || saving}
            onClick={quickSave}
            title={savingAsId ? "Atualizar template vinculado" : "Salvar dias de treino atuais como template"}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : savingAsId ? <Check className="w-3.5 h-3.5 mr-1.5" />
              : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {savingAsId ? "Atualizado" : "Salvar treino"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-3" align="start">
          <p className="text-xs text-muted-foreground mb-2">Nome do template</p>
          <div className="flex gap-1.5">
            <Input
              autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmFirstSave(); }}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={confirmFirstSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
