// SectionTemplateQuickPicker — casca genérica do fluxo rápido de templates
// (Aplicar + Salvar em 1-2 cliques), direto na aba do builder. Extraído de
// WorkoutTemplateQuickPicker (que hoje é um wrapper fino sobre este
// componente) pra Dieta e Periodização reusarem a mesma UX comprovada em vez
// de reimplementar do zero.
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LayoutTemplate, Save, Check } from "lucide-react";
import { toast } from "sonner";

type BaseTemplate = { id: string; name: string; isSystem: boolean };

export function SectionTemplateQuickPicker<T extends BaseTemplate>({
  coachId,
  applyLabel,
  applyPlaceholder,
  emptyLabel,
  loadItems,
  onApply,
  searchValue,
  secondaryAction,
  canSave,
  saveLabel,
  savingHint,
  defaultSaveName,
  onSave,
}: {
  coachId: string | null;
  applyLabel: string;
  applyPlaceholder: string;
  emptyLabel: string;
  loadItems: (coachId: string | null) => Promise<T[]>;
  /**
   * Aplica o item selecionado. Pode ser assíncrona (ex.: aguardar um diálogo
   * de confirmação) — retornar `false` explicitamente cancela o fechamento
   * do popover (ex.: coach cancelou a confirmação); qualquer outro retorno
   * fecha normalmente.
   */
  onApply: (item: T) => void | boolean | Promise<void | boolean>;
  /** Texto usado na busca do command menu (padrão: item.name). */
  searchValue?: (item: T) => string;
  /** Ação secundária opcional por item (ex.: "só estrutura" do treino). Mesma semântica de cancelamento de `onApply`. */
  secondaryAction?: { title: string; label: string; onSelect: (item: T) => void | boolean | Promise<void | boolean> };
  canSave: boolean;
  saveLabel: string;
  savingHint: string;
  defaultSaveName: () => string;
  onSave: (opts: { name: string; existingId: string | null }) => Promise<string>;
}) {
  // ── Aplicar (command menu) ──────────────────────────────────────────
  const [applyOpen, setApplyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<T[]>([]);

  useEffect(() => {
    if (!applyOpen) return;
    let active = true;
    setLoading(true);
    loadItems(coachId)
      .then((r) => { if (active) setItems(r); })
      .catch((e) => toast.error(e?.message || "Falha ao carregar templates"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyOpen, coachId]);

  async function handleApply(item: T) {
    const result = await onApply(item);
    if (result !== false) setApplyOpen(false);
  }

  // ── Salvar seção atual ────────────────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingAsId, setSavingAsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function quickSave() {
    if (!coachId || !canSave) return;
    if (savingAsId) {
      setSaving(true);
      try {
        await onSave({ name: saveName, existingId: savingAsId });
        toast.success("Template atualizado");
      } catch (e: any) {
        toast.error(e?.message || "Falha ao salvar");
      } finally { setSaving(false); }
      return;
    }
    setSaveName(defaultSaveName());
    setSaveOpen(true);
  }

  async function confirmFirstSave() {
    if (!coachId) return;
    const trimmed = saveName.trim();
    if (!trimmed) { toast.error("Dê um nome"); return; }
    setSaving(true);
    try {
      const id = await onSave({ name: trimmed, existingId: null });
      setSavingAsId(id);
      toast.success("Salvo na biblioteca");
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
            <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" /> {applyLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder={applyPlaceholder} />
            <CommandList>
              {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <CommandEmpty>{emptyLabel}</CommandEmpty>
                  <CommandGroup>
                    {items.map((tpl) => (
                      <CommandItem
                        key={tpl.id}
                        value={searchValue ? searchValue(tpl) : tpl.name}
                        onSelect={() => handleApply(tpl)}
                        className="flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">
                          {tpl.name}
                          {tpl.isSystem && <span className="ml-1.5 text-[9px] text-muted-foreground">· sistema</span>}
                        </span>
                        {secondaryAction && (
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-foreground shrink-0 px-1.5 py-0.5 rounded border border-border/60"
                            title={secondaryAction.title}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const result = await secondaryAction.onSelect(tpl);
                              if (result !== false) setApplyOpen(false);
                            }}
                          >
                            {secondaryAction.label}
                          </button>
                        )}
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
            title={savingAsId ? "Atualizar template vinculado" : savingHint}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : savingAsId ? <Check className="w-3.5 h-3.5 mr-1.5" />
              : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {savingAsId ? "Atualizado" : saveLabel}
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

