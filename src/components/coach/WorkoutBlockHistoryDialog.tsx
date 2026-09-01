import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  listWorkoutBlockVersions, restoreWorkoutBlockVersion, type WorkoutBlockVersion,
} from "@/lib/workoutTemplates";

export function WorkoutBlockHistoryDialog({
  open, onOpenChange, templateId, templateName, coachId, onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateName: string;
  coachId: string;
  onRestored: () => void;
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<WorkoutBlockVersion[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listWorkoutBlockVersions(templateId)
      .then(setVersions)
      .catch((e) => toast.error(e?.message || "Falha ao carregar histórico"))
      .finally(() => setLoading(false));
  }, [open, templateId]);

  async function handleRestore(v: WorkoutBlockVersion) {
    if (!(await confirm({
      title: "Restaurar esta versão",
      description: `A versão atual de "${templateName}" será substituída pelo conteúdo salvo em ${new Date(v.createdAt).toLocaleString("pt-BR")}. O estado atual vira uma nova versão no histórico, então nada se perde.`,
      confirmLabel: "Restaurar",
    }))) return;
    setRestoringId(v.id);
    try {
      await restoreWorkoutBlockVersion(templateId, coachId, templateName, v);
      toast.success("Versão restaurada");
      onRestored();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao restaurar");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Histórico — {templateName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : versions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Nenhuma versão anterior — este template ainda não foi editado depois de criado.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                <div className="text-xs">
                  <div className="font-medium">Versão {v.version}</div>
                  <div className="text-muted-foreground">{new Date(v.createdAt).toLocaleString("pt-BR")}</div>
                </div>
                <Button
                  size="sm" variant="outline" className="h-7 text-[11px]"
                  disabled={restoringId === v.id}
                  onClick={() => handleRestore(v)}
                >
                  {restoringId === v.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <><RotateCcw className="w-3 h-3 mr-1" /> Restaurar</>}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
