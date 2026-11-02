import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { toast } from "sonner";
import {
  Loader2, Undo2, Redo2, Trash2, Eraser, X, Save, ZoomIn, ZoomOut, Maximize, PenLine, Eye, Copy, Download, ImageDown, ChevronLeft, ChevronRight, Spline,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PrivateImg } from "@/components/coach/PrivacyMode";
import {
  DEGREE_LABEL, REF_COLOR, REF_HINT, REF_LABEL, createRefLine, duplicateLinesForTarget, exportFileName, historyInit, historyPush, historyRedo, historyUndo,
  isDirty, lineAngleDeg, moveHandle, refOf, toFreeLine, toNormalized,
  type AnnotationLine, type AnnotationRef, type PhotoAnnotationRow, type PhotoPose, type PhotoSourceKind, type VisualDegree,
} from "@/lib/photoAnnotations";
import { copyImageBlob, downloadBlob, renderAnnotatedImage } from "@/lib/annotationExport";
import { useDeletePhotoAnnotation, useSavePhotoAnnotation } from "@/hooks/usePhotoAnnotations";

/**
 * Overlay somente-leitura para miniaturas com `object-cover`.
 * `preserveAspectRatio="xMidYMid slice"` reproduz exatamente o recorte do object-cover.
 */
export function AnnotationOverlay({ lines, natural }: { lines: AnnotationLine[]; natural: { w: number; h: number } | null }) {
  if (!lines.length || !natural) return null;
  const { w, h } = natural;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {lines.map((l) => (
        <line key={l.id} x1={l.a.x * w} y1={l.a.y * h} x2={l.b.x * w} y2={l.b.y * h} stroke={REF_COLOR[refOf(l)]}
          strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={l.tool === "vertical" || l.notAssessable ? "6 4" : undefined} />
      ))}
    </svg>
  );
}

export interface AnnotationTarget {
  studentId: string;
  sourceKind: PhotoSourceKind;
  sourceId: string;
  pose: PhotoPose;
  photo: string;
  /** "Anamnese · 01/02/2026 · Frente" */
  title: string;
  date: string;
  existing: PhotoAnnotationRow | null;
}

const REFS: AnnotationRef[] = ["shoulders", "pelvis", "knees", "axis", "free"];
const sameTarget = (a: AnnotationTarget, b: AnnotationTarget) => a.sourceKind === b.sourceKind && a.sourceId === b.sourceId && a.pose === b.pose;

interface Props {
  /** Foto aberta (null = fechado). */
  target: AnnotationTarget | null;
  /** Fotos do par comparado, para alternar dentro do visualizador. */
  siblings?: AnnotationTarget[];
  /** Todas as fotos do aluno disponíveis como destino de duplicação. */
  candidates?: AnnotationTarget[];
  initialMode?: "view" | "edit";
  onClose: () => void;
}

