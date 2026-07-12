/**
 * CoachDashboard.tsx — Painel completo do Coach
 *
 * CORREÇÕES APLICADAS:
 * [FIX] StudentRow: exibe "Feedback há X dias" no card do aluno
 * [FIX] ProfileDialog: campo "Dias para feedback" salvo em feedback_interval_days
 * [FIX] useCoachStudents: recebe feedbackIntervalDays dinâmico do perfil
 * [FIX] billingAlertDays: agora editável e salvo corretamente no perfil
 * [FIX] Alerta de pagamento: billingAlertDays lido do perfil do coach corretamente
 * [REFACTOR] Remoção de botões e vistas redundantes (QuickAnamnesis removido).
 * [REFACTOR] Botão de Anamnese agora abre o EvolutionDialog diretamente.
 */

import { useState, useRef, lazy, Suspense, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCoachStudentsPaged, useCoachStudentsLite, type StudentStatus, type AlertLevel, type StudentLite } from "@/hooks/useCoachStudents";
import { useCoachFinances } from "@/hooks/useCoachFinances";
import {
  AlertTriangle, CheckCircle2, Search, Filter, Users,
  Dumbbell, ClipboardList, ArrowLeft,
  Loader2, Plus, Trash2, DollarSign, Calendar, X, User, LogOut,
  MessageSquare, History, FileDown, Settings2, Activity, Sparkles
} from "lucide-react";
import CoachNotificationBell from "@/components/coach/CoachNotificationBell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CheckinPayloadAnswers from "@/components/coach/CheckinPayloadAnswers";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChangePasswordButton } from "@/components/ChangePasswordButton";
import { useConfirm } from "@/components/ConfirmProvider";
import { exportCheckinPDF } from "@/lib/coachPdfExport";

const ProtocolBuilder = lazy(() => import("@/components/coach/ProtocolBuilder"));
const EvolutionComparisonLazy = lazy(() => import("@/components/coach/EvolutionComparison"));
const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));
const CheckinFeedbackPanel = lazy(() => import("@/components/coach/CheckinFeedbackPanel"));
const StudentWorkoutAnalytics = lazy(() => import("@/components/coach/StudentWorkoutAnalytics"));
const ProtocolChangeHistoryDialog = lazy(() => import("@/components/coach/ProtocolChangeHistoryDialog"));

// CheckinPayloadAnswers foi extraído para src/components/coach/CheckinPayloadAnswers.tsx
// e é compartilhado com EvolutionComparison (modo "Ver Feedback Completo").

// ─── Evolution (Visual) Dialog ────────────────────────────────────────────────

