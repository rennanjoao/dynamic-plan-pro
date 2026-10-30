/**
 * CopyProtocolDialog.tsx — Fase 5
 *
 * Permite copiar o protocolo atual (ou apenas seções: treino/dieta/suplementos)
 * para outro aluno do coach. Cria SEMPRE uma nova linha em `protocols` com
 * `active: false` — o coach precisa revisar e publicar manualmente.
 */
import { useMemo, useState } from "react";
import { sb } from "@/integrations/supabase/untyped";
import { toast } from "sonner";
import { Loader2, Copy, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCoachStudentsLite } from "@/hooks/useCoachStudents";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";
import { buildSaveProtocolArgs } from "@/lib/protocolSave";
import { blankProtocolPayload, copyProtocolSections, type CopySection } from "@/lib/protocolCopy";

const SECTION_LABELS: Record<CopySection, string> = {
  workout: "Treino", diet: "Dieta", supplements: "Suplementos", guidelines: "Diretrizes",
};

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
  const [sections, setSections] = useState<Record<CopySection, boolean>>({
    workout: true, diet: true, supplements: true, guidelines: true,
  });
  const [copying, setCopying] = useState(false);
  // Calorias/macros são individuais (peso, objetivo): por padrão NÃO viajam junto com a dieta.
  const [copyMacros, setCopyMacros] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return students
      .filter((st) => st.id !== sourceStudentId)
      .filter((st) => !s || st.name.toLowerCase().includes(s));
  }, [students, search, sourceStudentId]);

  function toggle(k: CopySection) {
    setSections((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  async function handleCopy() {
    if (!coachId || !payload || !selectedId) return;
    if (!Object.values(sections).some(Boolean)) {
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
        .select("id, payload, revision, name, active")
        .eq("student_id", selectedId)
        .eq("is_template", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (target?.id) {
        const { data: targetDraft, error: draftError } = await sb
          .from("protocol_drafts")
          .select("payload")
          .eq("protocol_id", target.id)
          .maybeSingle();
        if (draftError) throw draftError;
        const base: any = JSON.parse(
          JSON.stringify(targetDraft?.payload ?? target.payload ?? {})
        );
        const picked = (Object.keys(sections) as CopySection[]).filter((k) => sections[k]).map((k) => SECTION_LABELS[k]).join(", ");
        if (!window.confirm(`Substituir ${picked} no rascunho de ${targetName}? O que você não marcou fica como está.`)) return;
        const merged = copyProtocolSections(base, src, sections);
        if (!copyMacros) merged.macros = base.macros;
        const checked = ProtocolPayloadSchema.safeParse(merged);
        if (!checked.success) throw new Error("O protocolo resultante ficou inválido — nada foi copiado");
        const { error } = await sb.rpc("save_protocol_with_plan", buildSaveProtocolArgs({
          protocolId: target.id,
          studentId: selectedId,
          coachId,
          name: target.name || protocolName || "Protocolo",
          payload: checked.data,
          active: target.active ?? false,
          asDraft: true,
          expectedRevision: target.revision ?? 0,
        }));
        if (error) throw error;
        toast.success(
          `Seções copiadas para ${targetName} como rascunho — o restante do protocolo dele foi preservado`
        );
      } else {
        const blank = blankProtocolPayload();
        const next = copyProtocolSections(blank, src, sections);
        if (!copyMacros) next.macros = blank.macros;
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
            As seções marcadas entram como rascunho no protocolo do aluno de destino; o que você não marcar fica como está. Se ele ainda não tiver protocolo, é criado um inativo. Nada vai para o aluno até você revisar e publicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 flex-1 overflow-y-auto">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">O que copiar</p>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(SECTION_LABELS) as CopySection[]).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={sections[k]} onCheckedChange={() => toggle(k)} />
                  {SECTION_LABELS[k]}
                </label>
              ))}
            </div>
            {sections.diet && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer mt-2">
                <Checkbox checked={copyMacros} onCheckedChange={() => setCopyMacros((v) => !v)} />
                Copiar também calorias e macros do aluno de origem
              </label>
            )}
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
