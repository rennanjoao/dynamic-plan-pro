/**
 * ProgressDashboard.tsx
 *
 * Estimativa de %BF baseada em medidas reais:
 *   pescoço, cintura, quadril (F) e altura.
 *   Se o aluno digitou body_fat na anamnese/check-in, usa o valor real.
 *   Sem dados suficientes → retorna null (UI mostra "—").
 */

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, TooltipProps, LabelList,
} from "recharts";
import { useStudentData } from "@/hooks/useStudentData";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDown, TrendingUp, Flame, Scale, Percent, Ruler } from "lucide-react";

type MetricKey = "peso" | "gordura" | "cintura";

interface Point {
  idx: number;
  label: string;
  dateFull: string;
  peso: number;
  gordura: number | null;
  cintura: number;
}

const METRIC_META: Record<MetricKey, { label: string; unit: string; icon: typeof Scale; color: string }> = {
  peso:    { label: "Peso",    unit: "kg", icon: Scale,   color: "hsl(var(--primary))" },
  gordura: { label: "Gordura", unit: "%",  icon: Percent, color: "hsl(var(--primary))" },
  cintura: { label: "Cintura", unit: "cm", icon: Ruler,   color: "hsl(var(--primary))" },
};

/**
 * Estimativa de %BF.
 * Prioridade:
 *   1. body_fat digitado pelo aluno (valor real medido).
 *   2. Fórmula com pescoço/cintura/quadril/altura.
 * Retorna null quando não há dados suficientes.
 */
function estimateBF(params: {
  altura: number;
  cintura: number;
  pescoco: number;
  quadril?: number;
  genero: string;
  bodyFatRaw?: number;
}): number | null {
  const { altura, cintura, pescoco, quadril, genero, bodyFatRaw } = params;

  if (bodyFatRaw && bodyFatRaw > 2 && bodyFatRaw < 60) {
    return Math.round(bodyFatRaw * 10) / 10;
  }

  if (!altura || altura < 100 || !cintura || cintura < 40 || !pescoco || pescoco < 20) {
    return null;
  }

  const isF = (genero || "").toUpperCase().startsWith("F");
  let bf: number;

  if (isF) {
    if (!quadril || quadril < 60) return null;
    const inner = cintura + quadril - pescoco;
    if (inner <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.22100 * Math.log10(altura)) - 450;
  } else {
    const inner = cintura - pescoco;
    if (inner <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(altura)) - 450;
  }

  if (!isFinite(bf)) return null;
  bf = Math.min(60, Math.max(isF ? 10 : 2, bf));
  return Math.round(bf * 10) / 10;
}

const fmt = (v: number, unit: string) => `${v.toFixed(1)} ${unit}`;

interface DeltaProps { delta: number; unit: string; goodDown?: boolean; }
const DeltaBadge = ({ delta, unit, goodDown = true }: DeltaProps) => {
  if (!isFinite(delta) || delta === 0) return <span className="text-xs text-muted-foreground">sem alteração</span>;
  const isPositive = delta > 0;
  const isGood = goodDown ? !isPositive : isPositive;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isGood ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"}`}>
      <Icon className="w-3 h-3" />
      {isPositive ? "+" : ""}{delta.toFixed(1)} {unit}
    </span>
  );
};