function EvolutionDialog({ student, open, onClose }: { student: StudentStatus | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Evolução e Anamnese — {student?.name || "Aluno"}</DialogTitle>
        </DialogHeader>
        {student && (
          <Tabs defaultValue="evolucao" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="evolucao">Evolução</TabsTrigger>
              <TabsTrigger value="anamnese">Anamnese completa</TabsTrigger>
            </TabsList>
            <TabsContent value="evolucao" className="mt-4">
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <EvolutionComparisonLazy studentId={student.id} studentName={student.name} />
              </Suspense>
            </TabsContent>
            <TabsContent value="anamnese" className="mt-4">
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <AnamnesisViewerLazy studentId={student.id} studentName={student.name} />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Student Feedback Config Dialog ──────────────────────────────────────────

function StudentFeedbackConfigDialog({
  student, coachId, open, onClose, onSaved,
}: {
  student: StudentStatus | null;
  coachId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [interval, setIntervalDays] = useState<number>(14);
  const [warning, setWarning] = useState<number>(14);
  const [critical, setCritical] = useState<number>(16);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && student) {
      setIntervalDays(student.feedbackIntervalDays ?? 14);
      setWarning(student.warningDays ?? 14);
      setCritical(student.criticalDays ?? 16);
    }
  }, [open, student]);

  const save = async () => {
    if (!student || !coachId) return;
    if (interval <= 0 || warning <= 0 || critical <= 0) {
      toast.error("Todos os valores devem ser maiores que zero");
      return;
    }
    if (critical < warning) {
      toast.error("Dias para Crítico deve ser maior ou igual a Atenção");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb
        .from("coach_students")
        .update({
          feedback_interval_days: interval,
          warning_days: warning,
          critical_days: critical,
        })
        .eq("coach_id", coachId)
        .eq("student_id", student.id);
      if (error) throw error;
      toast.success("Configuração de feedback atualizada");
      onSaved();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Feedback — {student?.name ?? "Aluno"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-interval" className="text-xs">Intervalo de feedback (dias)</Label>
            <Input
              id="fb-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            />
            <p className="text-[10px] text-muted-foreground">A cada quantos dias o aluno deve enviar check-in.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-warning" className="text-xs">Dias para Atenção</Label>
            <Input
              id="fb-warning"
              type="number"
              min={1}
              value={warning}
              onChange={(e) => setWarning(Number(e.target.value))}
            />
            <p className="text-[10px] text-muted-foreground">A partir desse número, o aluno aparece em amarelo.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-critical" className="text-xs">Dias para Crítico</Label>
            <Input
              id="fb-critical"
              type="number"
              min={1}
              value={critical}
              onChange={(e) => setCritical(Number(e.target.value))}
            />
            <p className="text-[10px] text-muted-foreground">A partir desse número, o aluno aparece em vermelho.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CoachView = "list" | "protocol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

function useCoachId() {
  const [coachId, setCoachId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => { setCoachId(data.session?.user?.id || null); })
      .catch((e) => { console.warn("[useCoachId] Falha ao obter sessão:", e); setCoachId(null); });
  }, []);
  return coachId;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: { label: string; value: number | string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${accent}15` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function AlertBadge({ level }: { level: AlertLevel }) {
  const map: Record<AlertLevel, { label: string; cls: string }> = {
    critical: { label: "Crítico", cls: "bg-red-100 text-red-700 border-red-200" },
    warning:  { label: "Atenção", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    ok:       { label: "Em dia",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };
  const { label, cls } = map[level] || map.ok;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function StudentRow({
  student, onAnamnesis, onProtocol, onUnlink, onHistory, onChangeHistory, onLatestFeedback, onSettings,
}: {
  student: StudentStatus;
  onAnamnesis: (s: StudentStatus) => void;
  onProtocol: (s: StudentStatus) => void;
  onUnlink: (s: StudentStatus) => void;
  onHistory: (s: StudentStatus) => void;
  onChangeHistory: (s: StudentStatus) => void;
  onLatestFeedback: (s: StudentStatus) => void;
  onSettings: (s: StudentStatus) => void;
}) {
  const lastActivity =
    student.daysInactive === 0 ? "Hoje" :
    student.daysInactive === 1 ? "Ontem" :
    student.daysInactive >= 999 ? "Sem registro" :
    `${student.daysInactive}d sem registro`;

  const feedbackLabel =
    student.daysSinceLastFeedback >= 999 ? "Sem feedback" :
    student.daysSinceLastFeedback === 0 ? "Feedback hoje" :
    student.daysSinceLastFeedback === 1 ? "Feedback há 1 dia" :
    `Feedback há ${student.daysSinceLastFeedback} dias`;

  const safeName = student.name || "Aluno";
  const initials = safeName.split(" ").slice(0, 2).map((n) => n[0] || "").join("");

  let displayWeight: string | number | undefined;
  if (typeof student.currentWeight === "object" && student.currentWeight !== null) {
    displayWeight = (student.currentWeight as any).peso || (student.currentWeight as any).weight || undefined;
  } else {
    displayWeight = student.currentWeight as string | number | undefined;
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-colors ${
      student.alertLevel === "critical" ? "bg-red-50/60 border-red-100 dark:bg-red-950/20 dark:border-red-900" :
      student.alertLevel === "warning"  ? "bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900" :
      "bg-card border-border"
    }`}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-primary/10 text-primary uppercase">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">{safeName}</p>
          <AlertBadge level={student.alertLevel || "ok"} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{student.goal || "Objetivo não definido"} · {lastActivity}</p>
        <button
          type="button"
          onClick={() => student.daysSinceLastFeedback < 999 && onLatestFeedback(student)}
          disabled={student.daysSinceLastFeedback >= 999}
          className={`text-xs flex items-center gap-1 mt-0.5 rounded px-1 -mx-1 transition-colors ${
            student.daysSinceLastFeedback >= 999 ? "text-muted-foreground cursor-default" :
            student.daysSinceLastFeedback >= student.criticalDays ? "text-red-500 font-medium hover:bg-red-500/10" :
            student.daysSinceLastFeedback >= student.warningDays ? "text-orange-500 hover:bg-orange-500/10" :
            "text-emerald-500 hover:bg-emerald-500/10"
          }`}
          title={student.daysSinceLastFeedback < 999 ? "Ver feedback atual" : undefined}
        >
          <MessageSquare className="w-3 h-3" />
          {feedbackLabel}
        </button>
      </div>

      {displayWeight !== undefined && displayWeight !== null && (
        <div className="hidden sm:block text-right shrink-0">
          <p className="text-xs text-muted-foreground">Peso</p>
          <p className="text-sm font-semibold text-foreground">{displayWeight} kg</p>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onAnamnesis(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Evolução e Anamnese">
          <ClipboardList className="w-4 h-4" />
        </button>
        <button onClick={() => onProtocol(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Protocolo">
          <Dumbbell className="w-4 h-4" />
        </button>
        <button onClick={() => onHistory(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Histórico de Check-ins">
          <History className="w-4 h-4" />
        </button>
        <button onClick={() => onChangeHistory(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Histórico de Alterações">
          <Sparkles className="w-4 h-4" />
        </button>
        <button onClick={() => onSettings(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-colors" title="Configurar feedback do aluno">
          <Settings2 className="w-4 h-4" />
        </button>
        <button onClick={() => onUnlink(student)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors" title="Desvincular">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Check-ins History Dialog ─────────────────────────────────────────────────

interface CheckinRow {
  id: string;
  submitted_at: string;
  current_metrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  coach_feedback: string | null;
  photo_url: string | null;
  feedback_read_at: string | null;
}

function CheckinHistoryDialog({
  student, open, onClose,
}: {
  student: StudentStatus | null;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const PAGE = 30;

  useEffect(() => {
    if (!open || !student) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await sb
          .from("check_ins")
          .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at")
          .eq("student_id", student.id)
          .order("submitted_at", { ascending: false })
          .range(0, PAGE - 1); // paginação — histórico ilimitado travava a UI ao renderizar muitos itens
        if (error) throw error;
        const rows = (data || []) as CheckinRow[];
        setItems(rows);
        setOffset(rows.length);
        setHasMore(rows.length === PAGE);
        setExpanded({});
      } catch (e) {
        console.error("[CheckinHistoryDialog]", e instanceof Error ? e.message : e);
        toast.error("Erro ao carregar histórico de check-ins");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, student]);

  const loadMore = async () => {
    if (!student || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await sb
        .from("check_ins")
        .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at")
        .eq("student_id", student.id)
        .order("submitted_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as CheckinRow[];
      setItems((prev) => [...prev, ...rows]);
      setOffset(offset + rows.length);
      setHasMore(rows.length === PAGE);
    } catch (e) {
      console.error("[CheckinHistoryDialog:loadMore]", e instanceof Error ? e.message : e);
      toast.error("Erro ao carregar mais check-ins");
    } finally {
      setLoadingMore(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const getWeight = (c: CheckinRow) => {
    const m = c.current_metrics || {};
    return (m as Record<string, unknown>).peso ?? (m as Record<string, unknown>).weight ?? "—";
  };

  const hasPhotos = (c: CheckinRow) => {
    const fotos = ((c.payload as Record<string, unknown> | null)?.fotos as Record<string, string> | undefined) || {};
    return Object.values(fotos).some((v) => typeof v === "string" && v.length > 0);
  };

  const renderCheckinHTML = (c: CheckinRow) => {
    const metrics = c.current_metrics || {};
    const rows = Object.entries(metrics)
      .map(([k, v]) => `<div class="row"><span class="lbl">${k}</span><span class="val">${typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span></div>`)
      .join("");
    const fotos = ((c.payload as Record<string, unknown> | null)?.fotos as Record<string, string> | undefined) || {};
    const POSES: Array<[string, string]> = [
      ["frente", "Frente"], ["lateral_dir", "Lado Dir."], ["lateral_esq", "Lado Esq."], ["costas", "Costas"],
    ];
    const photoImgs = POSES
      .map(([key, label]) => {
        const url = key === "frente"
          ? (fotos.frente || fotos.front || c.photo_url || "")
          : (fotos[key] || "");
        if (!url) return "";
        return `<figure class="photo"><img src="${url}" alt="${label}"/><figcaption>${label}</figcaption></figure>`;
      })
      .join("");
    return `
      <h2>Check-in — ${fmtDate(c.submitted_at)}</h2>
      ${rows}
      ${photoImgs ? `<h3>Fotos</h3><div class="photos">${photoImgs}</div>` : ""}
      ${c.coach_feedback ? `<h3>Feedback do Coach</h3><p>${c.coach_feedback}</p>` : ""}
    `;
  };

  const exportOne = (c: CheckinRow) => {
    if (!student) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita popups para exportar"); return; }
    w.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Check-in — ${student.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;max-width:780px;margin:auto;color:#111}
      h1{font-size:20px;border-bottom:2px solid #C0392B;padding-bottom:8px}
      h2{font-size:14px;color:#C0392B;margin-top:22px;text-transform:uppercase;letter-spacing:.05em}
      h3{font-size:13px;color:#444;margin-top:14px}
      .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}
      .lbl{color:#555;font-weight:600;text-transform:capitalize}.val{max-width:55%;text-align:right}
      .photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
      .photo{margin:0;page-break-inside:avoid}
      .photo img{max-width:150px;max-height:220px;object-fit:cover;border:1px solid #ddd;display:block}
      .photo figcaption{font-size:11px;color:#555;text-align:center;margin-top:2px}
      @media print{body{padding:0}}</style></head><body>
      <h1>Check-in — ${student.name}</h1>
      ${renderCheckinHTML(c)}
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`);
    w.document.close();
  };

  const exportAll = async () => {
    if (!student || exportingAll) return;
    setExportingAll(true);
    const t = toast.loading("Buscando histórico completo…");
    try {
      const { data, error } = await sb
        .from("check_ins")
        .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url, feedback_read_at")
        .eq("student_id", student.id)
        .order("submitted_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const all = (data || []) as CheckinRow[];
      if (all.length === 0) { toast.dismiss(t); toast.info("Nenhum check-in para exportar"); return; }
      const w = window.open("", "_blank");
      if (!w) { toast.dismiss(t); toast.error("Permita popups para exportar"); return; }
      w.document.write(`
      <!doctype html><html><head><meta charset="utf-8"><title>Check-ins — ${student.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;max-width:780px;margin:auto;color:#111}
      h1{font-size:20px;border-bottom:2px solid #C0392B;padding-bottom:8px}
      h2{font-size:14px;color:#C0392B;margin-top:22px;text-transform:uppercase;letter-spacing:.05em}
      h3{font-size:13px;color:#444;margin-top:14px}
      .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px}
      .lbl{color:#555;font-weight:600;text-transform:capitalize}.val{max-width:55%;text-align:right}
      .photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
      .photo{margin:0;page-break-inside:avoid}
      .photo img{max-width:150px;max-height:220px;object-fit:cover;border:1px solid #ddd;display:block}
      .photo figcaption{font-size:11px;color:#555;text-align:center;margin-top:2px}
      .checkin{page-break-after:always;margin-bottom:30px}
      @media print{body{padding:0}}</style></head><body>
      <h1>Histórico de Check-ins — ${student.name}</h1>
      ${all.map((c) => `<div class="checkin">${renderCheckinHTML(c)}</div>`).join("")}
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`);
      w.document.close();
      toast.dismiss(t);
    } catch (e) {
      toast.dismiss(t);
      console.error("[CheckinHistoryDialog:exportAll]", e instanceof Error ? e.message : e);
      toast.error("Erro ao exportar histórico completo");
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check-ins — {student?.name ?? "Aluno"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-10">Nenhum check-in registrado ainda.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={exportAll} disabled={exportingAll}>
                <FileDown className="w-4 h-4 mr-1.5" /> Exportar todos em PDF
              </Button>
            </div>
            {items.map((c) => {
              const isOpen = !!expanded[c.id];
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">{fmtDate(c.submitted_at)}</p>
                      <p className="text-xs text-muted-foreground">Peso: <span className="font-medium text-foreground">{String(getWeight(c))} kg</span></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {hasPhotos(c) && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-600 border-blue-500/30">Com fotos</span>
                      )}
                      {c.coach_feedback && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Com feedback</span>
                      )}
                      {c.coach_feedback && c.feedback_read_at && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30">✓ Visto pelo aluno</span>
                      )}
                      {c.coach_feedback && !c.feedback_read_at && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/30">Aguardando leitura</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => setExpanded((p) => ({ ...p, [c.id]: !isOpen }))}>
                      {isOpen ? "Ocultar" : "Ver detalhes"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportOne(c)}>
                      <FileDown className="w-3 h-3 mr-1" /> Exportar PDF
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border pt-2 mt-1 space-y-1">
                      {Object.entries(c.current_metrics || {}).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs py-0.5">
                          <span className="text-muted-foreground capitalize">{k}</span>
                          <span className="font-medium text-right max-w-[60%]">
                            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                          </span>
                        </div>
                      ))}
                      <CheckinPayloadAnswers payload={c.payload as Record<string, unknown> | null} showPhotos />
                      {c.coach_feedback && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-xs font-semibold text-primary mb-1">Feedback do Coach</p>
                          <p className="text-xs whitespace-pre-wrap text-foreground/85">{c.coach_feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Carregar mais"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Finances Tab ────────────────────────────────────────────────────────────

function FinancesTab({ coachId, students }: { coachId: string; students: StudentLite[] }) {
  const { data: finances = [], isLoading } = useCoachFinances(coachId);
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ student_id: "", description: "", amount: "", due_date: "" });
  const [editingFinance, setEditingFinance] = useState<{ id: string; due_date: string } | null>(null);
  const [quickBilling, setQuickBilling] = useState<{ student_id: string; student_name: string } | null>(null);
  const [quickForm, setQuickForm] = useState({ description: "Mensalidade", amount: "", due_date: "" });
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [creatingBilling, setCreatingBilling] = useState(false);

  const addFinance = useMutation({
    mutationFn: async () => {
      if (!form.description) throw new Error("Descrição é obrigatória");
      const { error } = await supabase.from("coach_finances").insert({
        coach_id: coachId,
        student_id: form.student_id || null,
        description: form.description,
        amount: Number(form.amount || 0),
        due_date: form.due_date || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro financeiro adicionado!");
      setForm({ student_id: "", description: "", amount: "", due_date: "" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["coach-finances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = async (id: string, currentlyPaid: boolean) => {
    try {
      const { error } = await supabase.from("coach_finances").update({
        status: currentlyPaid ? "pending" : "paid",
        paid_at: currentlyPaid ? null : new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-finances"] });
      toast.success(currentlyPaid ? "Marcado como pendente" : "Marcado como pago");
    } catch (e) {
      toast.error("Erro ao atualizar status: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const deleteFinance = async (id: string) => {
    if (!(await confirm({ title: "Remover registro", description: "Remover registro financeiro?", destructive: true, confirmLabel: "Remover" }))) return;
    try {
      const { error } = await supabase.from("coach_finances").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-finances"] });
    } catch (e) {
      toast.error("Erro ao remover: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const updateDueDate = async () => {
    if (!editingFinance || savingDueDate) return;
    setSavingDueDate(true);
    try {
      const { error } = await supabase.from("coach_finances")
        .update({ due_date: editingFinance.due_date || null })
        .eq("id", editingFinance.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-finances"] });
      setEditingFinance(null);
      toast.success("Data de vencimento atualizada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar vencimento");
    } finally {
      setSavingDueDate(false);
    }
  };

  const createQuickBilling = async () => {
    if (!quickBilling || creatingBilling) return;
    setCreatingBilling(true);
    try {
      const { error } = await supabase.from("coach_finances").insert({
        coach_id: coachId,
        student_id: quickBilling.student_id,
        description: quickForm.description || "Mensalidade",
        amount: Number(quickForm.amount || 0),
        due_date: quickForm.due_date || null,
        status: "pending",
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-finances"] });
      toast.success(`Cobrança criada para ${quickBilling.student_name}. O aluno receberá o alerta.`);
      setQuickBilling(null);
      setQuickForm({ description: "Mensalidade", amount: "", due_date: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar cobrança");
    } finally {
      setCreatingBilling(false);
    }
  };

  const totalReceita  = finances.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
  const totalPendente = finances.filter((f) => f.status === "pending").reduce((s, f) => s + Number(f.amount), 0);
  const totalAtrasado = finances.filter((f) => f.status === "pending" && f.due_date && new Date(f.due_date) < new Date()).reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Receita (Pago)"  value={`R$ ${totalReceita.toFixed(0)}`}  icon={<DollarSign className="w-4 h-4" />}   accent="#10B981" />
        <StatCard label="Pendente"         value={`R$ ${totalPendente.toFixed(0)}`} icon={<Calendar className="w-4 h-4" />}     accent="#F59E0B" />
        <StatCard label="Atrasado"         value={`R$ ${totalAtrasado.toFixed(0)}`} icon={<AlertTriangle className="w-4 h-4" />} accent="#EF4444" />
      </div>

      <div className="flex items-center justify-between mt-6">
        <h3 className="text-sm font-semibold text-foreground">Alunos Ativos & Mensalidades</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Cobrança Avulsa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum aluno ativo para faturar.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Aluno</TableHead>
                <TableHead className="text-xs">Ativação (Anamnese)</TableHead>
                <TableHead className="text-xs">Vencimento Atual</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => {
                const activeFinance = finances
                  .filter((f) => f.student_id === student.id && f.status === "pending")
                  .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())[0];

                const isOverdue = activeFinance?.status === "pending" && activeFinance.due_date && new Date(activeFinance.due_date) < new Date();

                return (
                  <TableRow key={student.id}>
                    <TableCell className="text-sm font-semibold">{student.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {student.lastAnamnesis ? new Date(student.lastAnamnesis).toLocaleDateString("pt-BR") : "Aguardando"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {activeFinance?.due_date ? new Date(activeFinance.due_date).toLocaleDateString("pt-BR") : "Sem pendências"}
                    </TableCell>
                    <TableCell>
                      {activeFinance ? (
                        <button
                          onClick={() => togglePaid(activeFinance.id, false)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${
                            isOverdue ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
                          }`}
                        >
                          {isOverdue ? "Atrasado" : "Pendente"}
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">Em dia</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {activeFinance ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => setEditingFinance({ id: activeFinance.id, due_date: activeFinance.due_date || "" })} title="Alterar Data">
                            <Calendar className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
                            onClick={() => togglePaid(activeFinance.id, false)} title="Marcar como Pago">
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteFinance(activeFinance.id)} title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => { setQuickBilling({ student_id: student.id, student_name: student.name }); setQuickForm({ description: "Mensalidade", amount: "", due_date: "" }); }}>
                          <Plus className="w-3 h-3" /> Gerar Cobrança
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!quickBilling} onOpenChange={(open) => !open && setQuickBilling(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Gerar Cobrança</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Para: <strong>{quickBilling?.student_name}</strong></p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={quickForm.description} onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" value={quickForm.amount} onChange={(e) => setQuickForm({ ...quickForm, amount: e.target.value })} placeholder="0,00" className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input type="date" value={quickForm.due_date} onChange={(e) => setQuickForm({ ...quickForm, due_date: e.target.value })} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              O aluno verá um alerta de cobrança no painel dele assim que a data de vencimento se aproximar.
            </p>
            <Button onClick={createQuickBilling} disabled={creatingBilling} className="w-full">
              {creatingBilling ? "Criando..." : "Criar Cobrança"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingFinance} onOpenChange={(open) => !open && setEditingFinance(null)}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader><DialogTitle>Alterar Vencimento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nova Data de Vencimento</Label>
              <Input
                type="date"
                value={editingFinance?.due_date || ""}
                onChange={(e) => setEditingFinance((prev) => prev ? { ...prev, due_date: e.target.value } : null)}
                className="mt-1 h-9"
              />
            </div>
            <Button onClick={updateDueDate} disabled={savingDueDate} className="w-full">
              {savingDueDate ? "Salvando..." : "Salvar Alteração"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Lançar Cobrança Manual</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Descrição *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Ajuste de Protocolo" className="mt-1 h-9 text-sm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Valor (R$)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 h-9 text-sm" /></div>
              <div><Label className="text-xs">Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1 h-9 text-sm" /></div>
            </div>
            <div>
              <Label className="text-xs">Vincular Aluno</Label>
              <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => addFinance.mutate()} disabled={addFinance.isPending} className="w-full">Adicionar Lançamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Profile Dialog ──────────────────────────────────────────────────────────

function ProfileDialog({ coachId, open, onClose }: { coachId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixHolderName, setPixHolderName] = useState("");
  const [pixCity, setPixCity] = useState("");
  const [billingAlertDays, setBillingAlertDays] = useState<number>(7);
  const [feedbackIntervalDays, setFeedbackIntervalDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !coachId) return;
    supabase
      .from("profiles")
      .select("full_name, team_name, invite_code, notification_email, pix_key, pix_holder_name, pix_city, billing_alert_days, feedback_interval_days")
      .eq("user_id", coachId)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name || "");
        setTeamName((data as any)?.team_name || "");
        setInviteCode((data as any)?.invite_code || "");
        setNotificationEmail((data as any)?.notification_email || "");
        setPixKey((data as any)?.pix_key || "");
        setPixHolderName((data as any)?.pix_holder_name || "");
        setPixCity((data as any)?.pix_city || "");
        setBillingAlertDays((data as any)?.billing_alert_days ?? 7);
        setFeedbackIntervalDays((data as any)?.feedback_interval_days ?? 7);
      });
  }, [open, coachId]);

  const generatingRef = useRef(false);
  const generateCode = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let attempt = 0; attempt < 6; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        const { data: exists } = await supabase.from("profiles").select("user_id").eq("invite_code", code).maybeSingle();
        if (!exists) { setInviteCode(code); toast.success("Código gerado. Lembre de salvar."); return; }
      }
      toast.error("Não foi possível gerar um código único.");
    } catch (e: any) { toast.error(e.message); } finally { generatingRef.current = false; setGenerating(false); }
  };

  const copyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    toast.success("Código copiado");
  };

  const loadingRef = useRef(false);
  const save = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const code = inviteCode.trim().toUpperCase() || null;
      if (code) {
        const { data: clash } = await supabase.from("profiles").select("user_id").eq("invite_code", code).neq("user_id", coachId).maybeSingle();
        if (clash) { toast.error("Este código já está em uso por outro coach."); return; }
      }
      const { error } = await sb.from("profiles").update({
        full_name: fullName,
        team_name: teamName,
        invite_code: code,
        notification_email: notificationEmail.trim() || null,
        pix_key: pixKey,
        pix_holder_name: pixHolderName || null,
        pix_city: pixCity || null,
        billing_alert_days: billingAlertDays,
        feedback_interval_days: feedbackIntervalDays,
      }).eq("user_id", coachId);
      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["coach-profile", coachId] });
      qc.invalidateQueries({ queryKey: ["coach-students"] });
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { loadingRef.current = false; setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>Meu Perfil</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Nome completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Nome da equipe / empresa</Label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Ex: Equipe Performance" className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">E-mail de notificação</Label>
            <Input type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} placeholder="Para onde os alunos te contatam" className="mt-1 h-9 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">Visível para os alunos como seu contato.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-amber-600 font-bold">Chave PIX</Label>
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Email, CPF..." className="mt-1 h-9 text-sm border-amber-500/30" />
            </div>
            <div>
              <Label className="text-xs text-primary font-bold">Aviso de cobrança</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min={1} max={30} value={billingAlertDays}
                  onChange={(e) => setBillingAlertDays(Number(e.target.value) || 7)}
                  className="h-9 text-sm w-16 text-center" />
                <span className="text-xs text-muted-foreground">dias antes</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do recebedor (PIX)</Label>
              <Input value={pixHolderName} onChange={(e) => setPixHolderName(e.target.value.slice(0, 25))} placeholder="Como aparece no banco" maxLength={25} className="mt-1 h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">Até 25 caracteres. Usado no QR Code.</p>
            </div>
            <div>
              <Label className="text-xs">Cidade (PIX)</Label>
              <Input value={pixCity} onChange={(e) => setPixCity(e.target.value.slice(0, 15))} placeholder="Ex: SAO PAULO" maxLength={15} className="mt-1 h-9 text-sm" />
              <p className="text-[10px] text-muted-foreground mt-1">Até 15 caracteres.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs text-emerald-600 font-bold">Intervalo de feedback</Label>
            <p className="text-[11px] text-muted-foreground mb-1">A cada quantos dias você quer receber feedback dos alunos?</p>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={60} value={feedbackIntervalDays}
                onChange={(e) => setFeedbackIntervalDays(Number(e.target.value) || 7)}
                className="h-9 text-sm w-16 text-center" />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
            <Label className="text-xs text-primary uppercase tracking-wider">Código de convite</Label>
            <p className="text-[11px] text-muted-foreground">Compartilhe com seus alunos.</p>
            <div className="flex gap-2">
              <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder="EX: ELITE26" maxLength={12} className="h-9 text-sm font-mono tracking-widest uppercase" />
              <Button type="button" variant="outline" size="sm" onClick={generateCode} disabled={generating}>{generating ? "..." : "Gerar"}</Button>
              <Button type="button" variant="outline" size="sm" onClick={copyCode} disabled={!inviteCode}>Copiar</Button>
            </div>
          </div>

          <Button onClick={save} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar Perfil"}
          </Button>

          <div className="border-t border-border pt-3">
            <ChangePasswordButton variant="outline" className="w-full" />
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Enviaremos um link de redefinição para seu e-mail.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const coachId = useCoachId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | AlertLevel>("all");
  const [view, setView] = useState<CoachView>("list");
  const [selectedStudent, setSelectedStudent] = useState<StudentStatus | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<StudentStatus | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentStatus | null>(null);
  const [changeHistoryStudent, setChangeHistoryStudent] = useState<StudentStatus | null>(null);
  const [evoStudent, setEvoStudent] = useState<StudentStatus | null>(null);
  const [latestFbStudent, setLatestFbStudent] = useState<StudentStatus | null>(null);
  const [settingsStudent, setSettingsStudent] = useState<StudentStatus | null>(null);
  const [studentPage, setStudentPage] = useState(0);
  const STUDENTS_PER_PAGE = 20;
  const [activeTab, setActiveTab] = useState<"students" | "finances" | "treinos">("students");
  const [treinoSearch, setTreinoSearch] = useState("");
  const qc = useQueryClient();

  const { data: coachProfile } = useQuery({
    queryKey: ["coach-profile", coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("feedback_interval_days, billing_alert_days").eq("user_id", coachId).maybeSingle();
      return data;
    },
  });

  const feedbackIntervalDays: number = (coachProfile as any)?.feedback_interval_days ?? 7;

  // Paginated hook for the Students list — Phase A (light, all) + Phase B (heavy, page only).
  const {
    students: pagedStudents,
    filteredCount,
    stats,
    isLoading,
  } = useCoachStudentsPaged(coachId, feedbackIntervalDays, {
    page: studentPage,
    pageSize: STUDENTS_PER_PAGE,
    search,
    filter,
  });

  const totalPages = Math.max(1, Math.ceil(filteredCount / STUDENTS_PER_PAGE));
  const safePage = Math.min(studentPage, totalPages - 1);

  useEffect(() => { setStudentPage(0); }, [search, filter]);

  const { data: allStudents = [] } = useCoachStudentsLite(coachId);

  const goBack = () => { setView("list"); setSelectedStudent(null); };

  const confirmUnlink = async () => {
    if (!unlinkTarget) return;
    try {
      const { error } = await supabase.from("coach_students").update({ status: "inactive" }).eq("coach_id", coachId).eq("student_id", unlinkTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["coach-students"] });
      toast.success("Aluno desvinculado");
      setUnlinkTarget(null);
    } catch (e) {
      toast.error("Erro ao desvincular: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[handleLogout] Falha ao encerrar sessão no servidor:", e);
    } finally {
      window.location.href = "/auth";
    }
  };

  if (view !== "list" && selectedStudent) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-sm font-bold text-foreground">
              {view === "protocol" ? "Protocolo" : ""} — {selectedStudent.name || "Aluno"}
            </h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            {view === "protocol" && <ProtocolBuilder studentId={selectedStudent.id} studentName={selectedStudent.name} />}
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Painel Coach</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div className="flex items-center gap-2">
            <CoachNotificationBell />
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive h-9">
              <LogOut className="w-4 h-4 mr-1.5" /> Sair
            </Button>
            {stats.critical > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.critical} crítico{stats.critical > 1 ? "s" : ""}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowProfile(true)} className="gap-1.5">
              <User className="w-3.5 h-3.5" /> Perfil
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "students" | "finances" | "treinos")} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="students" className="gap-1.5 text-xs sm:text-sm"><Users className="w-3.5 h-3.5" /> Alunos</TabsTrigger>
            <TabsTrigger value="finances" className="gap-1.5 text-xs sm:text-sm"><DollarSign className="w-3.5 h-3.5" /> Financeiro</TabsTrigger>
            <TabsTrigger value="treinos" className="gap-1.5 text-xs sm:text-sm"><Activity className="w-3.5 h-3.5" /> Treinos</TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total de alunos"   value={stats.total}    icon={<Users className="w-4 h-4" />}        accent="#3B82F6" />
              <StatCard label="Em alerta crítico" value={stats.critical} icon={<AlertTriangle className="w-4 h-4" />} accent="#EF4444" />
              <StatCard label="Precisam atenção"  value={stats.warning}  icon={<AlertTriangle className="w-4 h-4" />} accent="#F59E0B" />
              <StatCard label="Em dia"            value={stats.ok}       icon={<CheckCircle2 className="w-4 h-4" />}  accent="#10B981" />
            </div>

            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno..." className="pl-8 h-9 text-sm" />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as "all" | AlertLevel)}>
                <SelectTrigger className="w-36 h-9 text-sm">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="warning">Atenção</SelectItem>
                  <SelectItem value="ok">Em dia</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["coach-students"] })}
                className="h-9"
                title="Atualizar lista"
              >
                Atualizar
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : filteredCount === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {stats.total === 0 ? "Nenhum aluno vinculado ainda. Compartilhe seu código de convite." : "Nenhum aluno encontrado com os filtros atuais."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pagedStudents.map((s) => (
                  <StudentRow key={s.id} student={s}
                    onAnamnesis={(st) => setEvoStudent(st)}
                    onProtocol={(st) => { setSelectedStudent(st); setView("protocol"); }}
                    onUnlink={setUnlinkTarget}
                    onHistory={setHistoryStudent}
                    onChangeHistory={setChangeHistoryStudent}
                    onLatestFeedback={(st) => setLatestFbStudent(st)}
                    onSettings={(st) => setSettingsStudent(st)}
                  />
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safePage <= 0}
                      onClick={() => setStudentPage((p) => Math.max(0, p - 1))}
                    >
                      ← Anterior
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Página {safePage + 1} de {totalPages}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setStudentPage((p) => p + 1)}
                    >
                      Próxima →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="finances">
            {coachId && <FinancesTab coachId={coachId} students={allStudents} />}
          </TabsContent>

          <TabsContent value="treinos" className="space-y-4">
            {/* Seletor de aluno */}
            {allStudents.length > 8 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={treinoSearch}
                  onChange={(e) => setTreinoSearch(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const norm = (v: string) => (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const q = norm(treinoSearch.trim());
                const list = q ? allStudents.filter((s) => norm(s.name || "").includes(q)) : allStudents;
                return list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudent(allStudents.find((st) => st.id === s.id) ? { id: s.id, name: s.name, alertLevel: "ok", daysInactive: 0, daysSinceLastFeedback: 999, currentWeight: undefined, lastWeightDate: undefined } as any : null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                  style={
                    selectedStudent?.id === s.id
                      ? { background: "hsl(var(--primary) / 0.15)", borderColor: "hsl(var(--primary) / 0.5)", color: "hsl(var(--primary))" }
                      : { background: "transparent", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {s.name}
                </button>
                ));
              })()}
            </div>
            {selectedStudent && coachId ? (
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <StudentWorkoutAnalytics
                  studentId={selectedStudent.id}
                  studentName={selectedStudent.name}
                  coachId={coachId}
                />
              </Suspense>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
                {allStudents.length === 0
                  ? "Nenhum aluno vinculado ainda."
                  : "Selecione um aluno acima para ver os dados de treino."}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {coachId && <ProfileDialog coachId={coachId} open={showProfile} onClose={() => setShowProfile(false)} />}

        <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desvincular aluno?</AlertDialogTitle>
              <AlertDialogDescription>{unlinkTarget?.name} perderá acesso ao protocolo.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnlink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Desvincular</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CheckinHistoryDialog
          student={historyStudent}
          open={!!historyStudent}
          onClose={() => setHistoryStudent(null)}
        />

        <Suspense fallback={null}>
          <ProtocolChangeHistoryDialog
            student={changeHistoryStudent}
            open={!!changeHistoryStudent}
            onClose={() => setChangeHistoryStudent(null)}
          />
        </Suspense>

        <EvolutionDialog
          student={evoStudent}
          open={!!evoStudent}
          onClose={() => setEvoStudent(null)}
        />

        <Suspense fallback={null}>
          <CheckinFeedbackPanel
            studentId={latestFbStudent?.id ?? null}
            studentName={latestFbStudent?.name ?? "Aluno"}
            open={!!latestFbStudent}
            onClose={() => setLatestFbStudent(null)}
          />
        </Suspense>

        <StudentFeedbackConfigDialog
          student={settingsStudent}
          coachId={coachId}
          open={!!settingsStudent}
          onClose={() => setSettingsStudent(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["coach-students"] })}
        />
      </main>
    </div>
  );
}
