/**
 * StudentArea.tsx — Hub Central do Aluno
 *
 * CORREÇÕES:
 * - Alerta de cobrança dismiss persiste em localStorage (não volta ao recarregar)
 * - Alerta de protocolo dismiss persiste em localStorage
 * - Ao ocultar alerta de cobrança via "Já efetuei o pagamento", notifica o coach
 *   inserindo na tabela coach_notifications (aparece no sino em tempo real)
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Apple, Dumbbell, Pill, TrendingUp, CheckCircle2,
  Loader2, User, AlertCircle, Copy, Check, X, LogOut, Sparkles, ShoppingCart, FileEdit
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import FeedbackCountdownAlert from "@/components/student/FeedbackCountdownAlert";
import { TrainerAlert } from "@/components/student/TrainerAlert";

// Chave do localStorage por user — evita colisão entre alunos no mesmo browser
const DISMISSED_KEY = (uid: string) => `dismissed_alerts_${uid}`;

function loadDismissed(uid: string): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY(uid));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveDismissed(uid: string, ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY(uid), JSON.stringify(ids));
  } catch {
    /* noop */
  }
}

export default function StudentArea() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [notifyingCoach, setNotifyingCoach] = useState(false);

  // ─── Auth + carrega dismissed do localStorage ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const uid = data.session.user.id;
        setUserId(uid);
        setDismissedAlerts(loadDismissed(uid));
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  // ─── Profile ───
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["student-profile-hub", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  // ─── ALERTA 1: Novo Protocolo / Atualização Recente ───
  const { data: protocolAlert } = useQuery({
    queryKey: ["student-protocol-alert", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("protocols")
        .select("id, name, updated_at")
        .eq("student_id", userId)
        .eq("is_template", false)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      const updatedDate = new Date(data.updated_at);
      const diffHours = (new Date().getTime() - updatedDate.getTime()) / (1000 * 60 * 60);

      if (diffHours < 72) {
        return {
          id: `proto-${data.id}-${data.updated_at}`,
          name: data.name,
          date: data.updated_at,
        };
      }
      return null;
    },
  });

  // ─── ALERTA 2: Cobrança ───
  const { data: billingAlert } = useQuery({
    queryKey: ["student-billing-alert", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: link } = await supabase
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (!link?.coach_id) return null;

      const { data: coach } = await supabase
        .from("profiles")
        .select("pix_key, billing_alert_days")
        .eq("user_id", link.coach_id)
        .maybeSingle();

      const { data: finance } = await supabase
        .from("coach_finances")
        .select("*")
        .eq("student_id", userId)
        .eq("status", "pending")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!finance || !finance.due_date) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(finance.due_date);
      dueDate.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const alertThreshold = coach?.billing_alert_days ?? 7;

      if (diffDays <= alertThreshold) {
        return {
          id: finance.id,
          financeId: finance.id,
          coachId: link.coach_id,
          amount: finance.amount,
          dueDate: finance.due_date,
          diffDays,
          pixKey: coach?.pix_key || "Chave PIX não informada pelo treinador.",
        };
      }
      return null;
    },
  });

  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "Aluno";

  // Anamnese — permite até 2 edições pelo aluno
  const { data: anamnesisMeta } = useQuery({
    queryKey: ["student-anamnesis-meta", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("anamnesis")
        .select("id, submitted_at, student_edit_count")
        .eq("student_id", userId)
        .maybeSingle();
      return data as { id: string; submitted_at: string | null; student_edit_count: number } | null;
    },
  });
  const anamnesisEdits = Number(anamnesisMeta?.student_edit_count ?? 0);
  const canEditAnamnesis = !!anamnesisMeta?.submitted_at && anamnesisEdits < 2;

  // ─── Dismiss simples (alerta de protocolo) — persiste no localStorage ───
  const dismissAlert = (id: string) => {
    if (!userId) return;
    const updated = [...dismissedAlerts, id];
    setDismissedAlerts(updated);
    saveDismissed(userId, updated);
  };

  // ─── Dismiss de cobrança + notifica coach ───
  const dismissBillingAlert = async () => {
    if (!billingAlert || !userId) return;
    setNotifyingCoach(true);
    try {
      // 1. Notifica o coach no sino (coach_notifications)
      const studentName = profile?.full_name || "Aluno";
      const dueDateStr = new Date(billingAlert.dueDate).toLocaleDateString("pt-BR");
      const amountStr = billingAlert.amount > 0 ? ` (R$ ${Number(billingAlert.amount).toFixed(2)})` : "";

      await supabase.from("coach_notifications").insert({
        coach_id: billingAlert.coachId,
        student_id: userId,
        student_name: studentName,
        context: "Financeiro",
        message: `${studentName} ocultou o alerta de cobrança${amountStr} com vencimento em ${dueDateStr}. Verifique se o pagamento foi realizado.`,
      });

      // 2. Persiste dismiss localmente
      const updated = [...dismissedAlerts, billingAlert.id];
      setDismissedAlerts(updated);
      saveDismissed(userId, updated);

      toast.success("Aviso ocultado. Seu treinador foi notificado.");
    } catch (err) {
      console.error("Erro ao notificar coach:", err);
      // Mesmo com erro no DB, oculta o alerta localmente
      const updated = [...dismissedAlerts, billingAlert.id];
      setDismissedAlerts(updated);
      saveDismissed(userId, updated);
      toast.success("Aviso ocultado.");
    } finally {
      setNotifyingCoach(false);
    }
  };

  const copyPix = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const modules: Array<{
    title: string; description: string; icon: typeof Apple; color: string;
    bg: string; border: string; route: string;
  }> = [
    { title: "Dieta", description: "Plano alimentar, substituições e macros.", icon: Apple, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", route: "/routine" },
    { title: "Treino", description: "Séries, cadência e diretrizes biomecânicas.", icon: Dumbbell, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", route: "/workout-plan" },
    { title: "Diretrizes & Suplementação", description: "Fármacos, vitaminas e horários de uso.", icon: Pill, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", route: "/supplements" },
    { title: "Evolução", description: "Fotos de progresso, gráficos e anamnese.", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", route: "/evolution" },
    { title: "Check-in", description: "Envie seu feedback periódico para o treinador.", icon: CheckCircle2, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", route: "/check-in" },
    { title: "Lista de Compras", description: "Quantidades agregadas por período e exportação em PDF.", icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", route: "/shopping-list" },
  ];

  if (!userId || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-card border-b border-border/50 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Olá, {firstName}</h1>
              <p className="text-xs text-muted-foreground">Bem-vindo ao seu painel central</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive h-9">
              <LogOut className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* ALERTA DE FEEDBACK PERIÓDICO (13 / 14 / 15+ dias) */}
        {userId && (
          <FeedbackCountdownAlert
            userId={userId}
            dismissed={dismissedAlerts}
            onDismiss={dismissAlert}
          />
        )}

        {/* ALERTA DO COACH (daily_alerts + protocolo atualizado em tempo real) */}
        <TrainerAlert />

        {/* ALERTA DE PROTOCOLO ATUALIZADO */}
        {protocolAlert && !dismissedAlerts.includes(protocolAlert.id) && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 relative shadow-sm">
            <button
              onClick={() => dismissAlert(protocolAlert.id)}
              className="absolute top-3 right-3 text-emerald-600 hover:text-emerald-700"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 w-full">
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-500">
                  Protocolo Atualizado!
                </h3>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 pr-4">
                  Seu treinador atualizou seu protocolo em{" "}
                  {new Date(protocolAlert.date).toLocaleDateString("pt-BR")}.
                  Acesse os módulos abaixo para conferir as novidades.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ALERTA DE COBRANÇA */}
        {billingAlert && !dismissedAlerts.includes(billingAlert.id) && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 relative shadow-sm">
            {/* X só fecha sem notificar */}
            <button
              onClick={() => dismissAlert(billingAlert.id)}
              className="absolute top-3 right-3 text-amber-600 hover:text-amber-700"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 w-full">
                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-500">
                  {billingAlert.diffDays < 0
                    ? `Sua mensalidade está atrasada há ${Math.abs(billingAlert.diffDays)} dia(s)`
                    : billingAlert.diffDays === 0
                      ? "Sua mensalidade vence hoje!"
                      : `Sua mensalidade vence em ${billingAlert.diffDays} dias`}
                </h3>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  Vencimento: {new Date(billingAlert.dueDate).toLocaleDateString("pt-BR")}
                  {billingAlert.amount > 0 && ` • Valor: R$ ${Number(billingAlert.amount).toFixed(2)}`}
                </p>

                <div className="mt-3 bg-background/50 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700/70 mb-1">Chave PIX do Treinador</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-background px-2 py-1.5 rounded text-foreground truncate">
                      {billingAlert.pixKey}
                    </code>
                    <Button
                      size="sm" variant="outline"
                      className="shrink-0 h-8 bg-background"
                      onClick={() => copyPix(billingAlert.pixKey)}
                    >
                      {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Botão principal — notifica coach + persiste dismiss */}
                <div className="pt-2">
                  <Button
                    size="sm"
                    onClick={dismissBillingAlert}
                    disabled={notifyingCoach}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
                  >
                    {notifyingCoach
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Enviando...</>
                      : "Já efetuei o pagamento / Ocultar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2 pt-2">
          Seu Protocolo
        </h2>

        {anamnesisMeta?.submitted_at && (
          <div className="rounded-xl border border-border bg-card/60 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileEdit className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Minha Anamnese</p>
                <p className="text-[11px] text-muted-foreground">
                  {canEditAnamnesis
                    ? `Você pode editar mais ${2 - anamnesisEdits}x. Após isso, fale com seu treinador.`
                    : "Limite de edições atingido. Para novas alterações fale com seu treinador."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEditAnamnesis}
              onClick={() => navigate("/anamnesis?mode=edit")}
            >
              Editar
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {modules.map((mod) => (
            <Card
              key={mod.title}
              className={`hover:shadow-md transition-all bg-card/60 border ${mod.border} cursor-pointer`}
              onClick={() => navigate(mod.route)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${mod.bg}`}>
                    <mod.icon className={`w-6 h-6 ${mod.color}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{mod.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 p-4 bg-muted/30 border border-border/50 rounded-xl text-center">
          <p className="text-xs text-muted-foreground">
            Precisa de ajuda? Acesse o chat da Inteligência Artificial no canto da tela.
          </p>
        </div>
      </main>
    </div>
  );
}
