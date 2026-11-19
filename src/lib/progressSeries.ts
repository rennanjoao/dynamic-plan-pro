/**
 * Série do gráfico "Evolução de Medidas" (aluno e coach).
 *
 * Correções:
 *  - Cada ponto usa a data de ENVIO do check-in. Antes usava a data da última
 *    alteração (updated_at), e responder/editar o check-in fazia o ponto
 *    "andar" para a data da edição.
 *  - O ponto de partida (anamnese) fica sempre no gráfico. Antes, depois de 14
 *    medições, ele saía e a "variação desde o início" passava a contar de uma
 *    data no meio do caminho sem avisar.
 *  - Além de peso e % de gordura, dá para ver cintura, quadril, braço e coxa.
 */
import { estimateBF } from "@/lib/bfEstimate";

export type ProgressMetric = "peso" | "cintura" | "quadril" | "braco" | "coxa";

export const PROGRESS_METRICS: { key: ProgressMetric; label: string; unit: string }[] = [
  { key: "peso", label: "Peso e gordura", unit: "kg" },
  { key: "cintura", label: "Cintura", unit: "cm" },
  { key: "quadril", label: "Quadril", unit: "cm" },
  { key: "braco", label: "Braço", unit: "cm" },
  { key: "coxa", label: "Coxa", unit: "cm" },
];

export const MAX_POINTS = 14;

export interface ProgressPoint {
  date: string; // dd/mm
  timestamp: number;
  value: number;
  /** % de gordura estimado (só na métrica "peso"). */
  gordura: number | null;
  isBaseline: boolean;
}

type Metrics = Record<string, unknown> | null | undefined;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const avg = (...vals: (number | null)[]): number | null => {
  const ok = vals.filter((v): v is number => v != null);
  return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null;
};

/** Valor da medida escolhida, tolerando os nomes antigos de campo. */
export function metricValueOf(m: Metrics, metric: ProgressMetric): number | null {
  const r = (m ?? {}) as Record<string, unknown>;
  switch (metric) {
    case "peso": return num(r.peso ?? r.weight);
    case "cintura": return num(r.cintura);
    case "quadril": return num(r.quadril);
    case "coxa": return num(r.coxa_d ?? r.coxa) ?? num(r.coxa_e);
    case "braco": {
      // Braço contraído (média D/E); se não houver, relaxado; por fim o campo agregado antigo.
      const flexed = avg(num(r.braco_d_contraido), num(r.braco_e_contraido));
      if (flexed != null) return flexed;
      const relaxed = avg(num(r.braco_d_relaxado), num(r.braco_e_relaxado));
      if (relaxed != null) return relaxed;
      return num(r.arm_flexed ?? r.arm_relaxed ?? r.braco);
    }
  }
}

export interface SeriesInput {
  anamnesis: { submitted_at?: string | null; baseline_metrics?: Metrics; payload?: Metrics } | null | undefined;
  checkIns: Array<{ submitted_at?: string | null; current_metrics?: Metrics }> | null | undefined;
  metric: ProgressMetric;
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function buildProgressSeries({ anamnesis, checkIns, metric }: SeriesInput): ProgressPoint[] {
  const baseline = (anamnesis?.baseline_metrics ?? {}) as Record<string, unknown>;
  const payload = (anamnesis?.payload ?? {}) as Record<string, unknown>;
  const altura = num(baseline.altura) ?? 0;
  // O campo salvo na anamnese é "gender"; "genero"/"sexo" só por compatibilidade.
  const genero = (payload.gender || payload.genero || payload.sexo || "M") as string;

  const bf = (m: Record<string, unknown>) =>
    metric === "peso"
      ? estimateBF({
          altura,
          cintura: num(m.cintura) ?? 0,
          pescoco: num(m.pescoco) ?? 0,
          quadril: num(m.quadril) ?? 0,
          genero,
        }).value
      : null;

  const points: ProgressPoint[] = [];
  if (anamnesis?.submitted_at) {
    const v = metricValueOf(baseline, metric);
    if (v != null) {
      points.push({
        date: fmtDay(anamnesis.submitted_at),
        timestamp: new Date(anamnesis.submitted_at).getTime(),
        value: v,
        gordura: bf(baseline),
        isBaseline: true,
      });
    }
  }
  for (const c of checkIns ?? []) {
    if (!c?.submitted_at || !c.current_metrics) continue;
    const m = c.current_metrics as Record<string, unknown>;
    const v = metricValueOf(m, metric);
    if (v == null) continue;
    points.push({
      date: fmtDay(c.submitted_at),
      timestamp: new Date(c.submitted_at).getTime(),
      value: v,
      gordura: bf(m),
      isBaseline: false,
    });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  if (points.length <= MAX_POINTS) return points;
  // Mantém o ponto de partida + as medições mais recentes.
  const first = points[0];
  if (first.isBaseline) return [first, ...points.slice(-(MAX_POINTS - 1))];
  return points.slice(-MAX_POINTS);
}
