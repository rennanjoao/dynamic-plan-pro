/**
 * Atalho "Marcar postura" dentro do painel de feedback do check-in: abre a
 * postura rápida já nas fotos deste check-in, sem sair do painel.
 */
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { POSTURE_SQL_MISSING_MSG, usePostureQuickChecks } from "@/hooks/usePostureQuickChecks";
import PostureQuickEditor, { type PostureSource } from "./PostureQuickEditor";
import { PostureTimeline } from "./PostureQuickTab";

export default function PostureQuickDialog({
  open, onClose, studentId, source,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  source: PostureSource;
}) {
  const q = usePostureQuickChecks(open ? studentId : null);
  const checks = q.data?.checks ?? [];
  const existing = checks.find((c) => c.source_kind === source.kind && c.source_id === source.id) ?? null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Postura deste check-in</DialogTitle>
          <DialogDescription>Marque só o que você enxergar nas fotos. Leva menos de um minuto.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : q.data?.missingTable ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{POSTURE_SQL_MISSING_MSG}</span>
          </div>
        ) : (
          <div className="space-y-5">
            <PostureQuickEditor studentId={studentId} source={source} existing={existing} />
            {checks.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Evolução da postura</h3>
                <PostureTimeline checks={checks} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
