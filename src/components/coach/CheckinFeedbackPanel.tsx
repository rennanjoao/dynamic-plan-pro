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

import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Send, ChevronDown, ChevronUp, FileDown, CheckSquare, Square, Sparkles, Pencil, History, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { exportCheckinPDF, exportCheckinsBatchPDF } from "@/lib/coachPdfExport";
import {
  CHECKIN_SECTIONS, CHECKIN_METRICS, CHECKIN_HIGHLIGHT_KEYS,
  colorForDelta, getMetricPolarity,
} from "@/lib/checkInSchema";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import type { Goal } from "@/utils/macros";
import CheckinPayloadAnswers from "@/components/coach/CheckinPayloadAnswers";
import CheckinFullEditor from "@/components/coach/CheckinFullEditor";
import { CheckinHistoryDialog } from "@/components/coach/dashboard/CheckinHistoryDialog";
import { AlertBadge, WeightTrendBadge } from "@/components/coach/dashboard/dashboardUtils";
import { Private } from "@/components/coach/PrivacyMode";

const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));

const CHECKIN_PDF_SECTIONS = CHECKIN_SECTIONS.map((s) => ({
  title: s.title,
  fields: (s.fields || []).map((f) => ({ key: f.key, label: f.label })),
}));

/** Rótulos humanos da triagem gerada por `protocol-renewal-draft`. */
const ADJUST_ACTION_LABEL: Record<string, string> = {
  nenhuma_alteracao: "Sem alteração no protocolo",
  orientar_coach: "Orientar o aluno",
  investigar_antes: "Investigar antes de ajustar",
  recomendar_exame: "Recomendar exame",
  reduzir_carga_treino: "Reduzir carga de treino",
  acompanhar_mais_um_ciclo: "Acompanhar mais um ciclo",
  ajustar: "Ajuste sugerido no protocolo",
};

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
  /** Objeto completo do aluno (novo). Se ausente, cai no par studentId/studentName por compatibilidade. */
  student?: StudentStatus | null;
  studentId?: string | null;
  studentName?: string;
  open: boolean;
  onClose: () => void;
}

