/**
 * StudentArea.tsx — Hub Central do Aluno
 *
 * MELHORIAS v3 (Skeletons) + MODO ESPELHO (Impersonation):
 * - Removido o Loader2 blocking para profileLoading — agora exibe o shell
 *   completo imediatamente com skeletons nos spots que ainda carregam.
 * - Adicionado suporte ao "Modo Espelho": se a URL contiver ?previewAs=ID,
 *   a tela baixa os dados daquele aluno em vez dos dados do usuário logado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Apple, Dumbbell, Pill, TrendingUp, CheckCircle2,
  AlertCircle, Copy, Check, X, LogOut, Sparkles,
  ShoppingCart, FileEdit, Flame, User, Moon,
  ChevronDown, Heart, Eye,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SimpleProfileDialog } from "@/components/SimpleProfileDialog";
import { toast } from "sonner";
import FeedbackCountdownAlert from "@/components/student/FeedbackCountdownAlert";
import { TrainerAlert } from "@/components/student/TrainerAlert";
import CoachUpdatesCard from "@/components/student/CoachUpdatesCard";
import CoachUpdatesHistoryDialog from "@/components/student/CoachUpdatesHistoryDialog";
import StudentOnboardingCard from "@/components/student/StudentOnboardingCard";
import { useWakeLock } from "@/hooks/useWakeLock";
import { buildPixBrCode } from "@/lib/pixBrCode";
import { StudentPlanCard } from "@/components/student/StudentPlanCard";
import { usePartnerProfile } from "@/hooks/usePartnerships";
import QRCode from "qrcode";

// ─── localStorage helpers ───────────────────────────────────────────────────
const DISMISSED_KEY = (uid: string) => `dismissed_alerts_${uid}`;
function loadDismissed(uid: string): string[] {
  try { const r = localStorage.getItem(DISMISSED_KEY(uid)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveDismissed(uid: string, ids: string[]) {
  try { localStorage.setItem(DISMISSED_KEY(uid), JSON.stringify(ids)); } catch { /* noop */ }
}

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

function AlertSlot({
  hidden, onEmptyChange, children,
}: { hidden?: boolean; onEmptyChange: (empty: boolean) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => onEmptyChange(el.childElementCount === 0);
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  });
  return <div ref={ref} className={hidden ? "hidden" : undefined}>{children}</div>;
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

function CoachUpdatesHistoryLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex justify-end -mt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Ver histórico de atualizações
        </button>
      </div>
      <CoachUpdatesHistoryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1">
      <Flame className="w-3.5 h-3.5 text-orange-500" />
      <span className="text-xs font-bold text-orange-600">{streak} dias seguidos</span>
    </div>
  );
}

function calcStreak(logs: { completed_at: string | null }[]): number {
  if (!logs.length) return 0;
  const days = [...new Set(
    logs
      .filter((l) => l.completed_at)
      .map((l) => new Date(l.completed_at!).toISOString().slice(0, 10))
  )].sort().reverse();

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (days[0] !== today && days[0] !== yesterday) return 0;

  let streak = 0;
  let cursor = new Date(days[0]);
  for (const day of days) {
    const d    = new Date(day);
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000);
    if (diff > 1) break;
    streak++;
    cursor = d;
  }
  return streak;
}

