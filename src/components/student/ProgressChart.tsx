import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStudentData } from "@/hooks/useStudentData";
import { TrendingUp, Loader2 } from "lucide-react";
import { colorForDelta, weightPolarityForGoal, type MetricPolarity } from "@/lib/checkInSchema";
import { buildProgressSeries, PROGRESS_METRICS, type ProgressMetric } from "@/lib/progressSeries";
import { cn } from "@/lib/utils";

export const ProgressChart = ({ studentId }: { studentId?: string } = {}) => {
  const { anamnesis, checkIns, goal, loading } = useStudentData(studentId);
  const [metric, setMetric] = useState<ProgressMetric>("peso");

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 flex justify-center items-center h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Data de ENVIO de cada check-in (não a da última edição) e ponto de
  // partida (anamnese) sempre presente — ver lib/progressSeries.ts.
  const chartData = buildProgressSeries({
    anamnesis: anamnesis as never,
    checkIns: checkIns as never,
    metric,
  });
  const meta = PROGRESS_METRICS.find((m) => m.key === metric)!;

  const selector = (
    <div className="flex flex-wrap gap-1.5 mb-4" role="group" aria-label="Medida no gráfico">
      {PROGRESS_METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => setMetric(m.key)}
          aria-pressed={metric === m.key}
          className={cn(
            "text-xs px-3 py-1.5 rounded-full border transition-colors",
            metric === m.key
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  if (chartData.length === 0) {
    return (
      <div className="glass rounded-2xl p-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Evolução de Medidas</h2>
        </div>
        {selector}
        <p className="text-muted-foreground text-center py-8">
          {metric === "peso"
            ? "Aguardando o envio da Anamnese para inicializar a linha de base temporal."
            : `Ainda não há medida de ${meta.label.toLowerCase()} registrada.`}
        </p>
      </div>
    );
  }

  // Sempre a medida mais recente contra o primeiro ponto (anamnese, quando há)
  // — progresso total desde o início, coerente com o "Partida → Hoje".
  const ultima = chartData[chartData.length - 1];
  const primeira = chartData[0];
  const mudanca = Number((ultima.value - primeira.value).toFixed(1));
  const desdeLabel = primeira.isBaseline ? "desde a anamnese" : `desde ${primeira.date}`;

  const primeiraGordura = chartData.find((p) => p.gordura !== null);
  const ultimaGordura = [...chartData].reverse().find((p) => p.gordura !== null);
  const mudancaGordura =
    ultimaGordura && primeiraGordura ? Number((ultimaGordura.gordura! - primeiraGordura.gordura!).toFixed(1)) : null;

  // Peso segue o objetivo; cintura/quadril: menor é melhor (padrão do app);
  // braço/coxa: neutro (crescer pode ser o objetivo).
  const polarity: MetricPolarity =
    metric === "peso" ? weightPolarityForGoal(goal) : metric === "cintura" || metric === "quadril" ? "menor_melhor" : "neutro";

  const data = chartData.map((p) => ({ date: p.date, valor: p.value, gordura: p.gordura }));

  return (
    <div className="glass rounded-2xl p-8">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Evolução de Medidas</h2>
      </div>
      {selector}

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gradientPeso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(350, 100%, 60%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(350, 100%, 60%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradientGordura" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(220, 89%, 50%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(220, 89%, 50%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="hsl(var(--muted-foreground))" fontSize={12} width={35} />
          {metric === "peso" && (
            <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} stroke="hsl(var(--muted-foreground))" fontSize={12} width={35} />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              backdropFilter: "blur(16px)",
            }}
          />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="valor"
            name={metric === "peso" ? "Peso (kg)" : `${meta.label} (${meta.unit})`}
            stroke="hsl(var(--primary-light))"
            fill="url(#gradientPeso)"
            strokeWidth={2}
          />
          {metric === "peso" && (
            <Area yAxisId="right" type="monotone" dataKey="gordura" name="% Gordura Est." stroke="#3b82f6" fill="url(#gradientGordura)" strokeWidth={2} />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {metric === "peso" && (
        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          * O % de Gordura Estimada é calculado pela fórmula US Navy com base nas medidas informadas (cintura, pescoço e quadril).
          Trata-se de uma estimativa e pode apresentar variações devido à individualidade biológica. Não substitui avaliação profissional.
        </p>
      )}
      {metric === "braco" && (
        <p className="mt-3 text-[11px] text-muted-foreground">Braço contraído (média direito/esquerdo); sem ele, o relaxado.</p>
      )}

      <div className={cn("mt-6 grid gap-4", metric === "peso" ? "grid-cols-2" : "grid-cols-1")}>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {metric === "peso" ? "Mudança de Peso" : `Mudança de ${meta.label}`}
          </p>
          <p className={`text-2xl font-bold mt-1 ${colorForDelta(mudanca, polarity)}`} data-testid="progress-delta">
            {mudanca > 0 ? '+' : ''}{mudanca.toFixed(1)} {meta.unit}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{desdeLabel}</p>
        </div>
        {metric === "peso" && (
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Gordura Estimada</p>
            <p className={`text-2xl font-bold mt-1 ${colorForDelta(mudancaGordura)}`}>
              {mudancaGordura != null ? `${mudancaGordura > 0 ? '+' : ''}${mudancaGordura.toFixed(1)}%` : '—'}
            </p>
            {!ultimaGordura && (
              <p className="text-[11px] text-muted-foreground mt-1">Informe cintura e pescoço nos check-ins</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