interface SummaryCardProps { icon: typeof Scale; label: string; value: string; delta?: React.ReactNode; accent?: string; }
const SummaryCard = ({ icon: Icon, label, value, delta, accent }: SummaryCardProps) => (
  <Card className="bg-card/60 border-border/60 backdrop-blur">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${accent ?? ""}`} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground mt-2 leading-none">{value}</p>
      {delta && <div className="mt-2">{delta}</div>}
    </CardContent>
  </Card>
);

const CustomTooltip = ({ active, payload, metric }: TooltipProps<number, string> & { metric: MetricKey }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point & { delta: number };
  const meta = METRIC_META[metric];
  const val = p[metric];
  const isGood = p.delta <= 0;
  return (
    <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground">Check-in {p.idx} <span className="text-muted-foreground font-normal">· {p.dateFull}</span></p>
      <p className="text-foreground mt-1">{meta.label}: <span className="font-bold">{fmt(val, meta.unit)}</span></p>
      {p.idx > 1 && isFinite(p.delta) && p.delta !== 0 && (
        <p className={`mt-0.5 ${isGood ? "text-emerald-400" : "text-primary"}`}>
          {p.delta > 0 ? "▲ +" : "▼ "}{p.delta.toFixed(1)} {meta.unit} vs. anterior
        </p>
      )}
    </div>
  );
};

export const ProgressDashboard = () => {
  const { anamnesis, checkIns, loading } = useStudentData();
  const [metric, setMetric] = useState<MetricKey>("peso");

  const points = useMemo<Point[]>(() => {
    const baseline = anamnesis?.baseline_metrics || {};
    const payloadAna = (anamnesis?.payload as Record<string, unknown>) || {};
    const altura = Number(baseline.altura || payloadAna.altura || 0);
    const genero = (payloadAna.genero as string) || (payloadAna.sexo as string) || "M";

    const raw: Array<Point & { ts: number }> = [];

    if (anamnesis?.submitted_at && baseline.peso) {
      const cintura = Number(baseline.cintura || 0);
      const quadril = Number(baseline.quadril || payloadAna.quadril || 0);
      const pescoco = Number(baseline.pescoco || payloadAna.pescoco || 0);
      const bodyFatRaw = Number(payloadAna.body_fat || 0);
      raw.push({
        idx: 0,
        ts: new Date(anamnesis.submitted_at).getTime(),
        label: new Date(anamnesis.submitted_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        dateFull: new Date(anamnesis.submitted_at).toLocaleDateString("pt-BR"),
        peso: Number(baseline.peso),
        cintura,
        gordura: estimateBF({ altura, cintura, pescoco, quadril, genero, bodyFatRaw }),
      });
    }

    (checkIns || []).forEach((chk) => {
      if (!chk.current_metrics || !chk.submitted_at) return;
      const peso = Number(chk.current_metrics.peso || 0);
      if (!peso) return;
      const cintura = Number(chk.current_metrics.cintura || 0);
      const quadril = Number(chk.current_metrics.quadril || 0);
      const pescoco = Number(chk.current_metrics.pescoco || 0);
      const chkPayload = (chk.payload as Record<string, unknown>) || {};
      const bodyFatRaw = Number(chkPayload.body_fat || 0);
      raw.push({
        idx: 0,
        ts: new Date(chk.submitted_at).getTime(),
        label: new Date(chk.submitted_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        dateFull: new Date(chk.submitted_at).toLocaleDateString("pt-BR"),
        peso,
        cintura,
        gordura: estimateBF({ altura, cintura, pescoco, quadril, genero, bodyFatRaw }),
      });
    });

    return raw
      .sort((a, b) => a.ts - b.ts)
      .slice(-14)
      .map((p, i) => ({ ...p, idx: i + 1 }));
  }, [anamnesis, checkIns]);

  const chartData = useMemo(() => {
    return points.map((p, i) => ({
      ...p,
      delta:
        i === 0
          ? 0
          : ((p[metric] ?? 0) as number) - ((points[i - 1][metric] ?? 0) as number),
    }));
  }, [points, metric]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return ["auto", "auto"] as [number | string, number | string];
    const values = chartData
      .map((d) => d[metric])
      .filter((v): v is number => typeof v === "number" && isFinite(v));
    if (values.length === 0) return ["auto", "auto"] as [number | string, number | string];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = Math.max(range * 1.5, 1.5);
    return [parseFloat((min - padding).toFixed(1)), parseFloat((max + padding).toFixed(1))] as [number, number];
  }, [chartData, metric]);

  const activeColor = useMemo(() => {
    if (chartData.length < 2) return "hsl(var(--primary))";
    const last = chartData[chartData.length - 1][metric];
    const first = chartData[0][metric];
    if (typeof last !== "number" || typeof first !== "number") return "hsl(var(--primary))";
    const delta = last - first;
    const isImproving = metric === "gordura" || metric === "cintura" ? delta < 0 : delta < 0;
    return isImproving ? "hsl(142 71% 45%)" : "hsl(var(--primary))";
  }, [chartData, metric]);

  const streak = useMemo(() => {
    const sorted = [...(checkIns || [])]
      .filter((c) => c.submitted_at)
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    if (sorted.length === 0) return 0;
    let count = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const diffDays = (new Date(sorted[i].submitted_at).getTime() - new Date(sorted[i + 1].submitted_at).getTime()) / 86_400_000;
      if (diffDays <= 21) count++;
      else break;
    }
    return count;
  }, [checkIns]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <Card className="bg-card/60 border-border/60">
        <CardContent className="p-8 text-center">
          <Scale className="w-10 h-10 text-primary/60 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">Sem dados ainda</h3>
          <p className="text-sm text-muted-foreground mt-1">Envie sua Anamnese para iniciar a linha do tempo.</p>
        </CardContent>
      </Card>
    );
  }

  if (points.length < 2) {
    return (
      <Card className="bg-card/60 border-border/60">
        <CardContent className="p-6 text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Aguardando 1º check-in</p>
          <p className="text-xs text-muted-foreground">
            Seu baseline está registrado. Envie um check-in para ver sua evolução no gráfico.
          </p>
        </CardContent>
      </Card>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const deltaPeso = last.peso - first.peso;
  const hasBF = typeof last.gordura === "number" && typeof first.gordura === "number";
  const deltaGordura = hasBF ? (last.gordura as number) - (first.gordura as number) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={Scale} label="Peso atual" value={fmt(last.peso, "kg")} accent="text-primary"
          delta={<DeltaBadge delta={deltaPeso} unit="kg" />} />
        <SummaryCard
          icon={Percent}
          label="Gordura estimada"
          value={typeof last.gordura === "number" ? `${last.gordura.toFixed(1)}%` : "—"}
          accent="text-primary"
          delta={
            hasBF ? (
              <div className="flex items-center gap-1.5">
                <DeltaBadge delta={deltaGordura} unit="%" />
                <span className="text-[10px] text-muted-foreground">vs. início</span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                Informe pescoço, cintura e altura
              </span>
            )
          }
        />
        <SummaryCard icon={Flame} label="Sequência" value={`🔥 ${streak}`} accent="text-primary"
          delta={<span className="text-[10px] text-muted-foreground">
            {streak === 0 ? "Faça seu 1º check-in" : streak === 1 ? "quinzena registrada" : "quinzenas seguidas"}
          </span>} />
      </div>

      <Card className="bg-card/60 border-border/60">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Linha do tempo</h3>
              <p className="text-[11px] text-muted-foreground">
                {points.length} registro{points.length > 1 ? "s" : ""} · últimos 14
              </p>
            </div>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
              <TabsList className="grid grid-cols-3 h-9">
                <TabsTrigger value="peso"    className="text-xs">Peso</TabsTrigger>
                <TabsTrigger value="gordura" className="text-xs">Gordura</TabsTrigger>
                <TabsTrigger value="cintura" className="text-xs">Cintura</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeColor} stopOpacity={0.2} />
                    <stop offset="85%" stopColor={activeColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis hide domain={yDomain as [number, number]} />
                <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ stroke: activeColor, strokeOpacity: 0.3, strokeWidth: 1 }} />
                <Area
                  type="monotoneX" dataKey={metric} stroke={activeColor} strokeWidth={2}
                  fill="url(#gradMetric)" isAnimationActive animationDuration={500}
                  dot={(props: unknown) => {
                    const { cx, cy, index } = props as { cx: number; cy: number; index: number };
                    const isLast = index === chartData.length - 1;
                    return (
                      <circle key={`dot-${index}`} cx={cx} cy={cy} r={isLast ? 6 : 4}
                        fill={isLast ? activeColor : "hsl(var(--background))"}
                        stroke={activeColor} strokeWidth={isLast ? 0 : 2} />
                    );
                  }}
                  activeDot={{ r: 7, fill: activeColor, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                >
                  <LabelList dataKey={metric} position="top"
                    style={{ fontSize: "10px", fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
                    formatter={(v: number) => v.toFixed(1)} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProgressDashboard;
