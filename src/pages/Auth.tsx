import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Lock, Mail, Zap, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

// Registra o acesso na tabela access_logs (não bloqueia o login se falhar)
async function registerAccessLog(userId: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: authUser } = await supabase.auth.getUser();

    await supabase.from("access_logs").insert({
      user_id: userId,
      role: roleRow?.role || "user",
      full_name: profile?.full_name || null,
      email: authUser?.user?.email || null,
    });
  } catch {
    // silently fail — não bloqueia login
  }
}

const Auth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [recoverEmail, setRecoverEmail] = useState("");

  const routeByRole = async (userId: string) => {
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin) { navigate("/admin"); return; }
    const { data: isCoach } = await supabase.rpc("has_role", { _user_id: userId, _role: "coach" });
    if (isCoach) { navigate("/coach"); return; }
    navigate("/student-area");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) routeByRole(session.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });
      if (error) throw error;
      toast.success("Login realizado com sucesso!");
      if (data.user) {
        // Registra o acesso em background (não bloqueia navegação)
        registerAccessLog(data.user.id);
        await routeByRole(data.user.id);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao fazer login";
      if (msg.includes("Invalid login credentials")) {
        toast.error("Email ou senha incorretos");
      } else {
        toast.error(msg);
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
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar link de recuperação");
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
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {mode === "login" ? "Acesso do Aluno" : "Recuperar senha"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Insira seus dados para acessar o painel."
                : "Informe seu e-mail e enviaremos um link para redefinir a senha."}
            </p>
          </div>

          {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <Label htmlFor="login-email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input id="login-email" type="email" placeholder="seu@email.com" value={loginData.email}
                  onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50" required />
              </div>
            </div>
            <div>
              <Label htmlFor="login-password" className="text-xs uppercase tracking-wider text-muted-foreground">Senha</Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input id="login-password" type="password" placeholder="••••••••" value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50" required />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-11 glow-primary mt-4" disabled={isLoading}>
              {isLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>) : "Entrar"}
            </Button>
            <button type="button" onClick={() => setMode("recover")}
              className="block w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors mt-2">
              Esqueci minha senha
            </button>
          </form>
          ) : (
          <form onSubmit={handleRecover} className="space-y-5">
            <div>
              <Label htmlFor="recover-email" className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input id="recover-email" type="email" placeholder="seu@email.com" value={recoverEmail}
                  onChange={(e) => setRecoverEmail(e.target.value)}
                  className="pl-10 rounded-xl bg-secondary/30 border-border/50 focus:border-primary/50" required />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-11 glow-primary mt-4" disabled={isLoading}>
              {isLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>) : "Enviar link de redefinição"}
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

export default Auth;
