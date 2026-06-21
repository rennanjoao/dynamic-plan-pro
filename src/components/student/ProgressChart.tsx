import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useStudentData } from "@/hooks/useStudentData";
import { TrendingUp, Loader2 } from "lucide-react";
import { estimateBF } from "@/lib/bfEstimate";

export const ProgressChart = ({ studentId }: { studentId?: string } = {}) => {
  const { anamnesis, checkIns, loading } = useStudentData(studentId);

  if (loading) {
    return (
      <div className="glass rounded-2xl p-8 flex justify-center items-center h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const baseline = anamnesis?.baseline_metrics || {};
  const payloadAna = (anamnesis?.payload as Record<string, any>) || {};
  
  // Parâmetros estáticos da Anamnese para cálculo de composição
  const altura = Number(baseline.altura || 0);
  const genero = payloadAna.genero || "M";

  const rawData: Array<{ date: string; peso: number; gordura: number | null; timestamp: number }> = [];

  // Ponto Inicial: Linha de base da Anamnese
  if (anamnesis?.submitted_at && baseline.peso) {
    const pesoBase = Number(baseline.peso);
    const cinturaBase = Number(baseline.cintura || 0);
    const bfBase = estimateBF({
      altura,
      cintura: cinturaBase,
      pescoco: Number(baseline.pescoco || 0),
      quadril: Number(baseline.quadril || 0),
      genero,
    }).value;

    rawData.push({
      date: new Date(anamnesis.submitted_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      peso: pesoBase,
      gordura: bfBase,
      timestamp: new Date(anamnesis.submitted_at).getTime(),
    });
  }

  // Pontos Consecutivos: Histórico de Check-ins (Feedbacks)
  if (checkIns && checkIns.length > 0) {
    checkIns.forEach((chk) => {
      if (chk.current_metrics && chk.submitted_at) {
        const pesoAtual = Number(chk.current_metrics.peso || 0);
        const cinturaAtual = Number(chk.current_metrics.cintura || 0);
        const bfAtual = estimateBF({
          altura,
          cintura: cinturaAtual,
          pescoco: Number(chk.current_metrics.pescoco || 0),
          quadril: Number(chk.current_metrics.quadril || 0),
          genero,
        }).value;

        // Usa o timestamp mais recente entre submitted_at e updated_at: um
        // check-in editado deve aparecer na linha do tempo na data da edição,
        // não na data de criação original do registro.
        const updatedAt = (chk as unknown as { updated_at?: string }).updated_at;
        const effectiveDate = updatedAt && new Date(updatedAt) > new Date(chk.submitted_at)
          ? updatedAt
          : chk.submitted_at;

        rawData.push({
          date: new Date(effectiveDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          peso: pesoAtual,
          gordura: bfAtual,
          timestamp: new Date(effectiveDate).getTime(),
        });
      }
    });
  }

  // Ordenação cronológica estrita limitado às últimas 14 medições
  const chartData = rawData
    .filter((d) => d.peso > 0)
    // gordura null é permitido — o gráfico omite o ponto automaticamente
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-14);

  if (chartData.length === 0) {
    return (
      <div className="glass rounded-2xl p-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Evolução de Medidas</h2>
        </div>
        <p className="text-muted-foreground text-center py-8">
          Aguardando o envio da Anamnese para inicializar a linha de base temporal.
        </p>
      </div>
    );
  }

  const ultimaMedida = chartData[chartData.length - 1];
  const primeiraMedida = chartData[0];
  const mudancaPeso = (ultimaMedida.peso - primeiraMedida.peso).toFixed(1);
  const mudancaGordura =
    ultimaMedida.gordura !== null && primeiraMedida.gordura !== null
      ? (ultimaMedida.gordura - primeiraMedida.gordura).toFixed(1)
      : "0";

  return (
    <div className="glass rounded-2xl p-8">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Evolução de Medidas</h2>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
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
          
          {/* Eixo esquerdo mapeado para o Peso */}
          <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="hsl(var(--muted-foreground))" fontSize={12} width={35} />
          
          {/* Eixo direito independente mapeado para o % de Gordura Estimado */}
          <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} stroke="hsl(var(--muted-foreground))" fontSize={12} width={35} />
          
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              backdropFilter: "blur(16px)",
            }}
          />
          <Legend />
          <Area yAxisId="left" type="monotone" dataKey="peso" name="Peso (kg)" stroke="hsl(var(--primary-light))" fill="url(#gradientPeso)" strokeWidth={2} />
          <Area yAxisId="right" type="monotone" dataKey="gordura" name="% Gordura Est." stroke="#3b82f6" fill="url(#gradientGordura)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        * O % de Gordura Estimada é calculado pela fórmula US Navy com base nas medidas informadas (cintura, pescoço e quadril).
        Trata-se de uma estimativa e pode apresentar variações devido à individualidade biológica. Não substitui avaliação profissional.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Mudança de Peso</p>
          <p className={`text-2xl font-bold mt-1 ${Number(mudancaPeso) <= 0 ? 'text-emerald-400' : 'text-primary'}`}>
            {Number(mudancaPeso) > 0 ? '+' : ''}{mudancaPeso} kg
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Gordura Estimada</p>
          <p className={`text-2xl font-bold mt-1 ${Number(mudancaGordura) <= 0 ? 'text-emerald-400' : 'text-primary'}`}>
            {ultimaMedida.gordura !== null && primeiraMedida.gordura !== null
              ? `${Number(mudancaGordura) > 0 ? '+' : ''}${mudancaGordura}%`
              : '—'}
          </p>
          {ultimaMedida.gordura === null && (
            <p className="text-[10px] text-muted-foreground mt-1">Informe cintura e pescoço nos check-ins</p>
          )}
        </div>
      </div>
    </div>
  );
};
