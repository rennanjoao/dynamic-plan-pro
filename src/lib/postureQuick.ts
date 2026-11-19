/**
 * Postura rápida — versão "cirúrgica" pedida pelo coach no lugar do módulo
 * completo de avaliação postural (que ficou oculto por ser longo demais).
 *
 * São 8 desvios comuns, visíveis nas fotos padrão do check-in. Para cada um o
 * coach toca em Não tem / Leve / Acentuado (ou deixa sem marcar = não avaliado).
 * Não é diagnóstico: é um registro visual para acompanhar a evolução.
 */

export type PoseKey = "frente" | "lateral_dir" | "lateral_esq" | "costas";
export type PostureGrade = "none" | "mild" | "marked";

export interface PostureDeviation {
  key: string;
  label: string;
  /** Onde olhar (texto curto mostrado ao coach). */
  look: string;
  poses: PoseKey[];
}

export const POSTURE_DEVIATIONS: PostureDeviation[] = [
  { key: "cabeca_anteriorizada", label: "Cabeça projetada à frente", look: "Foto de lado", poses: ["lateral_dir", "lateral_esq"] },
  { key: "ombros_protusos", label: "Ombros arredondados para frente", look: "Foto de lado", poses: ["lateral_dir", "lateral_esq"] },
  { key: "ombros_desnivelados", label: "Ombros desnivelados", look: "Frente ou costas", poses: ["frente", "costas"] },
  { key: "escapulas_aladas", label: "Escápulas saltadas (aladas)", look: "Foto de costas", poses: ["costas"] },
  { key: "lombar_acentuada", label: "Lombar muito curvada", look: "Foto de lado", poses: ["lateral_dir", "lateral_esq"] },
  { key: "pelve_desnivelada", label: "Quadril desnivelado", look: "Frente ou costas", poses: ["frente", "costas"] },
  { key: "joelhos_para_dentro", label: "Joelhos para dentro", look: "Foto de frente", poses: ["frente"] },
  { key: "pes_desabados", label: "Pés desabados (arco caído)", look: "Frente ou costas", poses: ["frente", "costas"] },
];

export const GRADE_META: Record<PostureGrade, { label: string; short: string; rank: number; cls: string }> = {
  none:   { label: "Não tem",   short: "Não",   rank: 0, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40" },
  mild:   { label: "Leve",      short: "Leve",  rank: 1, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" },
  marked: { label: "Acentuado", short: "Acent.", rank: 2, cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40" },
};

export const GRADE_ORDER: PostureGrade[] = ["none", "mild", "marked"];

export type PostureFindings = Partial<Record<string, PostureGrade>>;

/** Mantém só desvios conhecidos com grau válido (protege contra JSON estranho). */
export function sanitizeFindings(raw: unknown): PostureFindings {
  const out: PostureFindings = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const d of POSTURE_DEVIATIONS) {
    const v = (raw as Record<string, unknown>)[d.key];
    if (v === "none" || v === "mild" || v === "marked") out[d.key] = v;
  }
  return out;
}

export interface PostureQuickCheck {
  id: string;
  source_kind: "anamnesis" | "checkin";
  source_id: string;
  source_date: string;
  findings: PostureFindings;
  note: string | null;
}

export type PostureTrend = "melhorou" | "igual" | "piorou" | null;

/**
 * Tendência de um desvio entre a PRIMEIRA e a ÚLTIMA vez em que foi avaliado
 * (ignora as datas em que ficou sem marcar). null = avaliado só 1 vez ou nunca.
 */
export function deviationTrend(checks: PostureQuickCheck[], key: string): PostureTrend {
  const graded = [...checks]
    .sort((a, b) => new Date(a.source_date).getTime() - new Date(b.source_date).getTime())
    .map((c) => c.findings[key])
    .filter((g): g is PostureGrade => !!g);
  if (graded.length < 2) return null;
  const first = GRADE_META[graded[0]].rank;
  const last = GRADE_META[graded[graded.length - 1]].rank;
  if (last < first) return "melhorou";
  if (last > first) return "piorou";
  return "igual";
}

/** Quantos desvios estão presentes (leve ou acentuado) numa marcação. */
export function countPresent(findings: PostureFindings): number {
  return Object.values(findings).filter((g) => g === "mild" || g === "marked").length;
}
