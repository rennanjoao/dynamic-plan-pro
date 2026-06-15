import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { ArrowLeft, Shield, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [recoverEmail, setRecoverEmail] = useState("");

  const routeByRole = async (userId: string) => {
    const [{ data: isAdmin }, { data: isCoach }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "coach" }),
    ]);

    if (isAdmin) {
      toast.success("Bem-vindo, administrador!");
      navigate("/admin", { replace: true });
      return true;
    }

    if (isCoach) {
      toast.success("Bem-vindo, coach!");
      navigate("/coach", { replace: true });
      return true;
    }

    return false;
  };

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await routeByRole(user.id);
    };
    checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;

      const canAccess = await routeByRole(authData.user.id);
      if (canAccess) return;

      await supabase.auth.signOut();
      toast.error("Acesso negado. Esta conta não tem permissão de administrador ou coach.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Invalid login credentials")) {
        toast.error("Credenciais inválidas");
      } else {
        toast.error(message || "Erro ao fazer login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(recoverEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de redefinição para o seu e-mail");
      setMode("login");
      setRecoverEmail("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar link";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(350_89%_50%/0.08),transparent_60%)]" />

      

      <Link to="/" className="absolute left-6 top-6 z-20">
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
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Área Administrativa e Treinador</h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Admin entra no painel geral; coach entra na área do treinador."
                : "Informe seu e-mail para receber o link de redefinição."}
            </p>
          </div>

          {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="admin-email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="admin-password" className="text-xs uppercase tracking-wider text-muted-foreground">Senha</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-11 glow-primary" disabled={isLoading}>
              {isLoading ? "Verificando..." : "Entrar"}
            </Button>
            <button type="button" onClick={() => setMode("recover")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors mt-2">
              Esqueci minha senha
            </button>
          </form>
          ) : (
          <form onSubmit={handleRecover} className="space-y-4">
            <div>
              <Label htmlFor="recover-admin-email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="recover-admin-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={recoverEmail}
                  onChange={(e) => setRecoverEmail(e.target.value)}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-11 glow-primary" disabled={isLoading}>
              {isLoading ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
            <button type="button" onClick={() => setMode("login")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors mt-2">
              Voltar ao login
            </button>
          </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
