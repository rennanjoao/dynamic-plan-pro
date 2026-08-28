import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { useProfileRecord } from "@/hooks/useProfileRecord";

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
}

interface SimpleProfileRow {
  full_name: string | null;
  email: string | null;
}

const PROFILE_COLUMNS = "full_name, email";
const FULL_NAME_MAX_LENGTH = 80;

/**
 * Perfil simples reutilizável — usado pelo Aluno e pelo Admin.
 * Contém: nome completo (editável), e-mail (somente leitura, lido direto de
 * `profiles.email` — sem round-trip extra a `auth.getUser()`) e troca de
 * senha (via ChangePasswordButton, o mesmo botão do Perfil do Coach).
 * O Coach tem seu próprio ProfileDialog mais completo (PIX, equipe, código
 * de convite etc).
 */
export function SimpleProfileDialog({ userId, open, onClose }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, loading: fetching, error: fetchError, refetch } =
    useProfileRecord<SimpleProfileRow>(userId, open, PROFILE_COLUMNS);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasLoadedRef = useRef(false);
  const snapshotRef = useRef<string>("");

  useEffect(() => {
    if (!data) return;
    const name = data.full_name || "";
    setFullName(name);
    setEmail(data.email || null);
    snapshotRef.current = JSON.stringify({ fullName: name });
    hasLoadedRef.current = true;
  }, [data]);

  // Cada reabertura começa "limpa" — evita comparar com o snapshot de uma
  // sessão anterior antes do novo fetch responder.
  useEffect(() => {
    if (!open) hasLoadedRef.current = false;
  }, [open]);

  const isDirty = () =>
    hasLoadedRef.current && JSON.stringify({ fullName }) !== snapshotRef.current;

  const requestClose = async () => {
    if (isDirty()) {
      const ok = await confirm({
        title: "Descartar alterações?",
        description: "Você tem alterações não salvas no seu perfil. Se sair agora, elas serão perdidas.",
        confirmLabel: "Descartar",
        cancelLabel: "Continuar editando",
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const trimmedName = fullName.trim();
  const canSave = !saving && trimmedName.length > 0;

  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current) return;
    if (!trimmedName) {
      toast.error("Informe seu nome completo.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmedName })
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      snapshotRef.current = JSON.stringify({ fullName: trimmedName });
      qc.invalidateQueries({ queryKey: ["student-profile-hub", userId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4" /> Meu Perfil
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edite seu nome e altere sua senha de acesso.
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : fetchError ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar seu perfil.</p>
            <p className="text-xs text-muted-foreground">{fetchError}</p>
            <Button type="button" variant="outline" size="sm" onClick={refetch}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nome completo</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={FULL_NAME_MAX_LENGTH}
                className="mt-1 h-9 text-sm"
              />
              {!trimmedName && (
                <p className="text-[10px] text-destructive mt-1">O nome não pode ficar em branco.</p>
              )}
            </div>

            <div>
              <Label className="text-xs">E-mail</Label>
              <Input value={email || ""} disabled className="mt-1 h-9 text-sm opacity-70" />
            </div>

            <Button onClick={save} disabled={!canSave} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>

            <div className="border-t border-border pt-3">
              <ChangePasswordButton variant="outline" className="w-full" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
