import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmProvider";
import type { ProtocolPayload } from "@/lib/protocolSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Version {
  id: string;
  version: number;
  payload: ProtocolPayload;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  protocolId: string | null;
  protocolName: string;
  onRestore: (payload: ProtocolPayload) => void;
}

export default function ProtocolVersionHistoryDialog({
  open, onOpenChange, protocolId, protocolName, onRestore,
}: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open || !protocolId) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from("protocol_versions")
        .select("id, version, payload, created_at")
        .eq("protocol_id", protocolId)
        .order("version", { ascending: false });
      if (active) {
        if (error) toast.error(error.message);
        setVersions((data as Version[]) || []);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, protocolId]);

  async function handleRestore(v: Version) {
    const ok = await confirm({
      title: "Restaurar versão",
      description: `Carregar a versão ${v.version} para edição? Isso substitui o conteúdo atual em tela. O aluno só verá a mudança depois que você clicar em "Atualizar protocolo".`,
      confirmLabel: "Restaurar",
    });
    if (!ok) return;
    onRestore(v.payload);
    onOpenChange(false);
    toast.success(`Versão ${v.version} carregada — revise e publique`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" /> Histórico — {protocolName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cada publicação gera uma nova versão. Restaurar carrega o conteúdo antigo pra edição — nada é publicado sem seu clique.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {!loading && versions.length === 0 && (
          <p className="text-xs italic text-muted-foreground text-center py-8">
            Nenhuma versão anterior registrada ainda.
          </p>
        )}

        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="border border-border rounded-lg p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">v{v.version}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(v.created_at).toLocaleString("pt-BR")}
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