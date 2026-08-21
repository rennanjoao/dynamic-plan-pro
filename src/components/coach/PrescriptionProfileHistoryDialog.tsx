/**
 * PrescriptionProfileHistoryDialog.tsx — histórico do Perfil de Prescrição.
 *
 * Somente leitura. Cada snapshot em `prescription_profile_versions` é gravado
 * automaticamente por um trigger no banco (`snapshot_prescription_profile`)
 * antes de cada edição do perfil — não existe ação de "restaurar" aqui de
 * propósito: diferente do histórico de protocolo, reaplicar um estado antigo
 * de dominância/prioridade sem revisão do coach não faz sentido como atalho.
 * O primeiro salvamento de um perfil nunca aparece aqui (o trigger só roda em
 * UPDATE, não em INSERT) — é esperado, não é bug.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/muscleGroupClassifier";
import {
  DOMINANCE_LABELS, PRIORITY_LEVEL_LABELS, SOURCE_LABELS,
  type Dominance, type PriorityLevel, type SourceKind,
} from "@/lib/prescriptionProfileSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface VersionRow {
  id: string;
  version: number;
  snapshot_at: string;
  muscle_priorities: Partial<Record<MuscleGroup, PriorityLevel>>;
  dominances: Dominance[];
  limitations: string | null;
  visual_observations: string | null;
  sources: Record<string, SourceKind>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
}

function SourceTag({ field, sources }: { field: string; sources: Record<string, SourceKind> }) {
  const s = sources?.[field];
  if (!s) return null;
  return <span className="text-[10px] text-muted-foreground">({SOURCE_LABELS[s]})</span>;
}

export default function PrescriptionProfileHistoryDialog({ open, onOpenChange, studentId }: Props) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from("prescription_profile_versions")
        .select("id, version, snapshot_at, muscle_priorities, dominances, limitations, visual_observations, sources")
        .eq("student_id", studentId)
        .order("version", { ascending: false });
      if (active) {
        if (error) toast.error(`Falha ao carregar histórico: ${error.message}`);
        setVersions((data as VersionRow[]) || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" /> Histórico do Perfil de Prescrição
          </DialogTitle>
          <DialogDescription className="text-xs">
            Um snapshot é registrado automaticamente a cada edição. Somente leitura — não é possível restaurar
            uma versão anterior por aqui.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {!loading && versions.length === 0 && (
          <p className="text-xs italic text-muted-foreground text-center py-8">
            Nenhuma alteração anterior registrada ainda. O histórico começa a partir da segunda edição do perfil.
          </p>
        )}

        <div className="space-y-3">
          {versions.map((v) => {
            const priorityEntries = Object.entries(v.muscle_priorities || {}) as [MuscleGroup, PriorityLevel][];
            return (
              <div key={v.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">v{v.version}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(v.snapshot_at).toLocaleString("pt-BR")}
                  </span>
                </div>

                {priorityEntries.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Prioridades <SourceTag field="muscle_priorities" sources={v.sources} />
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {priorityEntries.map(([g, p]) => (
                        <span key={g} className="rounded-full border border-border px-2 py-0.5 text-[10px]">
                          {MUSCLE_GROUP_LABELS[g]}: {PRIORITY_LEVEL_LABELS[p]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {v.dominances?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Dominâncias <SourceTag field="dominances" sources={v.sources} />
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {v.dominances.map((d) => (
                        <span key={d} className="rounded-full border border-border px-2 py-0.5 text-[10px]">
                          {DOMINANCE_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {v.limitations && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Limitações <SourceTag field="limitations" sources={v.sources} />
                    </p>
                    <p className="text-xs">{v.limitations}</p>
                  </div>
                )}

                {v.visual_observations && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">
                      Observação visual <SourceTag field="visual_observations" sources={v.sources} />
                    </p>
                    <p className="text-xs">{v.visual_observations}</p>
                  </div>
                )}

                {priorityEntries.length === 0 && !v.dominances?.length && !v.limitations && !v.visual_observations && (
                  <p className="text-[11px] italic text-muted-foreground">Perfil vazio nesta versão.</p>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
