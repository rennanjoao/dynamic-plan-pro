/**
 * CheckinFeedbackPanel.tsx — Painel unificado de feedback do coach.
 *
 * NÍVEL 1: exibe o check-in mais recente do aluno + Textarea para escrever
 * o feedback. Ao enviar, salva em check_ins.coach_feedback E dispara o
 * Edge Function reply-to-student (mesma lógica usada hoje).
 *
 * NÍVEL 2 (Collapsible): renderiza o AnamnesisViewer existente.
 *
 * Não altera RLS, schema ou comportamento do reply-to-student.
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Send, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));

interface CheckinRow {
  id: string;
  submitted_at: string;
  current_metrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  coach_feedback: string | null;
  photo_url: string | null;
  feedback_read_at: string | null;
}

const sb: any = supabase;

interface Props {
  studentId: string | null;
  studentName: string;
  open: boolean;
  onClose: () => void;
}

export default function CheckinFeedbackPanel({ studentId, studentName, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [ci, setCi] = useState<CheckinRow | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [showAnamnesis, setShowAnamnesis] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await sb
        .from("check_ins")
        .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = (data as CheckinRow) || null;
      setCi(row);
      setFeedback(row?.coach_feedback ?? "");
      if (row?.id && !row.feedback_read_at) {
        sb.from("check_ins")
          .update({ feedback_read_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => {});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, studentId]);

  useEffect(() => {
    if (!open) {
      setShowAnamnesis(false);
    }
  }, [open]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const fotos = ((ci?.payload as Record<string, unknown> | null)?.fotos as Record<string, string> | undefined) || {};

  const handleSend = async () => {
    if (!studentId) return;
    const msg = feedback.trim();
    if (!msg) {
      toast.error("Escreva o feedback antes de enviar.");
      return;
    }
    if (!ci?.id) {
      toast.error("Nenhum check-in encontrado para salvar o feedback.");
      return;
    }
    setSending(true);
    let savedOk = false;
    let notifiedOk = false;
    try {
      const { error: updErr } = await sb
        .from("check_ins")
        .update({ coach_feedback: msg })
        .eq("id", ci.id);
      if (updErr) throw new Error(`Falha ao salvar feedback: ${updErr.message}`);
      savedOk = true;

      const { error: fnErr } = await supabase.functions.invoke("reply-to-student", {
        body: { studentId, message: msg },
      });
      if (fnErr) throw new Error(`Feedback salvo, mas o envio ao aluno falhou: ${fnErr.message}`);
      notifiedOk = true;

      toast.success("Feedback salvo e enviado ao aluno.");
      setCi((prev) => prev ? { ...prev, coach_feedback: msg } : prev);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado.";
      if (savedOk && !notifiedOk) {
        toast.error(message);
      } else if (!savedOk) {
        toast.error(message);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Feedback — {studentName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {!ci ? (
              <p className="text-sm text-muted-foreground italic text-center py-6">
                Sem check-in registrado ainda.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Check-in: {fmtDate(ci.submitted_at)}</p>

                {Object.keys(fotos).length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {(["frente","lateral_dir","lateral_esq","costas"] as const).map((k) =>
                      fotos[k] ? (
                        <div key={k} className="aspect-[3/4] rounded-md overflow-hidden border border-border/50">
                          <img src={fotos[k]} alt={k} className="w-full h-full object-cover" />
                        </div>
                      ) : null
                    )}
                  </div>
                )}

                {ci.current_metrics && Object.keys(ci.current_metrics).length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    {Object.entries(ci.current_metrics).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-0.5">
                        <span className="text-muted-foreground capitalize">{k}</span>
                        <span className="font-medium text-right max-w-[60%]">
                          {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                Feedback do Coach
              </label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Escreva aqui o feedback que será salvo no check-in e enviado ao aluno…"
                rows={6}
                className="text-sm"
                disabled={sending || !ci}
              />
              <div className="flex justify-end">
                <Button onClick={handleSend} disabled={sending || !ci} size="sm">
                  {sending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Enviar feedback
                </Button>
              </div>
            </div>

            <Collapsible open={showAnamnesis} onOpenChange={setShowAnamnesis}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span>Ver anamnese completa e histórico</span>
                  {showAnamnesis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                {showAnamnesis && studentId && (
                  <Suspense fallback={
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  }>
                    <AnamnesisViewerLazy studentId={studentId} studentName={studentName} />
                  </Suspense>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}