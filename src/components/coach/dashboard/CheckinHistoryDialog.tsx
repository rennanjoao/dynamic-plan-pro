import { useEffect, useState } from "react";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CheckinPayloadAnswers from "@/components/coach/CheckinPayloadAnswers";
import { sb } from "./dashboardUtils";
import { Private, usePrivacyMode } from "@/components/coach/PrivacyMode";

const PRIVACY_EXPORT_TITLE = "Desativado no Modo Privacidade — o PDF abriria com nome e fotos do aluno visíveis.";

interface CheckinRow {
  id: string;
  submitted_at: string;
  current_metrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  coach_feedback: string | null;
  photo_url: string | null;
  feedback_read_at: string | null;
}

export function CheckinHistoryDialog({
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
  const { privacy } = usePrivacyMode();
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
          .range(0, PAGE - 1);
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

  const hasExames = (c: CheckinRow) => {
    const ex = ((c.payload as Record<string, unknown> | null)?.exames as Array<unknown> | undefined) || [];
    return Array.isArray(ex) && ex.length > 0;
  };

  const renderCheckinHTML = async (c: CheckinRow) => {
    const metrics = c.current_metrics || {};
    const rows = Object.entries(metrics)
      .map(([k, v]) => `<div class="row"><span class="lbl">${k}</span><span class="val">${typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span></div>`)
      .join("");
    const fotos = ((c.payload as Record<string, unknown> | null)?.fotos as Record<string, string> | undefined) || {};
    const POSES: Array<[string, string]> = [
      ["frente", "Frente"], ["lateral_dir", "Lado Dir."], ["lateral_esq", "Lado Esq."], ["costas", "Costas"],
    ];
    const photoImgs = (
      await Promise.all(
        POSES.map(async ([key, label]) => {
          const ref = key === "frente"
            ? (fotos.frente || fotos.front || c.photo_url || "")
            : (fotos[key] || "");
          const url = await resolveMediaUrl(ref);
          if (!url) return "";
          return `<figure class="photo"><img src="${url}" alt="${label}"/><figcaption>${label}</figcaption></figure>`;
        }),
      )
    ).join("");
    const body = `
      <h2>Check-in — ${fmtDate(c.submitted_at)}</h2>
      ${rows}
      ${photoImgs ? `<h3>Fotos</h3><div class="photos">${photoImgs}</div>` : ""}
      ${c.coach_feedback ? `<h3>Feedback do Coach</h3><p>${c.coach_feedback}</p>` : ""}
    `;
    return body;
  };

  const exportOne = async (c: CheckinRow) => {
    if (!student) return;
    const html = await renderCheckinHTML(c);
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
      ${html}
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
      ${allHtml}
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
          <DialogTitle>Check-ins — <Private>{student?.name ?? "Aluno"}</Private></DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-10">Nenhum check-in registrado ainda.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <span title={privacy ? PRIVACY_EXPORT_TITLE : undefined}>
                <Button size="sm" variant="outline" onClick={exportAll} disabled={exportingAll || privacy}>
                  <FileDown className="w-4 h-4 mr-1.5" /> Exportar todos em PDF
                </Button>
              </span>
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
                      {hasExames(c) && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-600 border-purple-500/30">Com exames</span>
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
                    <span title={privacy ? PRIVACY_EXPORT_TITLE : undefined}>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportOne(c)} disabled={privacy}>
                        <FileDown className="w-3 h-3 mr-1" /> Exportar PDF
                      </Button>
                    </span>
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

export default CheckinHistoryDialog;