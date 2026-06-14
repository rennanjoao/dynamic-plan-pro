/**
 * CoachRegister.tsx
 *
 * CORREÇÃO: Adicionado campo opcional "Email de notificações" com toggle.
 * Se desativado, usa o email principal. Se ativado, permite informar um
 * email separado para receber alertas de check-in, anamnese e dúvidas.
 */
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle, Mail, Bell, BellOff } from "lucide-react";

export default function CoachRegister() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("invite");
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [inviteData, setInviteData] = useState<{ id: string; email: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", password: "", teamName: "" });

  // Toggle de email de notificação separado
  const [useCustomNotifEmail, setUseCustomNotifEmail] = useState(false);
  const [notifEmail, setNotifEmail] = useState("");

  useEffect(() => {
    if (!token) {
      toast.error("Token ausente.");
      setValidating(false);
      return;
    }

    supabase.functions.invoke("manage-trainers", {
      body: { action: "validate-coach-invite", token }
    }).then(({ data, error }) => {
      if (error || !data?.valid) {
        toast.error(data?.reason || "Convite inválido ou expirado.");
      } else {
        setInviteData({ id: data.invite_id, email: data.email });
      }
      setValidating(false);
      setLoading(false);
    });
  }, [token]);

  const handleRegister = async () => {
    if (!form.fullName || form.password.length < 6) {
      toast.error("Preencha o nome e uma senha com mínimo de 6 caracteres.");
      return;
    }
    if (useCustomNotifEmail && notifEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifEmail)) {
      toast.error("Email de notificação inválido.");
      return;
    }
    setLoading(true);
    try {
      const resolvedNotifEmail = useCustomNotifEmail && notifEmail.trim()
        ? notifEmail.trim()
        : inviteData!.email;

      const { data, error } = await supabase.functions.invoke("manage-trainers", {
        body: {
          action: "register-via-invite",
          token,
          fullName: form.fullName,
          teamName: form.teamName,
          password: form.password,
          notificationEmail: resolvedNotifEmail,
        }
      });

      if (error || data?.error) throw new Error(data?.error || "Erro ao registrar");

      toast.success("Conta criada! Faça o login.");
      navigate("/auth");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    } finally {
      setLoading(false);
    }
  };

  if (validating) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!inviteData) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-6 text-center space-y-4">
        <h2 className="text-xl font-bold text-destructive">Convite Inválido</h2>
        <p className="text-sm text-muted-foreground">O link que você acessou expirou ou já foi utilizado.</p>
        <Button onClick={() => navigate("/auth")} className="w-full">Ir para Login</Button>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Concluir Cadastro</h2>
          <p className="text-sm text-muted-foreground">Configure seu perfil para acessar o painel de Coach.</p>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Email (Bloqueado)</Label>
            <Input value={inviteData.email} disabled className="mt-1 bg-muted/50" />
          </div>
          <div>
            <Label>Nome Completo *</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Equipe / Empresa (Opcional)</Label>
            <Input value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} placeholder="Ex: Team Performance" className="mt-1" />
          </div>
          <div>
            <Label>Senha de Acesso *</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" className="mt-1" />
          </div>

          {/* ── Email de notificações ── */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Email de notificações</span>
              </div>
              <button
                type="button"
                onClick={() => { setUseCustomNotifEmail(v => !v); setNotifEmail(""); }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${useCustomNotifEmail ? "bg-primary" : "bg-muted"}`}
                aria-label="Ativar email separado para notificações"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${useCustomNotifEmail ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {!useCustomNotifEmail ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <BellOff className="w-3.5 h-3.5 shrink-0" />
                Alertas de check-in e dúvidas serão enviados para <strong>{inviteData.email}</strong>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 shrink-0 text-primary" />
                  Informe um email diferente para receber as notificações do sistema.
                </p>
                <Input
                  type="email"
                  value={notifEmail}
                  onChange={(e) => setNotifEmail(e.target.value)}
                  placeholder="Ex: alertas@meucoach.com.br"
                  className="text-sm"
                />
              </div>
            )}
          </div>

          <Button onClick={handleRegister} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Conta e Acessar
          </Button>
        </div>
      </Card>
    </div>
  );
}
