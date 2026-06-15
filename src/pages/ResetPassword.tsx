import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Lock, KeyRound, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase cria a sessão de recuperação automaticamente ao abrir o link.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setHasRecoverySession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecoverySession(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("A senha precisa ter pelo menos 6 caracteres"); return; }
    if (password !== confirm) { toast.error("As senhas não coincidem"); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha redefinida com sucesso! Faça login.");
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao redefinir senha";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(350_89%_50%/0.08),transparent_60%)]" />

      <Link to="/auth" className="absolute left-6 top-6 z-20">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-strong rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 glow-primary">
              <KeyRound className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Redefinir senha</h1>
            <p className="text-sm text-muted-foreground">
              {hasRecoverySession
                ? "Defina sua nova senha abaixo."
                : "Abra o link enviado para o seu e-mail para redefinir a senha."}
            </p>
          </div>

          {hasRecoverySession && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="new-password" className="text-xs uppercase tracking-wider text-muted-foreground">Nova senha</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input id="new-password" type="password" placeholder="••••••••" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50" required minLength={6} />
                </div>
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-xs uppercase tracking-wider text-muted-foreground">Confirmar senha</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input id="confirm-password" type="password" placeholder="••••••••" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50" required minLength={6} />
                </div>
              </div>
              <Button type="submit" className="w-full rounded-xl h-11 glow-primary mt-4" disabled={isLoading}>
                {isLoading ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando...</>) : "Redefinir senha"}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;