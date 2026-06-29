/**
 * StudentArea.tsx — Hub Central do Aluno
 *
 * MELHORIAS v2:
 * - Avatar com iniciais coloridas no header
 * - Saudação dinâmica por hora do dia
 * - Streak de treino (dias seguidos) com ícone de chama
 * - Status do treino de hoje no card de Treino
 * - Dieta e Treino em destaque (full width) acima dos demais módulos
 * - Rodapé substituído por card do coach
 * - Mantidas todas as lógicas de alerta, dismiss e notificação
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Apple, Dumbbell, Pill, TrendingUp, CheckCircle2,
  Loader2, AlertCircle, Copy, Check, X, LogOut, Sparkles,
  ShoppingCart, FileEdit, Flame, User,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SimpleProfileDialog } from "@/components/SimpleProfileDialog";
import { toast } from "sonner";
import FeedbackCountdownAlert from "@/components/student/FeedbackCountdownAlert";
import { TrainerAlert } from "@/components/student/TrainerAlert";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useStudentHubContext } from "@/hooks/useStudentHubContext";
import { buildPixBrCode } from "@/lib/pixBrCode";
import QRCode from "qrcode";

// ─── localStorage helpers ───────────────────────────────────────────────────
const DISMISSED_KEY = (uid: string) => `dismissed_alerts_${uid}`;
function loadDismissed(uid: string): string[] {
  try { const r = localStorage.getItem(DISMISSED_KEY(uid)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveDismissed(uid: string, ids: string[]) {
  try { localStorage.setItem(DISMISSED_KEY(uid), JSON.stringify(ids)); } catch { /* noop */ }
}

// Sincroniza dispensa de alertas com o banco (persistente entre dispositivos).
// localStorage segue como cache otimista local.
async function fetchDismissedFromDB(uid: string): Promise<string[]> {
  try {
    const { data } = await (supabase as any)
      .from("student_dismissed_alerts")
      .select("alert_id")
      .eq("user_id", uid);
    return (data ?? []).map((r: { alert_id: string }) => r.alert_id);
  } catch {
    return [];
  }
}
async function persistDismissedToDB(uid: string, alertId: string) {
  try {
    await (supabase as any)
      .from("student_dismissed_alerts")
      .upsert({ user_id: uid, alert_id: alertId }, { onConflict: "user_id,alert_id" });
  } catch { /* cache local ainda mantém */ }
}

// ─── Saudação dinâmica ──────────────────────────────────────────────────────
function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Bom dia, ${name} ☀️`;
  if (h < 18) return `Bora treinar, ${name} 💪`;
  return `Boa noite, ${name} 🌙`;
}

// ─── Avatar com iniciais ────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-amber-500/20 text-amber-600",
  "bg-blue-500/20 text-blue-600",
  "bg-purple-500/20 text-purple-600",
  "bg-emerald-500/20 text-emerald-600",
  "bg-rose-500/20 text-rose-600",
];
function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  const colorIdx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${AVATAR_COLORS[colorIdx]}`}>
      {initials || "?"}
    </div>
  );
}

// ─── Streak badge ────────────────────────────────────────────────────────────
function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1">
      <Flame className="w-3.5 h-3.5 text-orange-500" />
      <span className="text-xs font-bold text-orange-600">{streak} dias seguidos</span>
    </div>
  );
}

// ─── Calcula streak de treino ────────────────────────────────────────────────
function calcStreak(
  logs: { completed_at: string | null }[],
  lastSessionAt?: string | null
): number {
  const rawDays = logs
    .filter((l) => l.completed_at)
    .map((l) => new Date(l.completed_at!).toISOString().slice(0, 10));

  if (lastSessionAt) {
    rawDays.push(new Date(lastSessionAt).toISOString().slice(0, 10));
  }

  const days = [...new Set(rawDays)].sort().reverse();
  if (!days.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let streak = 0;
  let cursor = new Date(days[0]);
  for (const day of days) {
    const d = new Date(day);
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000);
    if (diff > 1) break;
    streak++;
    cursor = d;
  }
  return streak;
}

