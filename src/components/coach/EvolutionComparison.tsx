/**
 * EvolutionComparison.tsx
 * Comparação completa de evolução do aluno para o coach:
 * - Selectores LEFT/RIGHT para escolher quaisquer 2 pontos (Anamnese + Check-ins).
 * - Regra padrão: RIGHT = check-in mais recente; LEFT = check-in anterior (ou Anamnese se só houver 1).
 * - Compara fotos (4 poses), métricas com delta, e feedback do coach.
 * - [ATUALIZADO] Remoção da galeria e adição de Lightbox (Zoom dinâmico).
 * - Botão para abrir Anamnese exclusiva (com export PDF).
 */
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, TrendingDown, TrendingUp, Minus, FileText, ArrowLeft, ZoomIn } from "lucide-react";
import { CHECKIN_METRICS, colorForDelta } from "@/lib/checkInSchema";
import { estimateBF } from "@/lib/bfEstimate";
import CheckinPayloadAnswers from "@/components/coach/CheckinPayloadAnswers";
import { formatDatePtBR } from "@/lib/formatDate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const POSE_KEYS = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
const POSE_LABEL: Record<string, string> = {
  frente: "Frente", lateral_dir: "Lado Dir.", lateral_esq: "Lado Esq.", costas: "Costas",
};

const EXTRA_METRICS = [
  { key: "body_fat", label: "% Gordura", unit: "%" },
] as const;
const ALL_METRICS = [...CHECKIN_METRICS, ...EXTRA_METRICS];

interface Timepoint {
  id: string;
  kind: "anamnese" | "checkin";
  date: string;
  label: string;
  metrics: Record<string, number | undefined>;
  fotos: Record<string, string>;
  feedback: string | null;
  payload: Record<string, unknown> | null;
}

function fmt(iso: string) {
  return formatDatePtBR(iso);
}

const AnamnesisViewerLazy = lazy(() => import("@/components/anamnesis/AnamnesisViewer"));

