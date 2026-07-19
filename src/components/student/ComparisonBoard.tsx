/**
 * ComparisonBoard.tsx
 * "Máquina do tempo": baseline (anamnese) vs último check-in.
 * Deltas com cor verde (progresso) / âmbar (alerta) / muted (estável).
 */

import { Card } from "@/components/ui/card";
import { CHECKIN_METRICS, colorForDelta } from "@/lib/checkInSchema";
import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Anamnesis, CheckIn } from "@/hooks/useStudentData";
import BFDisplay from "@/components/shared/BFDisplay";
import { estimateBF } from "@/lib/bfEstimate";

interface Props {
  anamnesis: Anamnesis | null;
  latestCheckIn: CheckIn | null;
}

// A decisão de cor foi centralizada em colorForDelta (checkInSchema.ts) —
// mantemos "menor_melhor" como polaridade padrão para este board, que era o
// comportamento anterior (delta negativo = verde; positivo = âmbar).

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
  const anamPayload = (anamnesis?.payload as any) || {};
  // O campo salvo na anamnese é "gender" (en-US: "F"/"M"). Mantemos os
  // fallbacks "genero"/"sexo" apenas por compatibilidade com payloads antigos.
  const genero = (anamPayload.gender as string) || (anamPayload.genero as string) || (anamPayload.sexo as string) || "M";
  const baseline = anamnesis?.baseline_metrics || {};
  const current = latestCheckIn?.current_metrics || {};
  const anamBF = estimateBF({
    altura: baseline.altura ?? anamPayload.altura,
    cintura: baseline.cintura ?? anamPayload.cintura,
    pescoco: baseline.pescoco ?? anamPayload.pescoco,
    quadril: baseline.quadril ?? anamPayload.quadril,
    genero,
  });
  const checkBF = estimateBF({
    altura: baseline.altura ?? anamPayload.altura,
    cintura: current.cintura,
    pescoco: current.pescoco,
    quadril: current.quadril,
    genero,
  });

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
              {anamBF.value != null ? <BFDisplay value={anamBF.value} /> : <span className="text-muted-foreground">—</span>}
            </div>
            {anamBF.value == null && anamBF.missing.length > 0 && (
              <p className="text-[10px] text-amber-500">Faltam: {anamBF.missing.join(", ")}</p>
            )}
          </div>
          <div className="space-y-2">
            {checkFront ? (
              <img src={checkFront} alt="Check-in — frente" className="w-full aspect-[3/4] object-cover rounded-xl border border-border/40" />
            ) : (
              <div className="w-full aspect-[3/4] rounded-xl border border-dashed border-border/40 flex items-center justify-center text-[10px] text-muted-foreground">Sem check-in</div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Hoje</span>
              {checkBF.value != null ? <BFDisplay value={checkBF.value} /> : <span className="text-muted-foreground">—</span>}
            </div>
            {checkBF.value == null && checkBF.missing.length > 0 && latestCheckIn && (
              <p className="text-[10px] text-amber-500">Faltam: {checkBF.missing.join(", ")}</p>
            )}
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
          const color = colorForDelta(d);
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
