import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  email?: string | null;
  variant?: "ghost" | "outline";
  className?: string;
  compact?: boolean;
}

export function ChangePasswordButton({ email, variant = "ghost", className, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    let target = email || "";
    if (!target) {
      const { data } = await supabase.auth.getUser();
      target = data.user?.email || "";
    }
    if (!target) {
      toast.error("Não foi possível identificar seu e-mail.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Link de redefinição enviado para ${target}.`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" className={className}>
          <KeyRound className="w-4 h-4 sm:mr-1.5" />
          {!compact && <span className="hidden sm:inline">Trocar senha</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>
            Enviaremos um link de redefinição para o seu e-mail cadastrado. Clique nele e defina uma nova senha.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Enviar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}