export function PhotoAnnotationEditor({ target: initialTarget, siblings = [], candidates = [], initialMode = "edit", onClose }: Props) {
  const [target, setTarget] = useState<AnnotationTarget | null>(initialTarget);
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [hist, setHist] = useState(historyInit([]));
  const lines = hist.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [ref, setRef] = useState<AnnotationRef>("shoulders");
  const [degree, setDegree] = useState<VisualDegree>("not_assessable");
  const [note, setNote] = useState("");
  const [initial, setInitial] = useState({ lines: [] as AnnotationLine[], degree: "not_assessable" as VisualDegree, note: "" });
  const [dupBanner, setDupBanner] = useState(false);
  const [aspect, setAspect] = useState(0.75);
  const [fitW, setFitW] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [confirm, setConfirm] = useState<null | { title: string; desc: string; action: () => void; danger?: boolean }>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupNote, setDupNote] = useState(false);
  const [exportState, setExportState] = useState<null | { loading: boolean; blob?: Blob; url?: string; error?: string }>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; handle: "a" | "b" } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const save = useSavePhotoAnnotation();
  const del = useDeletePhotoAnnotation();

  const load = (t: AnnotationTarget | null, opts?: { lines?: AnnotationLine[]; degree?: VisualDegree; note?: string; asDraft?: boolean }) => {
    setTarget(t);
    if (!t) return;
    const base = { lines: t.existing?.annotations ?? [], degree: t.existing?.visual_degree ?? "not_assessable", note: t.existing?.coach_note ?? "" };
    setInitial(base);
    setHist(historyInit(opts?.lines ?? base.lines));
    setDegree(opts?.degree ?? base.degree);
    setNote(opts?.note ?? base.note);
    setDupBanner(!!opts?.asDraft);
    setSelected(null);
    setView({ s: 1, x: 0, y: 0 });
  };

  useEffect(() => { load(initialTarget); setMode(initialMode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialTarget, initialMode]);

  // Mantém `existing` atualizado após salvar (cache invalidado).
  useEffect(() => {
    if (!target) return;
    const fresh = [...siblings, ...candidates].find((c) => sameTarget(c, target));
    if (fresh && fresh.existing?.updated_at !== target.existing?.updated_at) setTarget((t) => (t ? { ...t, existing: fresh.existing } : t));
  }, [siblings, candidates, target]);

  const dirty = mode === "edit" && (dupBanner || isDirty(initial, { lines, degree, note }));
  const guard = (action: () => void) => {
    if (!dirty) return action();
    setConfirm({ title: "Descartar alterações?", desc: "As marcações não salvas desta foto serão perdidas.", action, danger: true });
  };

  const commit = (next: AnnotationLine[]) => setHist((h) => historyPush(h, next));
  const sel = lines.find((l) => l.id === selected) ?? null;

  const addLine = (r: AnnotationRef) => {
    setRef(r);
    const l = createRefLine(r);
    commit([...lines, l]);
    setSelected(l.id);
  };

  const zoomTo = (s: number, cx?: number, cy?: number) => {
    setView((v) => {
      const ns = Math.min(8, Math.max(1, s));
      if (ns === 1) return { s: 1, x: 0, y: 0 };
      if (cx == null || cy == null) return { ...v, s: ns };
      const k = ns / v.s; // mantém o ponto sob o cursor fixo
      return { s: ns, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const localPt = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 } : { x: 0, y: 0 };
  };
  const onWheel = (e: WheelEvent) => {
    const p = localPt(e.clientX, e.clientY);
    zoomTo(view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
  };
  const oneToOne = naturalW && fitW ? naturalW / fitW : 2;

  const onStageDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
      pan.current = null;
      return;
    }
    if (drag.current) return;
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onStageMove = (e: PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag.current && boxRef.current) {
      const p = toNormalized(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
      const { id, handle } = drag.current;
      setHist((h) => ({ ...h, present: h.present.map((l) => (l.id === id ? moveHandle(l, handle, p) : l)) }));
      return;
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const c = localPt((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomTo(pinch.current.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d), c.x, c.y);
      return;
    }
    if (pan.current && view.s > 1) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y }));
    }
  };
  const onStageUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null; pan.current = null;
  };

  const startDrag = (e: PointerEvent, id: string, handle: "a" | "b") => {
    if (mode !== "edit") return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setHist((h) => historyPush(h, h.present));
    drag.current = { id, handle };
    setSelected(id);
  };
  const nudge = (e: KeyboardEvent, id: string, handle: "a" | "b") => {
    const step = (e.shiftKey ? 0.02 : 0.005) / view.s;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as [number, number] | undefined;
    if (!d) return;
    e.preventDefault();
    const l = lines.find((x) => x.id === id);
    if (l) commit(lines.map((x) => (x.id === id ? moveHandle(x, handle, { x: l[handle].x + d[0], y: l[handle].y + d[1] }) : x)));
  };

  const handleSave = async () => {
    if (!target) return;
    try {
      await save.mutateAsync({ studentId: target.studentId, sourceKind: target.sourceKind, sourceId: target.sourceId, pose: target.pose, annotations: lines, visualDegree: degree, coachNote: note });
      toast.success("Marcação salva");
      setInitial({ lines, degree, note });
      setDupBanner(false);
      setMode("view");
    } catch (err) {
      toast.error("Não foi possível salvar", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleDelete = () => {
    if (!target?.existing) return;
    const existing = target.existing;
    setConfirm({
      title: "Apagar esta marcação?", desc: `Remove linhas, grau e nota de ${target.title}. A foto original não é alterada.`, danger: true,
      action: async () => {
        try {
          await del.mutateAsync({ id: existing.id, studentId: target.studentId });
          toast.success("Marcação apagada");
          const cleared = { ...target, existing: null };
          load(cleared);
        } catch (err) {
          toast.error("Não foi possível apagar", { description: err instanceof Error ? err.message : undefined });
        }
      },
    });
  };

  const switchTo = (t: AnnotationTarget) => guard(() => { load(t); });

  const duplicateTo = (dest: AnnotationTarget) => {
    if (!target) return;
    const r = duplicateLinesForTarget(lines, target.pose, dest.pose);
    if (!r.ok) { toast.error(r.reason); return; }
    setDupOpen(false);
    const destLines = [...(dest.existing?.annotations ?? []), ...r.lines];
    load(dest, { lines: destLines, note: dupNote && note.trim() ? (dest.existing?.coach_note ? dest.existing.coach_note + "\n" : "") + note : undefined, asDraft: true });
    setMode("edit");
    toast.info("Rascunho criado na foto destino. Ajuste as linhas e salve.");
  };

  const startExport = async () => {
    if (!target) return;
    setExportState({ loading: true });
    try {
      const blob = await renderAnnotatedImage(target.photo, lines, target.title);
      setExportState({ loading: false, blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setExportState({ loading: false, error: err instanceof Error ? err.message : "Falha ao gerar a imagem." });
    }
  };
  const closeExport = () => { if (exportState?.url) URL.revokeObjectURL(exportState.url); setExportState(null); };

  const close = () => guard(() => { onClose(); });
  const sibIndex = target ? siblings.findIndex((s) => sameTarget(s, target)) : -1;

  return (
    <>
      <Dialog open={!!target} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {mode === "edit" ? <PenLine className="w-4 h-4 text-primary" /> : <Eye className="w-4 h-4 text-primary" />}
              {target?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">Referência visual privada do Coach. Câmera, distância, roupa e pose alteram a leitura — não é diagnóstico.</DialogDescription>
          </DialogHeader>

          {target && (
            <div className="grid md:grid-cols-[1fr_250px] gap-4">
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="outline" className="h-8" aria-label="Diminuir zoom" onClick={() => zoomTo(view.s / 1.25)} disabled={view.s <= 1}><ZoomOut className="w-4 h-4" /></Button>
                  <span className="text-[11px] w-12 text-center tabular-nums" aria-live="polite">{Math.round(view.s * 100)}%</span>
                  <Button size="sm" variant="outline" className="h-8" aria-label="Aumentar zoom" onClick={() => zoomTo(view.s * 1.25)} disabled={view.s >= 8}><ZoomIn className="w-4 h-4" /></Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => zoomTo(oneToOne)}>100%</Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => zoomTo(1)}><Maximize className="w-3.5 h-3.5 mr-1" />Ajustar</Button>
                  {siblings.length > 1 && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-8" aria-label="Foto anterior do par" disabled={sibIndex <= 0} onClick={() => switchTo(siblings[sibIndex - 1])}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-[10px] text-muted-foreground">{sibIndex + 1}/{siblings.length}</span>
                      <Button size="sm" variant="ghost" className="h-8" aria-label="Próxima foto do par" disabled={sibIndex < 0 || sibIndex >= siblings.length - 1} onClick={() => switchTo(siblings[sibIndex + 1])}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  )}
                </div>

                <div ref={stageRef} className="relative h-[62vh] overflow-hidden rounded-md bg-muted/20 touch-none select-none flex items-center justify-center"
                  style={{ cursor: view.s > 1 ? "grab" : "default" }}
                  onWheel={onWheel} onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp}>
                  <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "center center" }}>
                    <div ref={boxRef} className="relative inline-block" data-testid="annotation-box">
                      <PrivateImg src={target.photo} alt={target.title} draggable={false}
                        onLoad={(e) => { const i = e.currentTarget; if (i.naturalHeight) { setAspect(i.naturalWidth / i.naturalHeight); setNaturalW(i.naturalWidth); setFitW(i.offsetWidth); } }}
                        className="block max-h-[60vh] w-auto rounded" />
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                        {lines.map((l) => (
                          <line key={l.id} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
                            onPointerDown={(e) => { if (mode === "edit") { e.stopPropagation(); setSelected(l.id); } }}
                            stroke={REF_COLOR[refOf(l)]} className={mode === "edit" ? "cursor-pointer" : undefined}
                            strokeWidth={selected === l.id ? 3.5 : 2} vectorEffect="non-scaling-stroke"
                            strokeDasharray={l.tool === "vertical" || l.notAssessable ? "6 4" : undefined} />
                        ))}
                      </svg>
                      {mode === "edit" && lines.flatMap((l) => (["a", "b"] as const).map((h) => (
                        <button key={l.id + h} type="button" aria-label={`${REF_LABEL[refOf(l)]} — ponto ${h === "a" ? 1 : 2} (setas movem)`}
                          onPointerDown={(e) => startDrag(e, l.id, h)} onKeyDown={(e) => nudge(e, l.id, h)} onFocus={() => setSelected(l.id)}
                          className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === l.id ? "bg-primary" : "bg-foreground/80"}`}
                          style={{ left: `${l[h].x * 100}%`, top: `${l[h].y * 100}%`, transform: `scale(${1 / view.s})` }} />
                      )))}
                      {lines.filter((l) => l.tool !== "vertical").map((l) => (
                        <span key={l.id + "deg"} className="absolute text-[10px] px-1 rounded bg-background/80 text-foreground pointer-events-none whitespace-nowrap"
                          style={{ left: `${l.b.x * 100}%`, top: `${l.b.y * 100}%`, transform: `scale(${1 / view.s}) translate(6px,-120%)`, transformOrigin: "0 0" }}>
                          {l.notAssessable ? "não avaliável" : `${lineAngleDeg(l, aspect)}°`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Roda do mouse ou pinça para zoom; arraste para mover a imagem ampliada. Valor em graus = ângulo visual da linha na imagem.</p>
                {lines.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(lines.map(refOf))).map((r) => (
                      <span key={r} className="text-[10px] inline-flex items-center gap-1"><span className="w-3 h-0.5 inline-block" style={{ background: REF_COLOR[r] }} />{REF_LABEL[r]}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 text-xs">
                {mode === "view" ? (
                  <>
                    <p className="text-muted-foreground">{target.existing ? `Grau visual: ${DEGREE_LABEL[target.existing.visual_degree]}` : "Sem marcação salva."}</p>
                    {target.existing?.coach_note && (
                      <div className="rounded border border-border/60 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-primary mb-1">Observação do Coach</p>
                        <p className="whitespace-pre-wrap">{target.existing.coach_note}</p>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Button size="sm" onClick={() => setMode("edit")}><PenLine className="w-3.5 h-3.5 mr-1" />{target.existing ? "Editar marcação" : "Anotar foto"}</Button>
                      <Button size="sm" variant="outline" onClick={startExport} disabled={!lines.length}><ImageDown className="w-3.5 h-3.5 mr-1" />Baixar/copiar imagem marcada</Button>
                      <Button size="sm" variant="outline" onClick={() => setDupOpen(true)} disabled={!lines.length}><Copy className="w-3.5 h-3.5 mr-1" />Duplicar marcações para outra foto</Button>
                    </div>
                  </>
                ) : (
                  <>
                    {dupBanner && <p className="rounded border border-primary/50 bg-primary/10 p-2 text-[11px]">Rascunho duplicado: ajuste as linhas sobre esta foto e salve. Nada foi gravado ainda.</p>}
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Adicionar referência</p>
                      <div className="grid grid-cols-1 gap-1">
                        {REFS.map((r) => (
                          <Button key={r} type="button" size="sm" variant={ref === r ? "default" : "outline"} className="h-8 justify-start text-xs" onClick={() => addLine(r)}>
                            <span className="w-3 h-0.5 mr-2 inline-block" style={{ background: REF_COLOR[r] }} />{REF_LABEL[r]}
                          </Button>
                        ))}
                      </div>
                      <p className="text-muted-foreground leading-snug">{REF_HINT[ref]}</p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setHist(historyUndo)} disabled={!hist.past.length}><Undo2 className="w-3.5 h-3.5 mr-1" />Desfazer</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setHist(historyRedo)} disabled={!hist.future.length}><Redo2 className="w-3.5 h-3.5 mr-1" />Refazer</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8" disabled={!lines.length} onClick={() => { commit([]); setSelected(null); }}><Eraser className="w-3.5 h-3.5 mr-1" />Limpar</Button>
                    </div>

                    {sel && (
                      <div className="rounded border border-border/60 p-2 space-y-1.5">
                        <p className="font-medium">{REF_LABEL[refOf(sel)]}</p>
                        <label className="flex items-center gap-2">
                          <Checkbox checked={!!sel.notAssessable} onCheckedChange={(v) => commit(lines.map((l) => (l.id === sel.id ? { ...l, notAssessable: v === true || undefined } : l)))} />
                          Não avaliável (ponto não visível)
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {sel.tool !== "free" && (
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => commit(lines.map((l) => (l.id === sel.id ? toFreeLine(l) : l)))}><Spline className="w-3 h-3 mr-1" />Converter em linha livre</Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { commit(lines.filter((l) => l.id !== sel.id)); setSelected(null); }}><X className="w-3 h-3 mr-1" />Remover</Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Grau visual geral da foto</p>
                      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Grau visual">
                        {(Object.keys(DEGREE_LABEL) as VisualDegree[]).map((d) => (
                          <Button key={d} type="button" size="sm" role="radio" aria-checked={degree === d} variant={degree === d ? "default" : "outline"} className="h-8 text-xs" onClick={() => setDegree(d)}>
                            {DEGREE_LABEL[d]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="coach-photo-note" className="text-[10px] uppercase tracking-wider text-muted-foreground">Observação do Coach (privada)</label>
                      <Textarea id="coach-photo-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-[70px] text-xs" />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending}>
                        {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Salvar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => guard(() => { load({ ...target }); setMode("view"); })}>Cancelar</Button>
                      {target.existing && !dupBanner && (
                        <Button type="button" size="sm" variant="ghost" className="text-destructive ml-auto" onClick={handleDelete} disabled={del.isPending}>
                          <Trash2 className="w-3.5 h-3.5 mr-1" />Apagar
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicar */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Duplicar marcações para outra foto</DialogTitle>
            <DialogDescription className="text-xs">Cria um rascunho na foto destino para você revisar. A origem não muda. Só fotos da mesma pose.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-1">
            {target && candidates.filter((c) => !sameTarget(c, target)).map((c) => {
              const compatible = c.pose === target.pose;
              return (
                <button key={`${c.sourceKind}:${c.sourceId}:${c.pose}`} type="button" disabled={!compatible} onClick={() => duplicateTo(c)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded border border-border/50 hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed">
                  {c.title}{c.existing ? " · já tem marcação (linhas serão somadas)" : ""}{!compatible ? " · pose diferente" : ""}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={dupNote} onCheckedChange={(v) => setDupNote(v === true)} /> Também copiar a observação (revise antes de salvar)
          </label>
        </DialogContent>
      </Dialog>

      {/* Exportar */}
      <Dialog open={!!exportState} onOpenChange={(o) => !o && closeExport()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Prévia da imagem marcada</DialogTitle>
            <DialogDescription className="text-xs">Cópia temporária com linhas e legenda (origem, data, pose). Sem notas nem respostas da aluna. A foto original não muda.</DialogDescription>
          </DialogHeader>
          {exportState?.loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
          {exportState?.error && <p className="text-xs text-destructive">{exportState.error}</p>}
          {exportState?.url && <img src={exportState.url} alt="Prévia da imagem marcada" className="max-h-[55vh] mx-auto rounded" />}
          {exportState?.blob && target && (
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={async () => {
                const ok = await copyImageBlob(exportState.blob!);
                if (ok) toast.success("Imagem copiada");
                else { downloadBlob(exportState.blob!, exportFileName(target.sourceKind, target.date, target.pose)); toast.info("Seu navegador não permite copiar imagem; baixamos o arquivo."); }
              }}><Copy className="w-3.5 h-3.5 mr-1" />Copiar imagem marcada</Button>
              <Button size="sm" onClick={() => downloadBlob(exportState.blob!, exportFileName(target.sourceKind, target.date, target.pose))}><Download className="w-3.5 h-3.5 mr-1" />Baixar imagem marcada</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.desc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className={confirm?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => { const a = confirm?.action; setConfirm(null); a?.(); }}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