export default function StudentArea() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  useWakeLock();
  const [copiedPix, setCopiedPix] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [notifyingCoach, setNotifyingCoach] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ─── Auth ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const uid = data.session.user.id;
        setUserId(uid);
        setDismissedAlerts(loadDismissed(uid));
        // Mescla com fonte autoritativa no banco
        fetchDismissedFromDB(uid).then((remote) => {
          if (!remote.length) return;
          setDismissedAlerts((prev) => {
            const merged = Array.from(new Set([...prev, ...remote]));
            saveDismissed(uid, merged);
            return merged;
          });
        });
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  // ─── Hub Context (uma única RPC consolida 7 queries) ───
  const { data: hub, isLoading: hubLoading } = useStudentHubContext(userId);

  const profile = hub ? { full_name: hub.full_name ?? null } : null;
  const profileLoading = hubLoading;

  const workoutLogs = (hub?.workout_logs ?? []).map((t) => ({
    completed_at: t,
    workout_id: "",
    completed: true,
  }));

  const coachLink = hub?.coach
    ? {
        full_name: hub.coach.full_name,
        pix_key: hub.coach.pix_key ?? null,
        pix_holder_name: hub.coach.pix_holder_name ?? null,
        pix_city: hub.coach.pix_city ?? null,
        billing_alert_days: hub.coach.billing_alert_days ?? null,
        coachId: hub.coach.id,
      }
    : null;

  const hasProtocol = !!hub?.protocol;

  const protocolAlert = (() => {
    if (!hub?.protocol) return null;
    const diffHours = (Date.now() - new Date(hub.protocol.updated_at).getTime()) / 3600000;
    if (diffHours < 72) {
      return {
        id: `proto-${hub.protocol.id}-${hub.protocol.updated_at}`,
        name: hub.protocol.name,
        date: hub.protocol.updated_at,
      };
    }
    return null;
  })();

  const billingAlert = (() => {
    if (!hub?.pending_bill || !hub?.coach) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueDate = new Date(hub.pending_bill.due_date); dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
    const threshold = hub.coach.billing_alert_days ?? 7;
    if (diffDays > threshold) return null;
    const pixKey = hub.coach.pix_key || "Chave PIX não informada pelo treinador.";
    return {
      id: `bill-${hub.coach.id}-${hub.pending_bill.due_date}`,
      financeId: `${hub.coach.id}-${hub.pending_bill.due_date}`,
      coachId: hub.coach.id,
      amount: hub.pending_bill.amount,
      dueDate: hub.pending_bill.due_date,
      diffDays,
      pixKey,
      pixHolderName: hub.coach.pix_holder_name || hub.coach.full_name || "RECEBEDOR",
      pixCity: hub.coach.pix_city || "BRASIL",
      hasPix: !!hub.coach.pix_key,
    };
  })();

  const anamnesisMeta = hub?.anamnesis_meta ?? null;

  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "Aluno";
  const anamnesisEdits = Number(anamnesisMeta?.student_edit_count ?? 0);
  const canEditAnamnesis = !!anamnesisMeta?.submitted_at && anamnesisEdits < 2;
  const streak = calcStreak(workoutLogs, hub?.last_session_at);

  // Status treino hoje
  const todayStr = new Date().toISOString().slice(0, 10);
  const trainedToday = (workoutLogs ?? []).some(
    (l) => l.completed_at?.slice(0, 10) === todayStr
  );

  // ─── Dismiss / notificações ───
  const dismissAlert = (id: string) => {
    if (!userId) return;
    const updated = [...dismissedAlerts, id];
    setDismissedAlerts(updated);
    saveDismissed(userId, updated);
    void persistDismissedToDB(userId, id);
  };

  const dismissBillingAlert = async () => {
    if (!billingAlert || !userId) return;
    setNotifyingCoach(true);
    try {
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
      const updated = [...dismissedAlerts, billingAlert.id];
      setDismissedAlerts(updated);
      saveDismissed(userId, updated);
      void persistDismissedToDB(userId, billingAlert.id);
      toast.success("Aviso ocultado. Seu treinador foi notificado.");
    } catch {
      const updated = [...dismissedAlerts, billingAlert.id];
      setDismissedAlerts(updated);
      saveDismissed(userId, updated);
      void persistDismissedToDB(userId, billingAlert.id);
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

  // ─── QR Code PIX (BR Code) ───
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [copiedBrcode, setCopiedBrcode] = useState(false);
  useEffect(() => {
    if (!billingAlert || !billingAlert.hasPix) { setPixQrDataUrl(null); return; }
    try {
      const brcode = buildPixBrCode({
        pixKey: billingAlert.pixKey,
        amount: Number(billingAlert.amount) > 0 ? Number(billingAlert.amount) : undefined,
        merchantName: billingAlert.pixHolderName,
        merchantCity: billingAlert.pixCity,
        txId: String(billingAlert.financeId).slice(0, 25),
      });
      QRCode.toDataURL(brcode, { margin: 1, width: 220, errorCorrectionLevel: "M" })
        .then((url) => setPixQrDataUrl(url))
        .catch(() => setPixQrDataUrl(null));
    } catch { setPixQrDataUrl(null); }
  }, [billingAlert]);
  const copyBrcode = () => {
    if (!billingAlert?.hasPix) return;
    const brcode = buildPixBrCode({
      pixKey: billingAlert.pixKey,
      amount: Number(billingAlert.amount) > 0 ? Number(billingAlert.amount) : undefined,
      merchantName: billingAlert.pixHolderName,
      merchantCity: billingAlert.pixCity,
      txId: String(billingAlert.financeId).slice(0, 25),
    });
    navigator.clipboard.writeText(brcode);
    setCopiedBrcode(true);
    setTimeout(() => setCopiedBrcode(false), 2000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!userId || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Módulos secundários (grid 2x2) ───
  const secondaryModules = [
    { title: "Suplementação", description: "Fármacos, vitaminas e horários.", icon: Pill, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", route: "/supplements" },
    { title: "Evolução", description: "Fotos, gráficos e progresso.", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", route: "/evolution" },
    { title: "Check-in", description: "Feedback periódico ao treinador.", icon: CheckCircle2, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", route: "/check-in" },
    { title: "Lista de Compras", description: "Compras agregadas e PDF.", icon: ShoppingCart, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20", route: "/shopping-list" },
  ];

  return (
    <div className="min-h-screen bg-background pb-12">

      {/* ── Header ── */}
      <header className="bg-card border-b border-border/50 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <InitialsAvatar name={profile?.full_name || "A"} />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">
                {greeting(firstName)}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <StreakBadge streak={streak} />
                {streak < 2 && (
                  <p className="text-xs text-muted-foreground">
                    {trainedToday ? "Treino feito hoje ✓" : "Nenhum treino hoje ainda"}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setShowProfile(true)} className="h-9">
              <User className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Perfil</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive h-9">
              <LogOut className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {userId && (
        <SimpleProfileDialog userId={userId} open={showProfile} onClose={() => setShowProfile(false)} />
      )}

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* Alertas */}
        {userId && (
          <FeedbackCountdownAlert
            userId={userId}
            dismissed={dismissedAlerts}
            onDismiss={dismissAlert}
          />
        )}
        <TrainerAlert />

        {protocolAlert && !dismissedAlerts.includes(protocolAlert.id) && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 relative shadow-sm">
            <button onClick={() => dismissAlert(protocolAlert.id)} className="absolute top-3 right-3 text-emerald-600 hover:text-emerald-700" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 w-full">
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-500">Protocolo Atualizado!</h3>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 pr-4">
                  Seu treinador atualizou seu protocolo em {new Date(protocolAlert.date).toLocaleDateString("pt-BR")}. Confira abaixo.
                </p>
              </div>
            </div>
          </div>
        )}

        {billingAlert && !dismissedAlerts.includes(billingAlert.id) && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 relative shadow-sm">
            <button onClick={() => dismissAlert(billingAlert.id)} className="absolute top-3 right-3 text-amber-600 hover:text-amber-700" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 w-full">
                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-500">
                  {billingAlert.diffDays < 0
                    ? `Mensalidade atrasada há ${Math.abs(billingAlert.diffDays)} dia(s)`
                    : billingAlert.diffDays === 0 ? "Mensalidade vence hoje!"
                    : `Mensalidade vence em ${billingAlert.diffDays} dias`}
                </h3>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                  Vencimento: {new Date(billingAlert.dueDate).toLocaleDateString("pt-BR")}
                  {billingAlert.amount > 0 && ` • R$ ${Number(billingAlert.amount).toFixed(2)}`}
                </p>
                <div className="mt-3 bg-background/50 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase text-amber-700/70 mb-1">Chave PIX do Treinador</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-background px-2 py-1.5 rounded text-foreground truncate">{billingAlert.pixKey}</code>
                    <Button size="sm" variant="outline" className="shrink-0 h-8 bg-background" onClick={() => copyPix(billingAlert.pixKey)}>
                      {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {pixQrDataUrl && (
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <div className="bg-white p-2 rounded-md">
                        <img src={pixQrDataUrl} alt="QR Code PIX" width={180} height={180} />
                      </div>
                      <p className="text-[10px] text-amber-700/70 text-center">Escaneie no app do seu banco</p>
                      <Button size="sm" variant="outline" className="h-7 bg-background text-[11px]" onClick={copyBrcode}>
                        {copiedBrcode ? <><Check className="w-3 h-3 text-emerald-500 mr-1" />Código copiado</> : <><Copy className="w-3 h-3 mr-1" />Copiar PIX Copia e Cola</>}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="pt-2">
                  <Button size="sm" onClick={dismissBillingAlert} disabled={notifyingCoach} className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8">
                    {notifyingCoach ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Enviando...</> : "Já efetuei o pagamento / Ocultar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* ── DESTAQUES: Dieta e Treino (full width) ── */}
        <div className="space-y-3">
          {/* Dieta */}
          <Card
            className="hover:shadow-md transition-all bg-card/60 border border-amber-500/20 cursor-pointer"
            onClick={() => navigate("/routine")}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Apple className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground">Dieta</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Plano alimentar, substituições e macros.</p>
                  {hasProtocol === false && (
                    <p className="text-[11px] text-muted-foreground/80 italic mt-1">Aguardando protocolo do seu coach.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Treino — com badge de status do dia */}
          <Card
            className="hover:shadow-md transition-all bg-card/60 border border-blue-500/20 cursor-pointer"
            onClick={() => navigate("/workout-plan")}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Dumbbell className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground">Treino</h3>
                    {trainedToday ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">
                        ✓ Feito hoje
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600">
                        Pendente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Séries, cadência e diretrizes biomecânicas.</p>
                  {hasProtocol === false && (
                    <p className="text-[11px] text-muted-foreground/80 italic mt-1">Aguardando protocolo do seu coach.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Módulos secundários ── */}
        <div className="grid grid-cols-2 gap-3">
          {secondaryModules.map((mod) => (
            <Card
              key={mod.title}
              className={`hover:shadow-md transition-all bg-card/60 border ${mod.border} cursor-pointer`}
              onClick={() => navigate(mod.route)}
            >
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${mod.bg}`}>
                  <mod.icon className={`w-5 h-5 ${mod.color}`} />
                </div>
                <h3 className="font-bold text-foreground text-sm">{mod.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>
                {(mod as any).showAnamnesisEdit && anamnesisMeta?.submitted_at && canEditAnamnesis && (
                  <button
                    className="mt-2 flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-500 transition-colors"
                    onClick={(e) => { e.stopPropagation(); navigate("/anamnesis?mode=edit"); }}
                  >
                    <FileEdit className="w-3 h-3" />
                    Editar anamnese ({2 - anamnesisEdits}x restante{2 - anamnesisEdits !== 1 ? "s" : ""})
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Card do coach ── */}
        {coachLink?.full_name && (
          <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">
                {coachLink.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Seu treinador</p>
              <p className="text-sm font-bold text-foreground truncate">{coachLink.full_name}</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
