/**
 * CopyProtocolDialog.tsx — Fase 5
 *
 * Permite copiar o protocolo atual (ou apenas seções: treino/dieta/suplementos)
 * para outro aluno do coach. Cria SEMPRE uma nova linha em `protocols` com
 * `active: false` — o coach precisa revisar e publicar manualmente.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCoachStudentsLite } from "@/hooks/useCoachStudents";
import type { ProtocolPayload } from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

type Section = "workout" | "diet" | "supplements";

export default function CopyProtocolDialog({
  open, onOpenChange, coachId, payload, sourceStudentId, protocolName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string | null;
  payload: ProtocolPayload | null;
  sourceStudentId: string;
  protocolName: string;
}) {
  const { data: students = [], isLoading } = useCoachStudentsLite(open ? coachId : null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<Section, boolean>>({
    workout: true, diet: true, supplements: true,
  });
  const [copying, setCopying] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return students
      .filter((st) => st.id !== sourceStudentId)
      .filter((st) => !s || st.name.toLowerCase().includes(s));
  }, [students, search, sourceStudentId]);

  function toggle(k: Section) {
    setSections((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  async function handleCopy() {
    if (!coachId || !payload || !selectedId) return;
    if (!sections.workout && !sections.diet && !sections.supplements) {
      toast.error("Selecione ao menos uma seção");
      return;
    }
    setCopying(true);
    try {
      const src: any = JSON.parse(JSON.stringify(payload));
      const targetName = students.find((s) => s.id === selectedId)?.name || "aluno";

      // [FIX crítico] Antes o copy SEMPRE inseria uma nova linha em `protocols`.
      // Como o builder carrega o protocolo mais recente do aluno, essa linha
      // nova "escondia" o protocolo real do destinatário (parecia que os dados
      // tinham sido apagados). Agora, se o aluno já tem protocolo, fazemos
      // MERGE PARCIAL das seções escolhidas dentro do rascunho dele — o
      // conteúdo publicado e as seções não selecionadas ficam intactos.
      const { data: target } = await sb
        .from("protocols")
        .select("id, payload, draft_payload")
        .eq("student_id", selectedId)
        .eq("is_template", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (target?.id) {
        const base: any = JSON.parse(
          JSON.stringify(target.draft_payload ?? target.payload ?? {})
        );
        if (sections.workout) {
          base.workouts = src.workouts ?? [];
          if (src.periodization !== undefined) base.periodization = src.periodization;
        }
        if (sections.diet) {
          base.meals = src.meals ?? [];
          base.macros = src.macros ?? base.macros;
          if (src.carbCycle !== undefined) base.carbCycle = src.carbCycle;
        }
        if (sections.supplements) {
          base.supplements = src.supplements ?? [];
          base.supplementCombos = src.supplementCombos ?? [];
        }

        const { error } = await sb
          .from("protocols")
          .update({ draft_payload: base, updated_at: new Date().toISOString() })
          .eq("id", target.id);
        if (error) throw error;
        toast.success(
          `Seções copiadas para ${targetName} como rascunho — o restante do protocolo dele foi preservado`
        );
      } else {
        const next: any = src;
        if (!sections.workout) {
          next.workouts = [];
          next.periodization = undefined;
        }
        if (!sections.diet) {
          next.meals = [];
          next.macros = { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
          next.carbCycle = undefined;
        }
        if (!sections.supplements) {
          next.supplements = [];
          next.supplementCombos = [];
        }
        const { error } = await sb.from("protocols").insert({
          coach_id: coachId,
          student_id: selectedId,
          name: `${protocolName || "Protocolo"} (cópia)`,
          is_template: false,
          payload: next,
          active: false,
        });
        if (error) throw error;
        toast.success(`Protocolo copiado para ${targetName} como rascunho inativo`);
      }

      onOpenChange(false);
      setSelectedId(null);
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao copiar");
    } finally {
      setCopying(false);
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Copiar protocolo para outro aluno</DialogTitle>
          <DialogDescription className="text-xs">
            Cria um novo protocolo inativo (rascunho) no aluno de destino. Nada é publicado até você revisar e ativar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 flex-1 overflow-y-auto">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">O que copiar</p>
            <div className="flex flex-wrap gap-3">
              {([
                ["workout", "Treino"],
                ["diet", "Dieta"],
                ["supplements", "Suplementos"],
              ] as [Section, string][]).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={sections[k]} onCheckedChange={() => toggle(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Aluno de destino</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar aluno..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 text-sm pl-8"
              />
            </div>

            <div className="mt-2 border border-border/60 rounded-md max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Nenhum aluno encontrado.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {filtered.map((st) => (
                    <li key={st.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(st.id)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/40 transition-colors ${
                          selectedId === st.id ? "bg-primary/10 text-primary" : ""
                        }`}
                      >
                        {st.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border/40">
          <Button
            onClick={handleCopy}
            disabled={!selectedId || !payload || copying}
            className="w-full"
          >
            {copying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            Copiar como rascunho
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}