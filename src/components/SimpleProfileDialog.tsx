import { useEffect, useState } from "react";
import { KeyRound, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Perfil simples reutilizável — usado pelo Aluno e pelo Admin.
 * Contém: nome completo (editável), e-mail (somente leitura) e troca de senha.
 * O Coach tem seu próprio ProfileDialog mais completo (PIX, equipe, código de convite etc).
 */
export function SimpleProfileDialog({ userId, open, onClose }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Troca de senha
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoadingProfile(true);
    Promise.all([
      supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle(),
      supabase.auth.getUser(),
    ]).then(([profileRes, userRes]) => {
      setFullName(profileRes.data?.full_name || "");
      setEmail(userRes.data.user?.email || null);
      setLoadingProfile(false);
    });
  }, [open, userId]);

  const save = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil.");
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!email) {
      toast.error("Não foi possível identificar seu e-mail.");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Link de redefinição enviado para ${email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar link.");
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4" /> Meu Perfil
          </DialogTitle>
        </DialogHeader>

        {loadingProfile ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nome completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 h-9 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">E-mail</Label>
              <Input value={email || ""} disabled className="mt-1 h-9 text-sm opacity-70" />
            </div>

            <Button onClick={save} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loading ? "Salvando..." : "Salvar alterações"}
            </Button>

            <div className="border-t border-border pt-3">
              <Button
                variant="outline"
                onClick={sendPasswordReset}
                disabled={sendingReset}
                className="w-full"
              >
                {sendingReset ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <KeyRound className="w-4 h-4 mr-2" />
                )}
                Trocar senha
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                Enviaremos um link de redefinição para seu e-mail.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
