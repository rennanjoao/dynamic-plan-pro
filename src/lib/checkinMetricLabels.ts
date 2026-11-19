import { CHECKIN_METRICS } from "@/lib/checkInSchema";

/**
 * Rótulos legíveis para as medidas do check-in (current_metrics). Antes o
 * histórico mostrava a chave crua ("braco_d_relaxado") e, para valores
 * compostos, o JSON entre chaves.
 */
const EXTRA_LABELS: Record<string, { label: string; unit?: string }> = {
  weight: { label: "Peso", unit: "kg" },
  altura: { label: "Altura", unit: "cm" },
  coxa_e: { label: "Coxa E", unit: "cm" },
  panturrilha: { label: "Panturrilha", unit: "cm" },
  peito: { label: "Peito", unit: "cm" },
  abdomen: { label: "Abdômen", unit: "cm" },
  body_fat: { label: "% de gordura (estimado)", unit: "%" },
  arm_relaxed: { label: "Braço relaxado (média)", unit: "cm" },
  arm_flexed: { label: "Braço contraído (média)", unit: "cm" },
};

export function metricLabel(key: string): { label: string; unit?: string } {
  const known = CHECKIN_METRICS.find((m) => m.key === key);
  if (known) return { label: known.label, unit: known.unit };
  if (EXTRA_LABELS[key]) return EXTRA_LABELS[key];
  const pretty = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return { label: pretty.charAt(0).toUpperCase() + pretty.slice(1) };
}

/** Valor legível: número com unidade; objeto vira "chave: valor" separado por vírgula. */
export function metricValue(value: unknown, unit?: string): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    const n = typeof value === "number" ? value : Number(value);
    return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${metricLabel(k).label}: ${typeof v === "object" ? "…" : String(v)}`);
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  return String(value);
}

/** Linhas prontas para exibir (ignora vazios), na ordem do formulário quando conhecida. */
export function metricRows(metrics: Record<string, unknown> | null | undefined): { key: string; label: string; value: string }[] {
  const m = metrics ?? {};
  const order = CHECKIN_METRICS.map((x) => x.key as string);
  const keys = Object.keys(m).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return keys
    .filter((k) => m[k] != null && m[k] !== "")
    .map((k) => {
      const { label, unit } = metricLabel(k);
      return { key: k, label, value: metricValue(m[k], unit) };
    });
}