export default function EvolutionComparison({
  studentId, studentName,
}: { studentId: string; studentName: string }) {
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<Timepoint[]>([]);
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [anamneseOnly, setAnamneseOnly] = useState(false);
  const [feedbackOnlyId, setFeedbackOnlyId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [activePoseFilter, setActivePoseFilter] = useState<typeof POSE_KEYS[number] | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: anam }, { data: cis }] = await Promise.all([
        sb.from("anamnesis").select("id, submitted_at, baseline_metrics, payload")
          .eq("student_id", studentId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("check_ins").select("id, submitted_at, current_metrics, payload, coach_feedback")
          .eq("student_id", studentId).order("submitted_at", { ascending: false }),
      ]);

      const list: Timepoint[] = [];

      const anamPayload = (anam?.payload || {}) as Record<string, unknown>;
      // O campo salvo na anamnese é "gender" (en-US: "F"/"M"). Mantemos os
      // fallbacks "genero"/"sexo" apenas por compatibilidade com payloads antigos.
      const genero = ((anamPayload.gender as string) || (anamPayload.genero as string) || (anamPayload.sexo as string) || "M");
      const baselineAltura = (anam?.baseline_metrics?.altura as number | undefined) ?? (anamPayload.altura as number | undefined);

      if (anam) {
        const payload = (anam.payload || {}) as Record<string, unknown>;
        const fotos = (payload.fotos as Record<string, string>) || {};
        const metrics = { ...(anam.baseline_metrics || {}) } as Record<string, number | undefined>;
        const bf = estimateBF({
          altura: metrics.altura ?? baselineAltura,
          cintura: metrics.cintura,
          pescoco: metrics.pescoco,
          quadril: metrics.quadril,
          genero,
        });
        if (bf.value != null) metrics.body_fat = bf.value;
        list.push({
          id: `anam-${anam.id}`,
          kind: "anamnese",
          date: anam.submitted_at,
          label: `Anamnese · ${fmt(anam.submitted_at)}`,
          metrics, fotos, feedback: null, payload: payload,
        });
      }

      (cis || []).forEach((c: any, idx: number) => {
        const payload = (c.payload || {}) as Record<string, unknown>;
        const fotos = (payload.fotos as Record<string, string>) || {};
        const metrics = { ...(c.current_metrics || {}) } as Record<string, number | undefined>;
        const bf = estimateBF({
          altura: metrics.altura ?? baselineAltura,
          cintura: metrics.cintura,
          pescoco: metrics.pescoco,
          quadril: metrics.quadril,
          genero,
        });
        if (bf.value != null) metrics.body_fat = bf.value;
        list.push({
          id: `ci-${c.id}`,
          kind: "checkin",
          date: c.submitted_at,
          label: `Feedback ${idx === 0 ? "atual" : `#${(cis.length - idx)}`} · ${fmt(c.submitted_at)}`,
          metrics, fotos, feedback: c.coach_feedback, payload: payload,
        });
      });

      // Order: most recent first, anamnese last (it's baseline)
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "checkin" ? -1 : 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setPoints(list);

      // Defaults: RIGHT = latest checkin; LEFT = previous checkin or anamnese
      const checkins = list.filter((p) => p.kind === "checkin");
      const anamnese = list.find((p) => p.kind === "anamnese");
      const right = checkins[0] || anamnese;
      const left = checkins[1] || anamnese || checkins[0];
      setRightId(right?.id ?? "");
      setLeftId(left?.id && left.id !== right?.id ? left.id : (anamnese?.id ?? checkins[1]?.id ?? ""));

      setLoading(false);
    })();
  }, [studentId]);

  const left = useMemo(() => points.find((p) => p.id === leftId), [points, leftId]);
  const right = useMemo(() => points.find((p) => p.id === rightId), [points, rightId]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  if (anamneseOnly) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setAnamneseOnly(false)} className="h-8 text-xs">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar para comparação
        </Button>
        <Suspense fallback={<div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>}>
          <AnamnesisViewerLazy studentId={studentId} studentName={studentName} />
        </Suspense>
      </div>
    );
  }

  // Modo "ver feedback completo"
  if (feedbackOnlyId) {
    const fb = points.find((p) => p.id === feedbackOnlyId && p.kind === "checkin");
    const checkins = points.filter((p) => p.kind === "checkin");
    if (!fb) {
      setFeedbackOnlyId(null);
      return null;
    }
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setFeedbackOnlyId(null)} className="h-8 text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar para comparação
          </Button>
          <div className="ml-auto min-w-[220px]">
            <Select value={feedbackOnlyId} onValueChange={setFeedbackOnlyId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {checkins.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{fb.label}</p>

          {Object.keys(fb.fotos).length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {POSE_KEYS.map((k) => fb.fotos[k] ? (
                <div key={k} className="aspect-[3/4] rounded-md overflow-hidden border border-border/50 cursor-zoom-in"
                     onClick={() => setZoomedImage(fb.fotos[k])}>
                  <img src={fb.fotos[k]} alt={POSE_LABEL[k]} className="w-full h-full object-cover" />
                </div>
              ) : null)}
            </div>
          )}

          <div className="border-t border-border pt-3 space-y-1">
            {ALL_METRICS.map((m) => {
              const v = toNum(fb.metrics[m.key]);
              return (
                <div key={m.key} className="flex justify-between text-xs py-0.5">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-medium">{v != null ? `${v} ${m.unit}` : "—"}</span>
                </div>
              );
            })}
          </div>

          <CheckinPayloadAnswers payload={fb.payload} />

          {fb.feedback && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-bold uppercase text-primary mb-1">Feedback do Coach</p>
              <p className="text-xs whitespace-pre-wrap text-foreground/85">{fb.feedback}</p>
            </div>
          )}
        </Card>

        {zoomedImage && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out backdrop-blur-sm"
            onClick={() => setZoomedImage(null)}
          >
            <img src={zoomedImage} alt="Zoom" className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
          </div>
        )}
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Sem anamnese ou check-ins registrados.
      </Card>
    );
  }

  if (!left || !right) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Selecione dois períodos para comparar.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controles topo */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAnamneseOnly(true)}>
          <FileText className="w-3.5 h-3.5 mr-1.5" /> Ver Anamnese Completa
        </Button>
        {points.some((p) => p.kind === "checkin") && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const latest = points.find((p) => p.kind === "checkin");
              if (latest) setFeedbackOnlyId(latest.id);
            }}
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Ver Feedback Completo
          </Button>
        )}
      </div>

      {/* Seletores de comparação */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Comparar com</p>
          <Select value={leftId} onValueChange={setLeftId}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {points.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Atual / Referência</p>
          <Select value={rightId} onValueChange={setRightId}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {points.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fotos por pose — cada linha = 1 pose, cada coluna = 1 ponto */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> Clique para ampliar
          </p>
          <div className="flex flex-wrap gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setActivePoseFilter(null)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${activePoseFilter === null ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary hover:text-primary"}`}
            >
              Todas
            </button>
            {POSE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setActivePoseFilter(activePoseFilter === k ? null : k)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${activePoseFilter === k ? "bg-primary text-primary-foreground border-primary" : "border-border/50 text-muted-foreground hover:border-primary hover:text-primary"}`}
              >
                {POSE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {POSE_KEYS.filter((k) => activePoseFilter === null || activePoseFilter === k).map((k) => (
            <div key={k}>
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1.5">{POSE_LABEL[k]}</p>
              <div className="grid grid-cols-2 gap-2">
                {[left, right].map((point, pi) => (
                  <div key={pi} className="space-y-1">
                    <p className="text-[9px] text-center text-muted-foreground">{point.label}</p>
                    <div
                      className="aspect-[3/4] rounded-md border border-border/50 overflow-hidden bg-muted/20 flex items-center justify-center cursor-zoom-in"
                      onClick={() => point.fotos[k] && setZoomedImage(point.fotos[k])}
                    >
                      {point.fotos[k] ? (
                        <img src={point.fotos[k]} alt={POSE_LABEL[k]} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[9px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Métricas */}
      <Card className="p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Medidas</p>
        <div className="space-y-1">
          {ALL_METRICS.map((m) => {
            const a = toNum(left.metrics[m.key]);
            const b = toNum(right.metrics[m.key]);
            const hasBoth = a != null && b != null;
            const d = hasBoth ? (b as number) - (a as number) : null;
            const Icon = d == null ? Minus : Math.abs(d) < 0.05 ? Minus : d < 0 ? TrendingDown : TrendingUp;
            const color = colorForDelta(d);
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="text-xs tabular-nums text-foreground/70 w-20 text-right">{a != null ? `${a} ${m.unit}` : "—"}</span>
                <span className="text-sm font-semibold tabular-nums w-20 text-right">{b != null ? `${b} ${m.unit}` : "—"}</span>
                <span className={`flex items-center gap-1 text-xs font-semibold w-16 justify-end ${color}`}>
                  <Icon className="w-3 h-3" />
                  {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Feedback texts */}
      {(left.feedback || right.feedback) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-xs">
            <p className="text-[10px] uppercase font-bold text-primary mb-1">{left.kind === "anamnese" ? "Anamnese" : "Feedback anterior"}</p>
            <p className="whitespace-pre-wrap text-foreground/85">{left.feedback || (left.kind === "anamnese" ? "—" : "—")}</p>
          </Card>
          <Card className="p-3 text-xs">
            <p className="text-[10px] uppercase font-bold text-primary mb-1">{right.kind === "anamnese" ? "Anamnese" : "Feedback atual"}</p>
            <p className="whitespace-pre-wrap text-foreground/85">{right.feedback || "—"}</p>
          </Card>
        </div>
      )}

      {/* Lightbox Modal (Zoom Fullscreen) */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out backdrop-blur-sm transition-opacity"
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="Zoom Visualização" className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">Clique para fechar</p>
        </div>
      )}
    </div>
  );
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}
