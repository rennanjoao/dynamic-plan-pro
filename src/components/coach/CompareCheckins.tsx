/**
 * CompareCheckins.tsx — Compara os 2 check-ins mais recentes do aluno.
 * Renderizado dentro do Sheet "Anamnese & Feedback" do ProtocolBuilder.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { CHECKIN_METRICS } from "@/lib/checkInSchema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface CI {
  id: string;
  submitted_at: string;
  current_metrics: Record<string, number> | null;
  payload: Record<string, unknown> | null;
  coach_feedback: string | null;
  photo_url: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function getFront(ci: CI | undefined) {
  if (!ci) return null;
  const fotos = (ci.payload as any)?.fotos as Record<string, string> | undefined;
  return fotos?.frente || fotos?.front || ci.photo_url || null;
}

export default function CompareCheckins({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CI[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await sb
        .from("check_ins")
        .select("id, submitted_at, current_metrics, payload, coach_feedback, photo_url")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false })
        .limit(2);
      setItems((data || []) as CI[]);
      setLoading(false);
    })();
  }, [studentId]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  if (items.length < 2) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        São necessários ao menos 2 check-ins para comparação.
      </Card>
    );
  }

  const [latest, previous] = items;
  const frontLatest = getFront(latest);
  const frontPrev = getFront(previous);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
        <div>Anterior · {fmtDate(previous.submitted_at)}</div>
        <div>Atual · {fmtDate(latest.submitted_at)}</div>
      </div>

      {(frontLatest || frontPrev) && (
        <div className="grid grid-cols-2 gap-3">
          {[frontPrev, frontLatest].map((src, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg border border-border/50 overflow-hidden bg-muted/20 flex items-center justify-center">
              {src ? <img src={src} alt="" className="w-full h-full object-cover" /> :
                <span className="text-[10px] text-muted-foreground">Sem foto</span>}
            </div>
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="space-y-2">
          {CHECKIN_METRICS.map((m) => {
            const prev = previous.current_metrics?.[m.key];
            const cur = latest.current_metrics?.[m.key];
            const hasBoth = typeof prev === "number" && typeof cur === "number";
            const d = hasBoth ? (cur as number) - (prev as number) : null;
            const Icon = d == null ? Minus : Math.abs(d) < 0.05 ? Minus : d < 0 ? TrendingDown : TrendingUp;
            const color = d == null ? "text-muted-foreground" :
              Math.abs(d) < 0.05 ? "text-muted-foreground" :
              d < 0 ? "text-emerald-500" : "text-amber-500";
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="text-xs tabular-nums text-foreground/70 w-16 text-right">{typeof prev === "number" ? `${prev} ${m.unit}` : "—"}</span>
                <span className="text-sm font-semibold tabular-nums w-16 text-right">{typeof cur === "number" ? `${cur} ${m.unit}` : "—"}</span>
                <span className={`flex items-center gap-1 text-xs font-semibold w-16 justify-end ${color}`}>
                  <Icon className="w-3 h-3" />
                  {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {(latest.coach_feedback || previous.coach_feedback) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-xs">
            <p className="text-[10px] uppercase font-bold text-primary mb-1">Feedback anterior</p>
            <p className="whitespace-pre-wrap text-foreground/85">{previous.coach_feedback || "—"}</p>
          </Card>
          <Card className="p-3 text-xs">
            <p className="text-[10px] uppercase font-bold text-primary mb-1">Feedback atual</p>
            <p className="whitespace-pre-wrap text-foreground/85">{latest.coach_feedback || "—"}</p>
          </Card>
        </div>
      )}
    </div>
  );
}