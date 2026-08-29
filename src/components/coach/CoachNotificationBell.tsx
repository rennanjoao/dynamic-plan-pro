import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Trash2, Check, Loader2, Inbox, Reply, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Private, usePrivacyMode } from "@/components/coach/PrivacyMode";

interface Notification {
  id: string;
  coach_id: string;
  student_id: string | null;
  student_name: string;
  context: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function contextBadgeColor(ctx: string) {
  const c = ctx.toLowerCase();
  if (c.includes("treino") || c.includes("exerc")) return "bg-blue-500/15 text-blue-600 border-blue-500/30";
  if (c.includes("dieta") || c.includes("refeição") || c.includes("meal")) return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  if (c.includes("supl")) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function CoachNotificationBell() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const { privacy } = usePrivacyMode();
  const privacyRef = useRef(privacy);
  useEffect(() => { privacyRef.current = privacy; }, [privacy]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setCoachId(data.session.user.id);
        fetchNotifications(data.session.user.id);
      }
    });
  }, []);

  const fetchNotifications = async (uid: string) => {
    setLoading(true);
    const notifRes = await supabase
      .from("coach_notifications")
      .select("*")
      .eq("coach_id", uid)
      .eq("is_read", false)
      .order("created_at", { ascending: false });
    if (!notifRes.error && notifRes.data) setNotifications(notifRes.data as Notification[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!coachId) return;

    // Único canal Realtime: coach_notifications já é a fonte persistente de
    // todo alerta (anamnese, check-in ou dúvida) — notify-coach grava ali
    // para qualquer um dos três. Não assinamos mais um canal separado em
    // check_ins: ele emitia um segundo toast para o mesmo check-in (o
    // "recebido em ...") sempre que este canal também disparava o dele,
    // e exigia buscar a carteira de alunos só para escopar aquele filtro.
    const channel = supabase
      .channel(`coach-notifications-realtime-${coachId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coach_notifications", filter: `coach_id=eq.${coachId}` },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications((prev) => [n, ...prev]);
          const who = privacyRef.current ? "Aluno" : n.student_name;
          const title =
            n.context === "Anamnese" ? `📋 ${who} enviou uma anamnese`
            : n.context === "Check-in" ? `✅ ${who} enviou um check-in`
            : `Nova dúvida de ${who}`;
          toast(title, {
            description: privacyRef.current
              ? `${n.context}: mensagem oculta (Modo Privacidade)`
              : `${n.context}: "${n.message.substring(0, 60)}${n.message.length > 60 ? "…" : ""}"`,
            icon: <Bell className="w-4 h-4 text-primary" />,
            duration: 6000,
            action: { label: "Ver", onClick: () => setOpen(true) },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [coachId]);

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("coach_notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) { toast.error("Falha ao marcar como lida"); return; }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("coach_notifications")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Falha ao excluir"); return; }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const sendReply = async (n: Notification) => {
    if (!replyText.trim()) { toast.error("Escreva uma resposta"); return; }
    if (!n.student_id) { toast.error("Aluno não identificado"); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("reply-to-student", {
        body: {
          studentId: n.student_id,
          message: replyText.trim(),
          notificationId: n.id,
          context: n.context,
          originalMessage: n.message,
        },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; emailOk?: boolean; hasEmail?: boolean };
      if (res?.ok) {
        toast.success(
          res.hasEmail && res.emailOk
            ? "Resposta enviada por e-mail e como alerta!"
            : "Resposta enviada como alerta ao aluno"
        );
        setNotifications((prev) => prev.filter((x) => x.id !== n.id));
        setReplyOpen(null);
        setReplyText("");
      } else {
        toast.error("Falha ao enviar resposta");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar resposta");
    } finally {
      setSending(false);
    }
  };

  const unreadCount = notifications.length;
  const totalBadge = unreadCount;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="relative p-2 cursor-pointer hover:bg-muted rounded-full transition-colors"
          aria-label="Alertas de alunos"
        >
          <Bell className="w-5 h-5 text-foreground" />
          {totalBadge > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full border-2 border-background">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" /> Alertas de Alunos
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum alerta pendente
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <Private className="font-semibold text-sm text-foreground truncate">{n.student_name}</Private>
                  <Badge variant="outline" className={`text-[10px] ${contextBadgeColor(n.context)}`}>
                    {n.context}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{fmtWhen(n.created_at)}</p>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{n.message}</p>
                {replyOpen === n.id && (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escreva sua resposta ao aluno..."
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setReplyOpen(null); setReplyText(""); }} disabled={sending}>
                        Cancelar
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => sendReply(n)} disabled={sending || !replyText.trim()}>
                        {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                        Enviar resposta
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  {replyOpen !== n.id && (
                    <Button size="sm" variant="outline" onClick={() => { setReplyOpen(n.id); setReplyText(""); }} className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10">
                      <Reply className="w-3.5 h-3.5 mr-1" /> Responder
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(n.id)} className="h-7 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => markRead(n.id)} className="h-7 text-xs">
                    <Check className="w-3.5 h-3.5 mr-1" /> Marcar como lida
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
