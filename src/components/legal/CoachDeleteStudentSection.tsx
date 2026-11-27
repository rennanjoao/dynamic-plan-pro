// Ficha do aluno (coach): exclusão da conta e dos dados do aluno (LGPD).
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteStudentDialog } from "@/components/legal/DeleteStudentDialog";

type Props = { studentId: string; studentName: string; onDeleted: () => void };

/** Só monta quando aberto: a ficha continua funcionando sem o cliente de cache. */
function CoachDeleteDialog({ studentId, studentName, onDeleted, onClose }: Props & { onClose: () => void }) {
  const qc = useQueryClient();
  return (
    <DeleteStudentDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      studentId={studentId}
      self={false}
      studentName={studentName}
      onDeleted={({ filesFailed }) => {
        onClose();
        if (filesFailed) toast.warning("Aluno excluído. Alguns arquivos não foram apagados; avise o suporte.");
        else toast.success("Aluno e dados excluídos.");
        for (const key of ["coach-students-lite", "coach-students-summary", "coach-students-detail"]) {
          qc.invalidateQueries({ queryKey: [key] });
        }
        onDeleted();
      }}
    />
  );
}

export function CoachDeleteStudentSection(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Dados e privacidade
      </summary>
      <div className="pt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          A pedido do aluno, você pode excluir a conta e todos os dados dele (fotos, anamnese, check-ins, protocolos).
          Não dá para desfazer. Registros financeiros são mantidos.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir aluno e dados
        </Button>
      </div>
      {open && <CoachDeleteDialog {...props} onClose={() => setOpen(false)} />}
    </details>
  );
}
