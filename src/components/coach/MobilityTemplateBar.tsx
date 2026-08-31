// MobilityTemplateBar.tsx
// Barra de ações do bloco de mobilidade dentro do WorkoutsTab:
//  - "Salvar bloco": salva TODOS os exercícios de mobilidade do treino atual
//    como um template reutilizável (tabela mobility_templates, por coach).
//  - "Usar salva": lista os blocos salvos e anexa o bloco escolhido ao treino
//    atual em 1 clique (sem tocar nos exercícios de força).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Save, FolderOpen, Trash2, Loader2 } from "lucide-react";
import { makeEmptyExercise } from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface MobilityTemplateRow {
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercises: any[];
}

export function MobilityTemplateBar({
  coachId,
  currentMobility,
  onApply,
}: {
  coachId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentMobility: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onApply: (exercises: any[]) => void;
}) {
  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["mobility-templates", coachId],
    enabled: !!coachId && listOpen,
    queryFn: async (): Promise<MobilityTemplateRow[]> => {
      const { data, error } = await sb
        .from("mobility_templates")
        .select("id, name, exercises")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MobilityTemplateRow[];
    },
  });

  const cleaned = currentMobility
    .filter((ex) => String(ex?.name ?? "").trim())
    .map((ex) => ({
      name: ex.name ?? "",
      sets: ex.sets ?? "",
      reps: ex.reps ?? "",
      notes: ex.notes ?? "",
      gifKey: ex.gifKey ?? undefined,
    }));

  const save = async () => {
    if (!coachId) return;
    if (!cleaned.length) {
      toast({ title: "Nada para salvar", description: "Preencha ao menos um exercício de mobilidade.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await sb.from("mobility_templates").insert({
      coach_id: coachId,
      name: name.trim() || `Mobilidade (${cleaned.length} exercícios)`,
      exercises: cleaned,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setName("");
    setSaveOpen(false);
    qc.invalidateQueries({ queryKey: ["mobility-templates", coachId] });
    toast({ title: "Bloco de mobilidade salvo" });
  };

  const remove = async (id: string) => {
    const { error } = await sb.from("mobility_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["mobility-templates", coachId] });
  };

  const apply = (tpl: MobilityTemplateRow) => {
    const exercises = (tpl.exercises ?? []).map((ex) => ({
      ...makeEmptyExercise({ isMobility: true }),
      name: ex?.name ?? "",
      sets: ex?.sets ?? "",
      reps: ex?.reps ?? "",
      notes: ex?.notes ?? "",
      ...(ex?.gifKey ? { gifKey: ex.gifKey } : {}),
    }));
    onApply(exercises);
    setListOpen(false);
    toast({ title: `"${tpl.name}" adicionado ao treino` });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-sky-500 hover:bg-sky-500/10">
            <Save className="w-3 h-3 mr-1" /> Salvar bloco
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2">
          <p className="text-xs font-semibold">Salvar bloco de mobilidade</p>
          <p className="text-[11px] text-muted-foreground">{cleaned.length} exercício(s) serão salvos.</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex: Mobilidade de quadril)"
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-7 w-full text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Salvar
          </Button>
        </PopoverContent>
      </Popover>

      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-sky-500 hover:bg-sky-500/10">
            <FolderOpen className="w-3 h-3 mr-1" /> Usar salva
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <p className="text-xs font-semibold mb-2">Blocos salvos</p>
          {isLoading && <p className="text-[11px] text-muted-foreground">Carregando…</p>}
          {!isLoading && templates.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Nenhum bloco salvo ainda.</p>
          )}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => apply(tpl)}
                  className="flex-1 text-left rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="text-xs font-medium block truncate">{tpl.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(tpl.exercises ?? []).length} exercício(s)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(tpl.id)}
                  className="p-1.5 text-muted-foreground hover:text-destructive"
                  title="Excluir bloco salvo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
