import { lazyWithRetry } from "@/lib/lazyWithRetry";
/**
 * CheckinFeedbackPanel.tsx — Painel unificado de feedback do coach.
 *
 * Em tela larga, duas colunas (cada uma rola sozinha):
 *  - esquerda: EVIDÊNCIA — fotos do check-in anterior ao lado das atuais,
 *    variação das medidas e gráfico de evolução;
 *  - direita: CONTEXTO — alertas, resumo de IA, aderência, respostas do aluno
 *    e anamnese, com o campo de feedback sempre fixo embaixo.
 * Em tela estreita, tudo empilha numa coluna só.
 *
 * Ao enviar, salva em check_ins.coach_feedback E dispara o Edge Function
 * reply-to-student (mesma lógica de antes). O histórico completo e a exportação
 * em PDF ficam no CheckinHistoryDialog (botão "Histórico").
 *
 * Não altera RLS, schema ou comportamento do reply-to-student.
 */

import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Loader2, Send, ChevronDown, ChevronUp, Sparkles, Pencil, History, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  CHECKIN_SECTIONS, CHECKIN_METRICS, CHECKIN_HIGHLIGHT_KEYS,
  colorForDelta, weightPolarityForGoal,
} from "@/lib/checkInSchema";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import CheckinPayloadAnswers from "@/components/coach/CheckinPayloadAnswers";
import CheckinFullEditor from "@/components/coach/CheckinFullEditor";
import { CheckinHistoryDialog } from "@/components/coach/dashboard/CheckinHistoryDialog";
import { AlertBadge, WeightTrendBadge } from "@/components/coach/dashboard/dashboardUtils";
import { Private, PrivateImg } from "@/components/coach/PrivacyMode";
import { triageClasses, triageLabel } from "@/lib/protocolRenewalTriage";
import { resolveCheckinPhotos } from "@/lib/photoAnnotations";
import CheckinPhotoCompare from "@/components/coach/CheckinPhotoCompare";
import { cn } from "@/lib/utils";

const AnamnesisViewerLazy = lazyWithRetry(() => import("@/components/anamnesis/AnamnesisViewer"));
const ProgressChartLazy = lazyWithRetry(() =>
  import("@/components/student/ProgressChart").then((m) => ({ default: m.ProgressChart })),
);

const CHECKIN_COLUMNS = "id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at";

