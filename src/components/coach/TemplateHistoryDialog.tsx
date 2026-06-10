import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Version {
  id: string;
  version: number;
  scope: string;
  name: string;
  description: string | null;
  treinos: any;
  updated_by_name: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string | null;
  templateName: string;
  onRestore: (treinos: any) => void;
}

export default function TemplateHistoryDialog({ open, onOpenChange, templateId, templateName, onRestore }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !templateId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from("workout_template_versions")
        .select("*")
        .eq("template_id", templateId)
        .order("version", { ascending: false });
      if (active) {
        if (error) toast.error(error.message);
        setVersions((data as Version[]) || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, templateId]);

  function handleRestore(v: Version) {
    if (!confirm(`Restaurar versão ${v.version} de "${v.name}"? Isso substitui o conteúdo atual.`)) return;
    onRestore(v.treinos);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" /> Histórico — {templateName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cada salvamento gera uma nova versão. Restaure para reverter ao estado anterior.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        )}

        {!loading && versions.length === 0 && (
          <p className="text-xs italic text-muted-foreground text-center py-8">Nenhuma versão registrada.</p>
        )}

        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="border border-border rounded-lg p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">v{v.version}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {v.scope === "full" ? "Treino + Periodização" : "Periodização"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(v.created_at).toLocaleString("pt-BR")} ·{" "}
                  {v.updated_by_name || "—"}
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRestore(v)}>
                <RotateCcw className="w-3 h-3 mr-1" /> Restaurar
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}