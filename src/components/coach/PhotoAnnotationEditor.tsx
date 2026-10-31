import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import { Loader2, Minus as HLine, MoveVertical, Slash, Undo2, Trash2, Eraser, X, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PrivateImg } from "@/components/coach/PrivacyMode";
import {
  DEGREE_LABEL, TOOL_HINT, TOOL_LABEL, createLine, lineAngleDeg, moveHandle, toNormalized,
  type AnnotationLine, type AnnotationTool, type PhotoAnnotationRow, type PhotoPose, type PhotoSourceKind, type VisualDegree,
} from "@/lib/photoAnnotations";
import { useDeletePhotoAnnotation, useSavePhotoAnnotation } from "@/hooks/usePhotoAnnotations";

const LINE_CLASS: Record<AnnotationTool, string> = {
  horizontal: "stroke-primary",
  vertical: "stroke-accent-foreground",
  free: "stroke-foreground",
};

/**
 * Overlay somente-leitura para miniaturas com `object-cover`.
 * `preserveAspectRatio="xMidYMid slice"` reproduz exatamente o recorte do object-cover,
 * então as coordenadas normalizadas continuam sobre o mesmo ponto da foto.
 */
export function AnnotationOverlay({ lines, natural }: { lines: AnnotationLine[]; natural: { w: number; h: number } | null }) {
  if (!lines.length || !natural) return null;
  const { w, h } = natural;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {lines.map((l) => (
        <line key={l.id} x1={l.a.x * w} y1={l.a.y * h} x2={l.b.x * w} y2={l.b.y * h}
          className={LINE_CLASS[l.tool]} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={l.tool === "vertical" ? "6 4" : undefined} />
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
  title: string;
  existing: PhotoAnnotationRow | null;
}

export function PhotoAnnotationEditor({ target, onClose }: { target: AnnotationTarget | null; onClose: () => void }) {
  const [lines, setLines] = useState<AnnotationLine[]>([]);
  const [history, setHistory] = useState<AnnotationLine[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("horizontal");
  const [degree, setDegree] = useState<VisualDegree>("not_assessable");
  const [note, setNote] = useState("");
  const [aspect, setAspect] = useState(0.75);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; handle: "a" | "b" } | null>(null);
  const save = useSavePhotoAnnotation();
  const del = useDeletePhotoAnnotation();

  useEffect(() => {
    if (!target) return;
    setLines(target.existing?.annotations ?? []);
    setDegree(target.existing?.visual_degree ?? "not_assessable");
    setNote(target.existing?.coach_note ?? "");
    setHistory([]);
    setSelected(null);
  }, [target]);

  const commit = (next: AnnotationLine[]) => { setHistory((h) => [...h.slice(-30), lines]); setLines(next); };

  const addLine = (t: AnnotationTool) => {
    setTool(t);
    const l = createLine(t);
    commit([...lines, l]);
    setSelected(l.id);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !boxRef.current) return;
    const p = toNormalized(e.clientX, e.clientY, boxRef.current.getBoundingClientRect());
    const { id, handle } = drag.current;
    setLines((ls) => ls.map((l) => (l.id === id ? moveHandle(l, handle, p) : l)));
  };

  const startDrag = (e: PointerEvent, id: string, handle: "a" | "b") => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setHistory((h) => [...h.slice(-30), lines]);
    drag.current = { id, handle };
    setSelected(id);
  };

  const nudge = (e: KeyboardEvent, id: string, handle: "a" | "b") => {
    const step = e.shiftKey ? 0.02 : 0.005;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as [number, number] | undefined;
    if (!d) return;
    e.preventDefault();
    const l = lines.find((x) => x.id === id);
    if (!l) return;
    commit(lines.map((x) => (x.id === id ? moveHandle(x, handle, { x: l[handle].x + d[0], y: l[handle].y + d[1] }) : x)));
  };

  const undo = () => setHistory((h) => { if (!h.length) return h; setLines(h[h.length - 1]); return h.slice(0, -1); });

  const handleSave = async () => {
    if (!target) return;
    try {
      await save.mutateAsync({ studentId: target.studentId, sourceKind: target.sourceKind, sourceId: target.sourceId, pose: target.pose, annotations: lines, visualDegree: degree, coachNote: note });
      toast.success("Marcação salva");
      onClose();
    } catch (err: any) {
      toast.error("Não foi possível salvar", { description: err?.message });
    }
  };

  const handleDelete = async () => {
    if (!target?.existing) return;
    try {
      await del.mutateAsync({ id: target.existing.id, studentId: target.studentId });
      toast.success("Marcação apagada");
      onClose();
    } catch (err: any) {
      toast.error("Não foi possível apagar", { description: err?.message });
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Anotar foto · {target?.title}</DialogTitle>
          <DialogDescription className="text-xs">Linhas de referência visual, privadas do Coach. Não é diagnóstico.</DialogDescription>
        </DialogHeader>

        {target && (
          <div className="grid md:grid-cols-[1fr_240px] gap-4">
            <div className="flex justify-center bg-muted/20 rounded-md p-2">
              <div ref={boxRef} className="relative inline-block touch-none select-none" onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
                <PrivateImg src={target.photo} alt={target.title} draggable={false}
                  onLoad={(e) => { const i = e.currentTarget; if (i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }}
                  className="block max-h-[60vh] w-auto rounded" />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {lines.map((l) => (
                    <line key={l.id} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} onPointerDown={() => setSelected(l.id)}
                      className={`${LINE_CLASS[l.tool]} cursor-pointer`} strokeWidth={selected === l.id ? 3 : 2}
                      vectorEffect="non-scaling-stroke" strokeDasharray={l.tool === "vertical" ? "6 4" : undefined} />
                  ))}
                </svg>
                {lines.flatMap((l) => (["a", "b"] as const).map((h) => (
                  <button key={l.id + h} type="button" aria-label={`${TOOL_LABEL[l.tool]} — ponto ${h === "a" ? 1 : 2} (use as setas para mover)`}
                    onPointerDown={(e) => startDrag(e, l.id, h)} onKeyDown={(e) => nudge(e, l.id, h)} onFocus={() => setSelected(l.id)}
                    className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === l.id ? "bg-primary" : "bg-foreground/80"}`}
                    style={{ left: `${l[h].x * 100}%`, top: `${l[h].y * 100}%` }} />
                )))}
                {lines.filter((l) => l.tool !== "vertical").map((l) => (
                  <span key={l.id + "deg"} className="absolute text-[10px] px-1 rounded bg-background/80 text-foreground pointer-events-none"
                    style={{ left: `${l.b.x * 100}%`, top: `${l.b.y * 100}%`, transform: "translate(6px,-120%)" }}>
                    {lineAngleDeg(l, aspect)}°
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Adicionar linha</p>
                <div className="grid grid-cols-3 gap-1">
                  {([["horizontal", HLine], ["vertical", MoveVertical], ["free", Slash]] as const).map(([t, Icon]) => (
                    <Button key={t} type="button" size="sm" variant={tool === t ? "default" : "outline"} className="h-9" onClick={() => addLine(t)} aria-label={TOOL_LABEL[t]} title={TOOL_LABEL[t]}>
                      <Icon className="w-4 h-4" />
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground leading-snug">{TOOL_HINT[tool]}</p>
              </div>

              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={undo} disabled={!history.length}><Undo2 className="w-3.5 h-3.5 mr-1" />Desfazer</Button>
                <Button type="button" size="sm" variant="outline" className="h-8" disabled={!selected} onClick={() => { commit(lines.filter((l) => l.id !== selected)); setSelected(null); }}><X className="w-3.5 h-3.5 mr-1" />Remover</Button>
                <Button type="button" size="sm" variant="outline" className="h-8" disabled={!lines.length} onClick={() => { commit([]); setSelected(null); }}><Eraser className="w-3.5 h-3.5 mr-1" />Limpar</Button>
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Grau visual</p>
                <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Grau visual">
                  {(Object.keys(DEGREE_LABEL) as VisualDegree[]).map((d) => (
                    <Button key={d} type="button" size="sm" role="radio" aria-checked={degree === d} variant={degree === d ? "default" : "outline"} className="h-8 text-xs" onClick={() => setDegree(d)}>
                      {DEGREE_LABEL[d]}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground leading-snug">Se a foto, roupa ou pose não permitir identificar, escolha “Não avaliável”.</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="coach-photo-note" className="text-[10px] uppercase tracking-wider text-muted-foreground">Nota do Coach (opcional)</label>
                <Textarea id="coach-photo-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="min-h-[70px] text-xs" />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" onClick={handleSave} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
                {target.existing && (
                  <Button type="button" size="sm" variant="ghost" className="text-destructive ml-auto" onClick={handleDelete} disabled={del.isPending}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" />Apagar
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PhotoAnnotationEditor;
