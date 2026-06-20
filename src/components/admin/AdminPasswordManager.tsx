import { useState } from "react";
import { KeyRound, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Found = { id: string; email: string; full_name: string };

export function AdminPasswordManager() {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const lookup = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setFound(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "find-student-by-email", email: email.trim() },
      });
      if (error) throw error;
      if (!data?.student) {
        toast.error("Usuário não encontrado.");
        return;
      }
      setFound(data.student);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar usuário.");
    } finally {
      setSearching(false);
    }
  };

  const updatePassword = async () => {
    if (!found) return;
    if (password.length < 6) {
      toast.error("Senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: { action: "update-password", trainerId: found.id, password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Senha de ${found.full_name} atualizada.`);
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="w-5 h-5" /> Trocar senha de qualquer usuário
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Busque pelo e-mail e defina uma nova senha diretamente. Para a sua própria senha, use o botão "Trocar senha" no topo.
        </p>
      </div>

      <div className="space-y-2">
        <Label>E-mail do usuário</Label>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="usuario@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <Button onClick={lookup} disabled={searching || !email.trim()}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {found && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Usuário: </span>
            <span className="font-semibold">{found.full_name}</span>
            <span className="text-muted-foreground"> ({found.email})</span>
          </div>
          <div className="space-y-2">
            <Label>Nova senha (mín. 6 caracteres)</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha"
            />
          </div>
          <Button onClick={updatePassword} disabled={saving || password.length < 6}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Atualizar senha
          </Button>
        </div>
      )}
    </div>
  );
}