export default function CheckinFeedbackPanel(props: Props) {
  const { open, onClose, student } = props;
  const studentId = student?.id ?? props.studentId ?? null;
  const studentName = student?.name ?? props.studentName ?? "Aluno";
  const [loading, setLoading] = useState(false);
  const [ci, setCi] = useState<CheckinRow | null>(null);
  const [history, setHistory] = useState<CheckinRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [showAnamnesis, setShowAnamnesis] = useState(false);
  const [insight, setInsight] = useState<{ changes?: string[]; hypotheses?: string[]; alerts?: string[] } | null>(null);
  const [adjustDraft, setAdjustDraft] = useState<{
    action: string;
    action_rationale: string | null;
    estrategia_identificada: string | null;
    resumo: string | null;
    sugestoes: Array<{ id: string; categoria: string; alvo: string; valorAtual?: string; valorSugerido: string; motivo: string }>;
  } | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [fullEditorOpen, setFullEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await sb
        .from("check_ins")
        .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false });
      if (cancelled) return;
      const rows = (data as CheckinRow[]) || [];
      setHistory(rows);
      setSelectedIds(new Set(rows.map((r) => r.id))); // por padrão, tudo selecionado (baixar todos de uma vez)
      const row = rows[0] || null;
      setCi(row);
      setFeedback(row?.coach_feedback ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, studentId]);

  useEffect(() => {
    if (!open) {
      setShowAnamnesis(false);
    }
  }, [open]);

  useEffect(() => {
    if (!ci?.id) { setInsight(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from("checkin_ai_insights")
        .select("summary")
        .eq("check_in_id", ci.id)
        .maybeSingle();
      if (!cancelled) setInsight(data?.summary ?? null);
    })();
    return () => { cancelled = true; };
  }, [ci?.id]);

  useEffect(() => {
    if (!ci?.id) { setAdjustDraft(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await sb
        .from("checkin_ai_adjustment_draft")
        .select("action, action_rationale, estrategia_identificada, resumo, sugestoes")
        .eq("check_in_id", ci.id)
        .maybeSingle();
      if (!cancelled) setAdjustDraft(data ?? null);
    })();
    return () => { cancelled = true; };
  }, [ci?.id]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const fotos = ((ci?.payload as Record<string, unknown> | null)?.fotos as Record<string, string> | undefined) || {};

  // Deltas por métrica vs check-in imediatamente anterior (posição 1 no history)
  const previous = history[1] || null;
  const metricDeltas = useMemo(() => {
    const cur = (ci?.current_metrics || {}) as Record<string, unknown>;
    const prev = (previous?.current_metrics || {}) as Record<string, unknown>;
    return CHECKIN_METRICS.map((m) => {
      const cv = typeof cur[m.key] === "number" ? (cur[m.key] as number) : Number(cur[m.key]);
      const pv = typeof prev[m.key] === "number" ? (prev[m.key] as number) : Number(prev[m.key]);
      const hasCur = !isNaN(cv);
      const hasPrev = !isNaN(pv);
      return {
        key: m.key,
        label: m.label,
        unit: m.unit,
        value: hasCur ? cv : null,
        delta: hasCur && hasPrev ? cv - pv : null,
      };
    }).filter((x) => x.value !== null);
  }, [ci, previous]);

  const goal = (student?.goal as Goal) || "manter";
  const polarity = ["emagrecer", "manter", "hipertrofia", "recomposicao"].includes(goal)
    ? getMetricPolarity(goal)
    : "menor_melhor";

  const highlightChips = useMemo(() => {
    const p = (ci?.payload || {}) as Record<string, unknown>;
    const labelMap: Record<string, string> = {};
    for (const sec of CHECKIN_SECTIONS) {
      for (const f of sec.fields) labelMap[f.key] = f.label;
    }
    return CHECKIN_HIGHLIGHT_KEYS
      .map((k) => ({ key: k, label: labelMap[k] || k, value: p[k] }))
      .filter((c) => c.value !== undefined && c.value !== null && c.value !== "");
  }, [ci]);

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

  const handleGenerateDraft = async () => {
    if (!ci?.id) return;
    setGeneratingDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("checkin-feedback-draft", {
        body: { checkInId: ci.id },
      });
      if (error) throw error;
      const draft = (data as { draft?: string })?.draft;
      if (draft) setFeedback(draft);
      else toast.error("Não foi possível gerar o rascunho.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar rascunho.");
    } finally {
      setGeneratingDraft(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = history.length > 0 && selectedIds.size === history.length;
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(history.map((r) => r.id)));
  };

  const handleDownloadSelected = () => {
    const selected = history.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) {
      toast.error("Selecione ao menos um feedback para baixar.");
      return;
    }
    if (selected.length === 1) {
      const c = selected[0];
      exportCheckinPDF({
        studentName,
        submittedAt: c.submitted_at,
        currentMetrics: c.current_metrics,
        payload: c.payload,
        coachFeedback: c.coach_feedback,
        sections: CHECKIN_PDF_SECTIONS,
      });
      return;
    }
    exportCheckinsBatchPDF({
      studentName,
      checkins: selected.map((c) => ({
        submitted_at: c.submitted_at,
        current_metrics: c.current_metrics,
        payload: c.payload,
        coach_feedback: c.coach_feedback,
      })),
      sections: CHECKIN_PDF_SECTIONS,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumo do Check-in — <Private>{studentName}</Private></DialogTitle>
        </DialogHeader>

        {student && (
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
            {student.goal && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted/40 text-foreground border-border uppercase tracking-wider">
                {student.goal}
              </span>
            )}
            <AlertBadge
              level={student.alertLevel}
              daysSinceLastFeedback={student.daysSinceLastFeedback}
              warningDays={student.warningDays}
              criticalDays={student.criticalDays}
              lastFeedback={student.lastFeedback}
            />
            <WeightTrendBadge student={student} />
            <span className="text-[10px] text-muted-foreground ml-auto">
              {student.daysSinceLastFeedback >= 999
                ? "Sem check-in ainda"
                : `Último check-in há ${student.daysSinceLastFeedback} dia${student.daysSinceLastFeedback === 1 ? "" : "s"}`}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Alerta determinístico do aluno — não depende do resumo de IA (que é
               best-effort e pode falhar/atrasar). Vem do campo "atencao_urgente"
               do Check-in (seção Identificação). */}
            {(ci?.payload as Record<string, unknown> | null)?.atencao_urgente === "Sim" && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                <span>⚠️ O aluno sinalizou que precisa de atenção prioritária nesta quinzena.</span>
              </div>
            )}

            {/* Insight de IA — movido para o topo */}
            {insight && ((insight.changes?.length ?? 0) > 0 || (insight.hypotheses?.length ?? 0) > 0 || (insight.alerts?.length ?? 0) > 0) && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Resumo automático (IA) — o que mudou
                </label>
                {(insight.changes?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Mudanças</p>
                    <ul className="list-disc pl-4 text-xs space-y-0.5">
                      {insight.changes!.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {(insight.hypotheses?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Hipóteses</p>
                    <ul className="list-disc pl-4 text-xs space-y-0.5">
                      {insight.hypotheses!.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {(insight.alerts?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-amber-600 uppercase mb-1">Alertas</p>
                    <ul className="list-disc pl-4 text-xs space-y-0.5 text-amber-700">
                      {insight.alerts!.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Chips de aderência a partir de CHECKIN_HIGHLIGHT_KEYS */}
            {adjustDraft && (
              <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Triagem da IA — {ADJUST_ACTION_LABEL[adjustDraft.action] ?? adjustDraft.action}
                  </span>
                </div>
                {adjustDraft.action_rationale && (
                  <p className="text-xs text-foreground/90">{adjustDraft.action_rationale}</p>
                )}
                {adjustDraft.estrategia_identificada && (
                  <p className="text-[11px] text-muted-foreground">
                    Estratégia respeitada: {adjustDraft.estrategia_identificada}
                  </p>
                )}
                {(adjustDraft.sugestoes?.length ?? 0) > 0 ? (
                  <ul className="list-disc pl-4 text-xs space-y-0.5">
                    {adjustDraft.sugestoes.map((s) => (
                      <li key={s.id}>
                        <span className="font-medium">{s.alvo}</span>
                        {s.valorAtual ? ` — ${s.valorAtual} → ${s.valorSugerido}` : ` — ${s.valorSugerido}`}
                        <span className="text-muted-foreground"> · {s.motivo}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Nenhum ajuste de protocolo sugerido para este check-in.</p>
                )}
                {(adjustDraft.sugestoes?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Abra o editor de protocolo do aluno e use “Renovar ciclo (IA)” para revisar e aplicar.
                  </p>
                )}
              </div>
            )}

            {highlightChips.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Aderência</p>
                <div className="flex flex-wrap gap-1.5">
                  {highlightChips.map((c) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-border bg-muted/40"
                    >
                      <span className="text-muted-foreground">{c.label}:</span>
                      <span className="font-semibold text-foreground">{String(c.value)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                          <PrivateImg src={fotos[k]} alt={k} className="w-full h-full object-cover" />
                        </div>
                      ) : null
                    )}
                  </div>
                )}

                {metricDeltas.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    {metricDeltas.map((m) => {
                      const cls = colorForDelta(m.delta, polarity);
                      return (
                        <div key={m.key} className="flex justify-between items-center text-xs py-0.5">
                          <span className="text-muted-foreground">{m.label}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{m.value} {m.unit}</span>
                            {m.delta != null && (
                              <span className={`font-semibold tabular-nums ${cls}`}>
                                ({m.delta > 0 ? "+" : ""}{m.delta.toFixed(1)})
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Respostas completas por seção (fotos ficam de fora — já exibidas acima) */}
                <CheckinPayloadAnswers payload={ci.payload} showPhotos={false} />
              </>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap gap-2 mb-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setFullEditorOpen(true)} disabled={!studentId}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar completo
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)} disabled={!studentId}>
                  <History className="w-3.5 h-3.5 mr-1.5" /> Ver histórico antigo
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Feedback do Coach
                </label>
                <Button
                  type="button"
                  onClick={handleGenerateDraft}
                  variant="outline"
                  size="sm"
                  disabled={!ci || generatingDraft || sending}
                >
                  {generatingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Gerar rascunho
                </Button>
              </div>
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

            {history.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                    Histórico de feedbacks ({history.length})
                  </label>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                  {history.map((row) => (
                    <label
                      key={row.id}
                      className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                        className="accent-primary"
                      />
                      <span className="flex-1">{fmtDate(row.submitted_at)}</span>
                      <span className={row.coach_feedback ? "text-emerald-600" : "text-muted-foreground"}>
                        {row.coach_feedback ? "com feedback" : "sem feedback"}
                      </span>
                    </label>
                  ))}
                </div>

                <Button
                  onClick={handleDownloadSelected}
                  disabled={selectedIds.size === 0}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Baixar selecionados ({selectedIds.size})
                </Button>
              </div>
            )}

            <Collapsible open={showAnamnesis} onOpenChange={setShowAnamnesis}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    Anamnese
                  </span>
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

        {studentId && fullEditorOpen && (
          <CheckinFullEditor
            open={fullEditorOpen}
            onOpenChange={setFullEditorOpen}
            studentId={studentId}
          />
        )}
        {studentId && historyOpen && (
          <CheckinHistoryDialog
            student={student ?? { id: studentId, name: studentName } as StudentStatus}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
