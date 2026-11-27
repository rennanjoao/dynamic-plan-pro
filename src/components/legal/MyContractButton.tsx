// Perfil do aluno: "Meu contrato" — cópia do texto aceito (com data e hora).
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchMyLatestContract, type AcceptanceRow } from "@/lib/serviceContract";

export function MyContractButton({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<AcceptanceRow | null | undefined>(undefined);

  const show = async () => {
    setOpen(true);
    if (row === undefined) setRow(await fetchMyLatestContract(studentId));
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="w-full" onClick={show}>Meu contrato</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Meu contrato</DialogTitle>
            <DialogDescription>
              {row ? `Aceito em ${new Date(row.accepted_at).toLocaleString("pt-BR")} · Plano ${row.plan_name}` : " "}
            </DialogDescription>
          </DialogHeader>
          {row === undefined ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : row ? (
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/90">{row.text_shown}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Você ainda não tem contrato aceito. Ele aparece quando você contrata ou renova um plano.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
