/**
 * ComparisonBoard.tsx
 * "Máquina do tempo": baseline (anamnese) vs último check-in.
 * Deltas com cor verde (progresso) / âmbar (alerta) / muted (estável).
 */

import { Card } from "@/components/ui/card";
import { CHECKIN_METRICS } from "@/lib/checkInSchema";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Anamnesis, CheckIn } from "@/hooks/useStudentData";
import BFDisplay from "@/components/shared/BFDisplay";

interface Props {
  anamnesis: Anamnesis | null;
  latestCheckIn: CheckIn | null;
}

// Quando "menor é melhor" para o aluno (cintura, peso na maioria dos casos)
// Mantemos neutro como padrão e deixamos verde para qualquer mudança "intencional"
function colorFor(delta: number) {
  if (Math.abs(delta) < 0.05) return "text-muted-foreground";
  if (delta < 0) return "text-emerald-400";
  return "text-amber-400";
}

export default function ComparisonBoard({ anamnesis, latestCheckIn }: Props) {
  if (!anamnesis?.baseline_metrics || Object.keys(anamnesis.baseline_metrics).length === 0) {
    return (
      <Card className="bg-card/60 border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Preencha sua <span className="text-primary font-semibold">anamnese</span> para
          ativar o comparativo de evolução.
        </p>
      </Card>
    );
  }

  const anamFotos = (anamnesis?.payload as any)?.fotos as Record<string, string> | undefined;
  const checkFotos = (latestCheckIn?.payload as any)?.fotos as Record<string, string> | undefined;
  const anamFront = anamFotos?.frente || anamFotos?.front || "";
  const checkFront = checkFotos?.frente || checkFotos?.front || latestCheckIn?.photo_url || "";
  const anamBF = (anamnesis?.payload as any)?.body_fat;
  const checkBF = (latestCheckIn?.payload as any)?.body_fat;

  return (
    <>
    {(anamFront || checkFront) && (
      <Card className="bg-card/60 border-border p-4 mb-3">
        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-3 text-center">
          Comparativo Visual — Frente
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {anamFront ? (
              <img src={anamFront} alt="Anamnese — frente" className="w-full aspect-[3/4] object-cover rounded-xl border border-border/40" />
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl border border-dashed border-border/40 flex items-center justify-center text-[10px] text-muted-foreground">Sem foto</div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Partida</span>
              {anamBF != null && <BFDisplay value={anamBF} />}
            </div>
          </div>
          <div className="space-y-2">
            {checkFront ? (
              <img src={checkFront} alt="Check-in — frente" className="w-full aspect-[3/4] object-cover rounded-xl border border-border/40" />
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl border border-dashed border-border/40 flex items-center justify-center text-[10px] text-muted-foreground">Sem check-in</div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Hoje</span>
              {checkBF != null && <BFDisplay value={checkBF} />}
            </div>
          </div>
        </div>
      </Card>
    )}
    <Card className="bg-card/60 border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
          Sua evolução
        </h2>
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
          Partida → Hoje
        </div>
      </div>

      <div className="space-y-2.5">
        {CHECKIN_METRICS.map((m) => {
          const ini = anamnesis.baseline_metrics[m.key];
          const cur = latestCheckIn?.current_metrics?.[m.key];
          const hasBoth = typeof ini === "number" && typeof cur === "number";
          const d = hasBoth ? cur - ini : null;
          const Icon = d == null ? Minus : Math.abs(d) < 0.05 ? Minus : d < 0 ? TrendingDown : TrendingUp;
          const color = d == null ? "text-muted-foreground" : colorFor(d);
          return (
            <div key={m.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span className="text-xs tabular-nums text-foreground/70 w-14 text-right">
                {typeof ini === "number" ? `${ini} ${m.unit}` : "—"}
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground w-16 text-right">
                {typeof cur === "number" ? `${cur} ${m.unit}` : "—"}
              </span>
              <span className={cn("flex items-center gap-1 text-xs font-semibold tabular-nums w-20 justify-end", color)}>
                <Icon className="w-3 h-3" />
                {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`}
              </span>
            </div>
          );
        })}
      </div>

      {!latestCheckIn && (
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Faça seu primeiro check-in para ver a comparação.
        </p>
      )}
    </Card>
    </>
  );
}
