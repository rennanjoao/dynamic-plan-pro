// Confirmação forte para excluir a conta e os dados de um aluno (LGPD).
// Usada pelo próprio aluno (Perfil) e pelo coach (ficha do aluno).
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DELETE_CONFIRM_WORD, deleteStudentAccount } from "@/lib/accountDeletion";

export function DeleteStudentDialog({
  open, onOpenChange, studentId, self, studentName, onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  /** true = o próprio aluno excluindo a conta. */
  self: boolean;
  studentName?: string;
  onDeleted: (r: { filesFailed: boolean }) => void;
}) {
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = word.trim().toUpperCase() === DELETE_CONFIRM_WORD;

  const close = (o: boolean) => {
    if (busy) return;
    if (!o) { setWord(""); setError(""); }
    onOpenChange(o);
  };

  const run = async () => {
    if (!ready || busy) return;
    setBusy(true); setError("");
    const r = await deleteStudentAccount(studentId);
    setBusy(false);
    if ("error" in r) { setError(r.error); return; }
    setWord("");
    onDeleted({ filesFailed: r.filesFailed });
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{self ? "Excluir minha conta e meus dados" : `Excluir ${studentName || "este aluno"} e os dados dele`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                {self ? "Sua conta será apagada" : "A conta do aluno será apagada"} junto com anamnese, check-ins, fotos,
                medidas, treinos, protocolos e histórico. <strong>Não dá para desfazer</strong>
                {self ? " — se voltar depois, os resultados anteriores não estarão mais aqui." : "."}
              </p>
              <p>Registros de pagamento são guardados pelo prazo que a lei exige.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block space-y-1.5 text-sm">
          <span>Para confirmar, digite <strong>{DELETE_CONFIRM_WORD}</strong>:</span>
          <Input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            disabled={busy}
            aria-invalid={!!error}
          />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={run} disabled={!ready || busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Excluindo..." : "Excluir definitivamente"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