interface CheckinRow {
  id: string;
  submitted_at: string;
  current_metrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  coach_feedback: string | null;
  photo_url: string | null;
  feedback_read_at: string | null;
}

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
  // Check-in imediatamente ANTERIOR ao que está aberto (base das variações e das fotos "anterior").
  const [previous, setPrevious] = useState<CheckinRow | null>(null);
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
  const [allCheckins, setAllCheckins] = useState<{ id: string; submitted_at: string; coach_feedback: string | null }[]>([]);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await sb
        .from("check_ins")
        .select(CHECKIN_COLUMNS)
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = ((data as CheckinRow[]) || [])[0] || null;
      setCi(row);
      setFeedback(row?.coach_feedback ?? "");
      setLoading(false);
      const { data: listData } = await sb
        .from("check_ins")
        .select("id, submitted_at, coach_feedback")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(60);
      if (!cancelled) setAllCheckins((listData as { id: string; submitted_at: string; coach_feedback: string | null }[]) || []);
    })();
    return () => { cancelled = true; };
  }, [open, studentId]);

  // Busca o check-in imediatamente anterior ao que está aberto. Acompanha a troca
  // pelo seletor: assim as variações e as fotos "anterior" sempre comparam com o
  // check-in certo (e não com o 2º mais recente, como antes).
  useEffect(() => {
    if (!open || !studentId || !ci?.submitted_at) { setPrevious(null); return; }
    let cancelled = false;
    setPrevious(null);
    (async () => {
      const { data } = await sb
        .from("check_ins")
        .select(CHECKIN_COLUMNS)
        .eq("student_id", studentId)
        .lt("submitted_at", ci.submitted_at)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setPrevious((data as CheckinRow) ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, studentId, ci?.id, ci?.submitted_at]);

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

  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Mesma regra do EvolutionComparison: inclui o formato antigo (photo_url).
  const currentPhotos = useMemo(() => resolveCheckinPhotos(ci?.payload, ci?.photo_url), [ci]);
  const previousPhotos = useMemo(() => resolveCheckinPhotos(previous?.payload, previous?.photo_url), [previous]);

  const isEditingExisting = !!(ci?.coach_feedback && ci.coach_feedback.trim());

  const selectCheckin = async (id: string) => {
    if (!id || id === ci?.id) return;
    const { data } = await sb
      .from("check_ins")
      .select(CHECKIN_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (!data) return;
    setCi(data as CheckinRow);
    setFeedback((data as CheckinRow).coach_feedback ?? "");
  };

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
    const isEdit = !!(ci.coach_feedback && ci.coach_feedback.trim());
    try {
      const { error: updErr } = await sb
        .from("check_ins")
        .update({ coach_feedback: msg })
        .eq("id", ci.id);
      if (updErr) throw new Error(`Falha ao salvar feedback: ${updErr.message}`);
      savedOk = true;

      // Edição de um feedback já enviado: o aluno NÃO recebe nova notificação
      // (nem e-mail, nem alerta) — apenas o texto é atualizado silenciosamente.
      if (isEdit) {
        toast.success("Feedback atualizado (sem novo aviso ao aluno).");
        setCi((prev) => prev ? { ...prev, coach_feedback: msg } : prev);
        setAllCheckins((prev) => prev.map((r) => r.id === ci.id ? { ...r, coach_feedback: msg } : r));
        return;
      }

      const { error: fnErr } = await supabase.functions.invoke("reply-to-student", {
        body: { studentId, message: msg, context: "Check-in" },
      });
      if (fnErr) throw new Error(`Feedback salvo, mas o envio ao aluno falhou: ${fnErr.message}`);
      notifiedOk = true;

      toast.success("Feedback salvo e enviado ao aluno.");
      setCi((prev) => prev ? { ...prev, coach_feedback: msg } : prev);
      setAllCheckins((prev) => prev.map((r) => r.id === ci.id ? { ...r, coach_feedback: msg } : r));
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[92vh] overflow-y-auto flex flex-col lg:overflow-hidden",
          ci ? "max-w-6xl" : "max-w-2xl",
        )}
      >
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
          <div className={cn("grid gap-4 lg:min-h-0 lg:flex-1", ci && "lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]")}>
            {/* ── Coluna esquerda: EVIDÊNCIA (fotos anterior × atual, variação, gráfico) ── */}
            {ci && (
              <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                <p className="text-xs text-muted-foreground">Check-in: {fmtDate(ci.submitted_at)}</p>

                <CheckinPhotoCompare
                  current={currentPhotos}
                  previous={previousPhotos}
                  currentLabel={fmtShortDate(ci.submitted_at)}
                  previousLabel={previous ? fmtShortDate(previous.submitted_at) : null}
                />

                {metricDeltas.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    {previous && (
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
                        Variação vs check-in de {fmtShortDate(previous.submitted_at)}
                      </p>
                    )}
                    {metricDeltas.map((m) => {
                      const cls = colorForDelta(m.delta, m.key === "peso" ? weightPolarityForGoal(student?.goal) : undefined);
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

                {studentId && (
                  <Suspense fallback={
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  }>
                    <ProgressChartLazy studentId={studentId} />
                  </Suspense>
                )}
              </div>
            )}

            {/* ── Coluna direita: CONTEXTO (rola) + FEEDBACK (fixo embaixo) ── */}
            <div className="flex flex-col gap-4 lg:min-h-0">
              <div className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
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
                  <div className={`space-y-2 rounded-lg border p-3 ${triageClasses(adjustDraft.action).box}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className={`w-3.5 h-3.5 ${triageClasses(adjustDraft.action).text}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wider ${triageClasses(adjustDraft.action).text}`}>
                        Triagem da IA — {triageLabel(adjustDraft.action)}
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
                  /* Respostas completas por seção (fotos ficam de fora — já exibidas ao lado) */
                  <CheckinPayloadAnswers payload={ci.payload} showPhotos={false} />
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
                        <AnamnesisViewerLazy studentId={studentId} studentName={studentName} showProgressChart={false} />
                      </Suspense>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              <div className="space-y-2 border-t border-border pt-3 shrink-0">
                <div className="flex flex-wrap gap-2 mb-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setFullEditorOpen(true)} disabled={!studentId}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar completo
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen(true)} disabled={!studentId}>
                    <History className="w-3.5 h-3.5 mr-1.5" /> Histórico
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                    {isEditingExisting ? "Editar feedback" : "Orientação Técnica"}
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
                {allCheckins.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground shrink-0">Check-in:</span>
                    <select
                      value={ci?.id ?? ""}
                      onChange={(e) => selectCheckin(e.target.value)}
                      className="flex-1 text-base md:text-xs rounded-md border border-border bg-background px-2 py-1.5"
                      disabled={sending}
                    >
                      {allCheckins.map((c) => (
                        <option key={c.id} value={c.id}>
                          {fmtDate(c.submitted_at)} {c.coach_feedback ? "· com feedback" : "· sem feedback"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={isEditingExisting
                    ? "Edite o feedback já enviado. O aluno não recebe novo aviso."
                    : "Escreva aqui o feedback que será salvo no check-in e enviado ao aluno…"}
                  rows={5}
                  className="text-sm"
                  disabled={sending || !ci}
                />
                {isEditingExisting && (
                  <p className="text-[11px] text-muted-foreground">
                    Este check-in já tem feedback: salvar apenas atualiza o texto, sem notificar o aluno novamente.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={sending || !ci} size="sm">
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {isEditingExisting ? "Salvar alterações" : "Enviar feedback"}
                  </Button>
                </div>
              </div>
            </div>
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
