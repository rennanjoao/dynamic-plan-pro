// Bloco "Privacidade" no Perfil do aluno: links e exclusão da própria conta.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DeleteStudentDialog } from "@/components/legal/DeleteStudentDialog";
import { MyContractButton } from "@/components/legal/MyContractButton";

export function StudentPrivacySection({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        <Link to="/privacidade" className="underline">Política de Privacidade</Link>
        {" · "}
        <Link to="/termos" className="underline">Termos de Uso</Link>
      </p>
      <MyContractButton studentId={studentId} />
      <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        Excluir minha conta e meus dados
      </Button>
      <DeleteStudentDialog
        open={open}
        onOpenChange={setOpen}
        studentId={studentId}
        self
        onDeleted={async () => {
          toast.success("Sua conta e seus dados foram excluídos.");
          try { localStorage.clear(); } catch { /* sem acesso ao armazenamento */ }
          await supabase.auth.signOut().catch(() => undefined);
          navigate("/", { replace: true });
        }}
      />
    </div>
  );
}
