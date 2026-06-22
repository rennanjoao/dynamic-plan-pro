import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageCircle, Send, Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { notifyCoach } from "@/lib/notifyCoach";

type Context = "exercise" | "meal" | "supplement" | "general";

interface Props {
  context: Context;
  itemRef?: string;
  studentName?: string;
  studentEmail?: string;
  variant?: "icon" | "button" | "full";
}

const contextLabels: Record<Context, string> = {
  exercise: "Treino / Exercício",
  meal: "Dieta / Refeição",
  supplement: "Suplementação",
  general: "Protocolo (Geral)",
};

export default function ProtocolQuestionButton({ context, itemRef, studentName, studentEmail, variant = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [coachData, setCoachData] = useState<{ id: string; email: string | null } | null>(null);
  // [FIX] Estado para guardar o nome e e-mail real do aluno logado,
  // evitando depender de props opcionais que os pais frequentemente esquecem de passar.
  const [resolvedStudent, setResolvedStudent] = useState<{ name: string; email: string | null }>({
    name: studentName || "Aluno",
    email: studentEmail || null,
  });

  useEffect(() => {
    if (!open || coachData) return;
    (async () => {
      try {
        // [FIX] Busca o usuário autenticado para obter o e-mail real
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // [FIX] Busca o perfil do aluno para obter o nome completo
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        // Monta o nome: prefere full_name do perfil, depois prop recebida, depois e-mail, depois "Aluno"
        const resolvedName =
          profile?.full_name?.trim() ||
          studentName?.trim() ||
          user.email?.split("@")[0] ||
          "Aluno";

        // Monta o e-mail: prefere auth.email (confiável), depois perfil, depois prop
        const resolvedEmail =
          user.email ||
          profile?.email ||
          studentEmail ||
          null;

        setResolvedStudent({ name: resolvedName, email: resolvedEmail });

        // Busca o coach vinculado ao aluno
        const { data: link } = await supabase
          .from("coach_students")
          .select("coach_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (link?.coach_id) {
          const { data: coachProfile } = await supabase
            .from("profiles")
            .select("notification_email, email")
            .eq("user_id", link.coach_id)
            .maybeSingle();
          setCoachData({
            id: link.coach_id,
            email: coachProfile?.notification_email || coachProfile?.email || null,
          });
        }
      } catch (e) {
        console.warn("Aviso: lookup de aluno/coach falhou.", e);
      }
    })();
  }, [open, coachData]);

  const send = async () => {
    if (!text.trim()) { toast.error("Escreva sua dúvida"); return; }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;

      if (coachData?.id) {
        // 1. INSERE NO BANCO (faz o painel do Coach apitar em tempo real)
        const { error: dbError } = await supabase.from("coach_notifications").insert({
          coach_id: coachData.id,
          student_id: uid,
          // [FIX] Usa o nome real resolvido, não mais o fallback genérico "Aluno"
          student_name: resolvedStudent.name,
          context: contextLabels[context],
          message: text.trim(),
        });
        if (dbError) throw dbError;

        // 2. DISPARA O EMAIL (Edge Function)
        if (coachData.email) {
          await notifyCoach({
            coachEmail: coachData.email,
            // [FIX] Passa nome e e-mail reais do aluno para o e-mail do coach
            studentName: resolvedStudent.name,
            studentEmail: resolvedStudent.email ?? undefined,
            kind: "question",
            subject: `Dúvida sobre ${contextLabels[context]} — ${resolvedStudent.name}`,
            summary: text.trim(),
            data: { contexto: contextLabels[context], item: itemRef || "—" },
          });
        }
      }

      toast.success("Dúvida enviada ao seu treinador!");

      // Aviso da IA
      setTimeout(() => {
        toast("A IA também pode te ajudar!", {
          description: "Use o botão de Chat para obter suporte sobre seu protocolo instantaneamente.",
          icon: <Bot className="w-5 h-5 text-primary" />,
          duration: 8000,
        });
      }, 1500);

      setText("");
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (variant === "full") {
    return (
      <>
        <Button variant="outline" className="w-full mt-4 border-dashed border-primary/50 text-primary hover:bg-primary/5" onClick={() => setOpen(true)}>
          <MessageCircle className="w-4 h-4 mr-2" /> Tenho uma dúvida sobre {contextLabels[context].toLowerCase()}
        </Button>
        <QuestionDialog open={open} setOpen={setOpen} text={text} setText={setText} send={send} sending={sending} context={context} />
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center p-2 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
        <MessageCircle className="w-4 h-4" />
      </button>
      <QuestionDialog open={open} setOpen={setOpen} text={text} setText={setText} send={send} sending={sending} context={context} />
    </>
  );
}

function QuestionDialog({ open, setOpen, text, setText, send, sending, context }: any) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Relatar Dúvida</DialogTitle>
          <DialogDescription className="text-xs">
            Sua dúvida sobre <strong>{contextLabels[context as Context]}</strong> será enviada para o painel do seu treinador.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Descreva sua dúvida detalhadamente..." className="min-h-[120px] text-sm" />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
          <Button size="sm" onClick={send} disabled={sending || !text.trim()}>{sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Enviar para o Coach</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