// ─── Skeletons ───────────────────────────────────────────────────────────────
function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="space-y-1.5 min-w-0">
        <Skeleton className="h-4 w-36 rounded" />
        <Skeleton className="h-3 w-24 rounded" />
      </div>
    </div>
  );
}
function WorkoutBadgeSkeleton() { return <Skeleton className="h-4 w-20 rounded-full" />; }
function ProtocolHintSkeleton() { return <Skeleton className="h-3 w-40 rounded mt-1" />; }
function CoachCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function StudentArea() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");

  const [userId, setUserId] = useState<string | null>(null);
  const { data: partnerProfile } = usePartnerProfile(userId);
  useWakeLock();
  
  const [copiedPix, setCopiedPix] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [notifyingCoach, setNotifyingCoach] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ─── Auth / Impersonation Intercept ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        // Se houver "previewAs", injetamos esse ID em toda a aplicação
        const uid = previewAs || data.session.user.id;
        setUserId(uid);
        
        setDismissedAlerts(loadDismissed(uid));
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
  }, [navigate, previewAs]);

  // ─── Queries (Agora puxam do aluno se previewAs estiver ativo) ───
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["student-profile-hub", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
      return data;
    },
  });

  const { data: workoutLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["student-workout-logs", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("workout_progress")
        .select("completed_at, workout_id, completed")
        .eq("user_id", userId)
        .eq("completed", true)
        .order("completed_at", { ascending: false })
        .limit(60);
      return (data ?? []) as { completed_at: string | null; workout_id: string; completed: boolean }[];
    },
  });

  const { data: coachLink, isLoading: coachLoading } = useQuery({
    queryKey: ["student-coach-link", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data: link } = await supabase.from("coach_students").select("coach_id, warning_days, critical_days").eq("student_id", userId).eq("status", "active").maybeSingle();
      if (!link?.coach_id) return null;
      const { data: coach } = await supabase.from("profiles").select("full_name, pix_key, pix_holder_name, pix_city, billing_alert_days").eq("user_id", link.coach_id).maybeSingle();
      return coach ? { ...coach, coachId: link.coach_id, warningDays: link.warning_days, criticalDays: link.critical_days } : null;
    },
  });

  const { data: hasProtocol, isLoading: protocolLoading } = useQuery({
    queryKey: ["student-has-protocol", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await supabase.from("protocols").select("id").eq("student_id", userId).eq("is_template", false).eq("active", true).limit(1).maybeSingle();
      return !!data;
    },
  });

  const { data: todayPlan, isLoading: todayPlanLoading } = useQuery({
    queryKey: ["student-today-plan", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data } = await supabase.from("protocols").select("payload").eq("student_id", userId).eq("is_template", false).eq("active", true).limit(1).maybeSingle();
      const payload = (data?.payload as Record<string, unknown>) || null;
      if (!payload) return null;
      const weekDays = (payload.weekDays as Record<string, string>) || {};
      const workouts = (payload.workouts as Array<Record<string, unknown>>) || [];
      const WEEKDAYS_ORDER = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
      const todayKey = WEEKDAYS_ORDER[new Date().getDay()];
      const treinoKey = weekDays[todayKey];
      if (!treinoKey || treinoKey === "REST") return { tipo: "descanso" as const };
      const w = workouts.find((w) => String(w.key) === treinoKey);
      return { tipo: "treino" as const, letra: treinoKey, foco: (w?.focus as string) || null };
    },
  });

  const queryClientSA = useQueryClient();
  const todayKeyStr = new Date().toISOString().slice(0, 10);
  const { data: todayConfirmed } = useQuery({
    queryKey: ["student-today-session", userId, todayKeyStr],
    enabled: !!userId && todayPlan?.tipo === "treino",
    staleTime: 1000 * 60,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await (supabase as never as { from: (t: string) => any }).from("workout_sessions").select("id").eq("user_id", userId).gte("started_at", start.toISOString()).limit(1).maybeSingle();
      return !!data;
    },
  });

  const confirmWorkout = useMutation({
    mutationFn: async () => {
      if (!userId || todayPlan?.tipo !== "treino") return;
      const now = new Date().toISOString();
      const { error } = await (supabase as never as { from: (t: string) => any }).from("workout_sessions").insert({
        user_id: userId, workout_key: todayPlan.letra, workout_label: todayPlan.foco ?? null, started_at: now, ended_at: now, block_number: 1, is_deload_week: false, notes: "Confirmado manualmente pelo aluno",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Treino de hoje confirmado!");
      queryClientSA.invalidateQueries({ queryKey: ["student-today-session", userId, todayKeyStr] });
    },
  });

  const todayStrForNudge = new Date().toISOString().slice(0, 10);
  const { data: dailyNudge } = useQuery({
    queryKey: ["student-daily-nudge", userId, todayStrForNudge],
    enabled: !!userId && !previewAs, // Impede gerar nudge pra IA no modo espelho do coach
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("student-daily-nudge");
      if (error || !data?.ok) return null;
      return (data.message as string) || null;
    },
  });

  const { data: billingAlert } = useQuery({
    queryKey: ["student-billing-alert", userId],
    queryFn: async () => {
      if (!coachLink) return null;
      const { data: finance } = await supabase.from("coach_finances").select("*").eq("student_id", userId).eq("status", "pending").not("due_date", "is", null).order("due_date", { ascending: true }).limit(1).maybeSingle();
      if (!finance?.due_date || Number(finance.amount ?? 0) <= 0) return null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dueDate = new Date(finance.due_date); dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
      const alertThreshold = coachLink.billing_alert_days ?? 7;
      if (diffDays <= alertThreshold) {
        return {
          id: finance.id, financeId: finance.id, coachId: coachLink.coachId, amount: finance.amount, dueDate: finance.due_date, diffDays,
          pixKey: coachLink.pix_key || "Chave PIX não informada pelo treinador.",
          pixHolderName: (coachLink as any).pix_holder_name || coachLink.full_name || "RECEBEDOR",
          pixCity: (coachLink as any).pix_city || "BRASIL", hasPix: !!coachLink.pix_key,
        };
      }
      return null;
    },
    enabled: !!userId && !!coachLink,
  });

  const { data: anamnesisMeta } = useQuery({
    queryKey: ["student-anamnesis-meta", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("anamnesis").select("id, submitted_at, student_edit_count").eq("student_id", userId).maybeSingle();
      return data as { id: string; submitted_at: string | null; student_edit_count: number } | null;
    },
  });

  const { data: hasUnreadFeedback } = useQuery({
    queryKey: ["student-unread-coach-feedback", userId],
    enabled: !!userId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any).from("check_ins").select("coach_feedback, feedback_read_at").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return false;
      const fb = typeof data.coach_feedback === "string" ? data.coach_feedback.trim() : "";
      return !!fb && !data.feedback_read_at;
    },
  });

  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "Aluno";
  const anamnesisEdits = Number(anamnesisMeta?.student_edit_count ?? 0);
  const canEditAnamnesis = !!anamnesisMeta?.submitted_at && anamnesisEdits < 2;
  const [emptySlots, setEmptySlots] = useState<Record<string, boolean>>({});
  const [alertsExpanded, setAlertsExpanded] = useState(false);
  const markSlotEmpty = useCallback((key: string, empty: boolean) => {
    setEmptySlots((prev) => (prev[key] === empty ? prev : { ...prev, [key]: empty }));
  }, []);
  const streak = calcStreak(workoutLogs ?? []);
  const todayStr = new Date().toISOString().slice(0, 10);
  const trainedToday = (workoutLogs ?? []).some((l) => l.completed_at?.slice(0, 10) === todayStr);

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
        coach_id: billingAlert.coachId, student_id: userId, student_name: studentName, context: "Financeiro",
        message: `${studentName} ocultou o alerta de cobrança${amountStr} com vencimento em ${dueDateStr}. Verifique se o pagamento foi realizado.`,
      });
      dismissAlert(billingAlert.id);
      toast.success("Aviso ocultado. Seu treinador foi notificado.");
    } catch {
      dismissAlert(billingAlert.id);
      toast.success("Aviso ocultado.");
    } finally {
      setNotifyingCoach(false);
    }
  };

  const copyPix = (key: string) => { navigator.clipboard.writeText(key); setCopiedPix(true); setTimeout(() => setCopiedPix(false), 2000); };
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [copiedBrcode, setCopiedBrcode] = useState(false);
  
  useEffect(() => {
    if (!billingAlert || !billingAlert.hasPix) { setPixQrDataUrl(null); return; }
    try {
      const brcode = buildPixBrCode({
        pixKey: billingAlert.pixKey, amount: Number(billingAlert.amount) > 0 ? Number(billingAlert.amount) : undefined, merchantName: billingAlert.pixHolderName, merchantCity: billingAlert.pixCity, txId: String(billingAlert.financeId).slice(0, 25),
      });
      QRCode.toDataURL(brcode, { margin: 1, width: 220, errorCorrectionLevel: "M" }).then((url) => setPixQrDataUrl(url)).catch(() => setPixQrDataUrl(null));
    } catch { setPixQrDataUrl(null); }
  }, [billingAlert]);

  const copyBrcode = () => {
    if (!billingAlert?.hasPix) return;
    const brcode = buildPixBrCode({
      pixKey: billingAlert.pixKey, amount: Number(billingAlert.amount) > 0 ? Number(billingAlert.amount) : undefined, merchantName: billingAlert.pixHolderName, merchantCity: billingAlert.pixCity, txId: String(billingAlert.financeId).slice(0, 25),
    });
    navigator.clipboard.writeText(brcode); setCopiedBrcode(true); setTimeout(() => setCopiedBrcode(false), 2000);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-background pb-12">
        <header className="bg-card border-b border-border/50 sticky top-0 z-10 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <HeaderSkeleton />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  const secondaryModules = [
    { title: "Sono & Diretrizes", description: "Qualidade do sono e orientações do coach.",   icon: Pill,          color: "text-purple-500",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  route: `/supplements${previewAs ? `?previewAs=${previewAs}` : ''}`  },
    { title: "Evolução",       description: "Fotos, gráficos e progresso.",      icon: TrendingUp,    color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", route: `/evolution${previewAs ? `?previewAs=${previewAs}` : ''}`, showAnamnesisEdit: true },
    { title: "Check-in",       description: "Feedback periódico ao treinador.",  icon: CheckCircle2,  color: "text-rose-500",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    route: `/check-in${previewAs ? `?previewAs=${previewAs}` : ''}`     },
    { title: "Lista de Compras", description: "Compras agregadas e PDF.",        icon: ShoppingCart,  color: "text-orange-500",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  route: `/shopping-list${previewAs ? `?previewAs=${previewAs}` : ''}`},
  ];

  if (partnerProfile?.status === "active") {
    secondaryModules.push({
      title: "Parcerias", description: "Seus indicados e comissões.", icon: Heart,
      color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", route: "/parceria",
    });
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      
      {/* MODO ESPELHO (IMPERSONATION) BAR */}
      {previewAs && (
        <div className="bg-indigo-600/95 backdrop-blur shadow-md sticky top-0 z-50 text-white px-4 py-2.5 flex items-center justify-between border-b border-indigo-400/30">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium truncate">
              Visualizando como <strong className="font-bold">{profile?.full_name || "Aluno"}</strong>
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-3 text-[10px] sm:text-xs bg-white text-indigo-600 hover:bg-white/90 shrink-0 font-bold"
            onClick={() => window.close()} // Fecha a aba do modo espelho e volta pro painel
          >
            Sair do Preview
          </Button>
        </div>
      )}

      <StudentOnboardingCard userId={userId} />

      {/* ── Header ── */}
      <header className={`bg-card border-b border-border/50 shadow-sm ${!previewAs ? 'sticky top-0 z-10' : ''}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {profileLoading
              ? <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              : <InitialsAvatar name={profile?.full_name || "A"} />
            }
            <div className="min-w-0">
              {profileLoading ? (
                <Skeleton className="h-4 w-40 rounded mb-1.5" />
              ) : (
                <h1 className="text-base font-bold text-foreground truncate">
                  {greeting(firstName)}
                </h1>
              )}
              {logsLoading ? (
                <Skeleton className="h-3 w-24 rounded" />
              ) : (
                <div className="flex items-center gap-2 mt-0.5">
                  <StreakBadge streak={streak} />
                  {streak < 2 && (
                    <p className="text-xs text-muted-foreground">
                      {trainedToday ? "Treino feito hoje ✓" : "Nenhum treino hoje ainda"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => setShowProfile(true)} className="h-9">
              <User className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Perfil</span>
            </Button>
            {!previewAs && (
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive h-9">
                <LogOut className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {userId && (
        <SimpleProfileDialog userId={userId} open={showProfile} onClose={() => setShowProfile(false)} />
      )}

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {userId && (todayPlanLoading || todayPlan) && (
          <Card
            className={`border-primary/20 bg-primary/5 ${todayPlan?.tipo === "treino" ? "cursor-pointer hover:bg-primary/10 transition-colors" : ""}`}
            onClick={() => {
              if (todayPlan?.tipo === "treino") navigate(`/workout-plan?start=${encodeURIComponent(todayPlan.letra)}${previewAs ? `&previewAs=${previewAs}` : ''}`);
            }}
          >
            <CardContent className="p-4 flex items-start gap-3">
              {todayPlanLoading ? (
                <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              ) : todayPlan?.tipo === "treino" ? (
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Dumbbell className="w-4 h-4 text-primary" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {todayPlanLoading ? (
                  <Skeleton className="h-4 w-32 rounded" />
                ) : (
                  <p className="text-sm font-semibold text-foreground">
                    {todayPlan?.tipo === "treino"
                      ? `Hoje: Treino ${todayPlan.letra}${todayPlan.foco ? ` — ${todayPlan.foco}` : ""}`
                      : "Hoje: dia de descanso"}
                  </p>
                )}
                {dailyNudge && (
                  <p className="text-xs text-muted-foreground mt-1">{dailyNudge}</p>
                )}
                {todayPlan?.tipo === "treino" && (
                  todayConfirmed ? (
                    <p className="text-[11px] text-emerald-500 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Treino de hoje registrado
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-[11px]"
                      disabled={confirmWorkout.isPending || !!previewAs} // Desabilita no modo espelho
                      onClick={(e) => { e.stopPropagation(); confirmWorkout.mutate(); }}
                    >
                      Já treinei hoje (confirmar)
                    </Button>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Alertas (Omitido para não estender visualmente. Funciona igual antes) ── */}
        {(() => {
          const billingActive = !!billingAlert && !dismissedAlerts.includes(billingAlert.id);
          const billingNode = billingActive && billingAlert && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 relative shadow-sm">
            <button onClick={dismissBillingAlert} disabled={notifyingCoach || !!previewAs} className="absolute top-3 right-3 text-amber-600 hover:text-amber-700 disabled:opacity-50">
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
                <div className="pt-2">
                  <Button size="sm" onClick={dismissBillingAlert} disabled={notifyingCoach || !!previewAs} className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8">
                    Já efetuei o pagamento / Ocultar
                  </Button>
                </div>
              </div>
            </div>
            </div>
          );

          const slots = [
            { key: "billing",   node: billingNode || null, known: billingActive },
            { key: "trainer",   node: <TrainerAlert coachName={coachLink?.full_name} /> },
            { key: "countdown", node: userId ? <FeedbackCountdownAlert userId={userId} dismissed={dismissedAlerts} onDismiss={dismissAlert} warningDays={coachLink?.warningDays ?? undefined} criticalDays={coachLink?.criticalDays ?? undefined} /> : null },
            { key: "updates",   node: <CoachUpdatesCard /> },
          ];

          let activeIndex = -1;
          let hiddenCount = 0;
          const rendered = slots.map((s) => {
            if (!s.node) return null;
            const active = s.known !== undefined ? s.known : emptySlots[s.key] !== true;
            if (active) activeIndex += 1;
            const collapsed = active && !alertsExpanded && activeIndex >= 2;
            if (collapsed) hiddenCount += 1;
            return (
              <AlertSlot key={s.key} hidden={collapsed} onEmptyChange={(empty) => markSlotEmpty(s.key, empty)}>
                {s.node}
              </AlertSlot>
            );
          });

          return (
            <div className="space-y-4">
              {rendered}
              {(hiddenCount > 0 || alertsExpanded) && (
                <button type="button" onClick={() => setAlertsExpanded((v) => !v)} className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`w-3.5 h-3.5 ${alertsExpanded ? "rotate-180" : ""}`} />
                  {alertsExpanded ? "Mostrar menos" : `Você tem ${hiddenCount} atualizaç${hiddenCount === 1 ? "ão" : "ões"}`}
                </button>
              )}
              <CoachUpdatesHistoryLink />
            </div>
          );
        })()}

        <StudentPlanCard userId={userId} />

        <div className="space-y-3">
          <Card className="card-hover bg-card/60 border border-amber-500/20 cursor-pointer" onClick={() => navigate(`/routine${previewAs ? `?previewAs=${previewAs}` : ''}`)}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0"><Apple className="w-6 h-6 text-amber-500" /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground">Dieta</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Plano alimentar, substituições e macros.</p>
                {protocolLoading ? <ProtocolHintSkeleton /> : hasProtocol === false && <p className="text-[11px] text-muted-foreground/80 italic mt-1">Aguardando protocolo.</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover bg-card/60 border border-blue-500/20 cursor-pointer" onClick={() => navigate(`/workout-plan${previewAs ? `?previewAs=${previewAs}` : ''}`)}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><Dumbbell className="w-6 h-6 text-blue-500" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-foreground">Treino</h3>
                  {logsLoading ? <WorkoutBadgeSkeleton /> : trainedToday ? <Badge variant="success" className="text-[10px] px-2 py-0.5">✓ Feito hoje</Badge> : <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Pendente</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Séries, cadência e diretrizes biomecânicas.</p>
                {protocolLoading ? <ProtocolHintSkeleton /> : hasProtocol === false && <p className="text-[11px] text-muted-foreground/80 italic mt-1">Aguardando protocolo.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {secondaryModules.map((mod) => (
            <Card key={mod.title} className={`card-hover bg-card/60 border ${mod.border} cursor-pointer ${mod.title === "Evolução" && hasUnreadFeedback ? "animate-pulse ring-2 ring-emerald-500/40" : ""}`} onClick={() => navigate(mod.route)}>
              <CardContent className="p-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${mod.bg}`}>
                  <mod.icon className={`w-5 h-5 ${mod.color}`} />
                </div>
                <h3 className="font-bold text-foreground text-sm">{mod.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{mod.description}</p>
                {(mod as any).showAnamnesisEdit && anamnesisMeta?.submitted_at && canEditAnamnesis && (
                  <button className="mt-2 flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-500" onClick={(e) => { e.stopPropagation(); navigate(`/anamnesis?mode=edit${previewAs ? `&previewAs=${previewAs}` : ''}`); }}>
                    <FileEdit className="w-3 h-3" />
                    Editar anamnese ({2 - anamnesisEdits}x restante)
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {coachLoading ? <CoachCardSkeleton /> : coachLink?.full_name && (
          <div className="rounded-xl border border-border/50 bg-card/60 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{coachLink.full_name.substring(0,2).toUpperCase()}</span>
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
