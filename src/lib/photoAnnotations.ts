/**
 * Marcação postural do Coach sobre fotos já existentes (anamnese/check-ins).
 * Coordenadas sempre normalizadas (0–1) em relação ao retângulo da IMAGEM,
 * nunca à tela — assim as linhas continuam alinhadas em qualquer tamanho.
 * Ferramenta visual: não diagnostica nada.
 */
export type AnnotationTool = "horizontal" | "vertical" | "free";
export type VisualDegree = "not_assessable" | "subtle" | "moderate" | "marked";
export type PhotoSourceKind = "anamnesis" | "checkin";
export type PhotoPose = "frente" | "lateral_dir" | "lateral_esq" | "costas";

export interface Pt { x: number; y: number }
export interface AnnotationLine { id: string; tool: AnnotationTool; a: Pt; b: Pt }

export interface PhotoAnnotationRow {
  id: string;
  student_id: string;
  coach_id: string;
  source_kind: PhotoSourceKind;
  source_id: string;
  pose: PhotoPose;
  annotations: AnnotationLine[];
  visual_degree: VisualDegree;
  coach_note: string | null;
  updated_at: string;
}

export const DEGREE_LABEL: Record<VisualDegree, string> = {
  not_assessable: "Não avaliável",
  subtle: "Sutil",
  moderate: "Moderado",
  marked: "Marcado",
};

export const TOOL_LABEL: Record<AnnotationTool, string> = {
  horizontal: "Linha horizontal",
  vertical: "Eixo vertical",
  free: "Linha / ângulo livre",
};

export const TOOL_HINT: Record<AnnotationTool, string> = {
  horizontal: "Ombros: use pontos equivalentes dos dois lados. Pelve: marque referências visíveis dos quadris.",
  vertical: "Eixo: use o centro aparente do corpo (ex.: entre os pés até a cabeça).",
  free: "Ligue dois pontos de referência; o ângulo em relação à horizontal aparece ao lado.",
};

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Converte um ponto de tela para coordenadas normalizadas do retângulo da imagem. */
export function toNormalized(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Pt {
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
}

/** Cria uma linha nova centrada no ponto informado, respeitando a ferramenta. */
export function createLine(tool: AnnotationTool, center: Pt = { x: 0.5, y: 0.5 }, id = crypto.randomUUID()): AnnotationLine {
  const c = { x: clamp01(center.x), y: clamp01(center.y) };
  if (tool === "vertical") return { id, tool, a: { x: c.x, y: 0.05 }, b: { x: c.x, y: 0.95 } };
  if (tool === "horizontal") return { id, tool, a: { x: clamp01(c.x - 0.25), y: c.y }, b: { x: clamp01(c.x + 0.25), y: c.y } };
  return { id, tool, a: { x: clamp01(c.x - 0.15), y: clamp01(c.y + 0.1) }, b: { x: clamp01(c.x + 0.15), y: clamp01(c.y - 0.1) } };
}

/** Move um ponto da linha mantendo a restrição da ferramenta (vertical fica vertical). */
export function moveHandle(line: AnnotationLine, handle: "a" | "b", p: Pt): AnnotationLine {
  const q = { x: clamp01(p.x), y: clamp01(p.y) };
  if (line.tool === "vertical") return { ...line, a: { ...line.a, x: q.x }, b: { ...line.b, x: q.x }, [handle]: q } as AnnotationLine;
  return { ...line, [handle]: q };
}

/** Ângulo (graus) em relação à horizontal, considerando a proporção real da imagem. */
export function lineAngleDeg(line: AnnotationLine, aspect = 1): number {
  const dx = (line.b.x - line.a.x) * aspect;
  const dy = line.b.y - line.a.y;
  if (dx === 0 && dy === 0) return 0;
  let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return Math.round(deg * 10) / 10;
}

/** Saneia JSON vindo do banco: descarta entradas inválidas. */
export function sanitizeLines(raw: unknown): AnnotationLine[] {
  if (!Array.isArray(raw)) return [];
  const ok = (p: any) => p && typeof p.x === "number" && typeof p.y === "number";
  return raw
    .filter((l: any) => l && ["horizontal", "vertical", "free"].includes(l.tool) && ok(l.a) && ok(l.b))
    .map((l: any) => ({ id: String(l.id ?? crypto.randomUUID()), tool: l.tool, a: { x: clamp01(l.a.x), y: clamp01(l.a.y) }, b: { x: clamp01(l.b.x), y: clamp01(l.b.y) } }));
}

/** Relatos explícitos da aluna (sem inferência). */
export interface ReportedAttention { origin: string; date: string; question: string; answer: string }

const ANAM_KEYS: Array<[string, string]> = [
  ["lesoes", "Dor crônica ou lesão diagnosticada"],
  ["cirurgias", "Cirurgias relevantes"],
  ["dificuldade_treino", "Maior dificuldade nos treinos"],
];
const NEGATIVE = /^(n[aã]o|nenhum[a]?|nada|n\/a|-+|sem)\.?$/i;

export function extractReportedAttention(
  anam: { submitted_at: string; payload: Record<string, unknown> | null } | null,
  checkins: Array<{ submitted_at: string; payload: Record<string, unknown> | null }>,
): ReportedAttention[] {
  const out: ReportedAttention[] = [];
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (anam?.payload) {
    for (const [k, q] of ANAM_KEYS) {
      const a = txt(anam.payload[k]);
      if (!a || NEGATIVE.test(a)) continue;
      // dificuldade_treino só entra quando a própria aluna citou dor/lesão
      if (k === "dificuldade_treino" && !/\b(dor|dores|les[aã]o|machuc)/i.test(a)) continue;
      out.push({ origin: "Anamnese", date: anam.submitted_at, question: q, answer: a });
    }
  }
  for (const c of checkins) {
    const p = c.payload || {};
    if (txt(p.evento_relevante) === "Sim") {
      const d = txt(p.evento_relevante_desc);
      out.push({ origin: "Check-in", date: c.submitted_at, question: "Evento relevante (lesão, doença, sintoma)", answer: d || "Marcou “Sim” sem descrever" });
    }
    if (txt(p.sono_como_acorda) === "Com dor") {
      out.push({ origin: "Check-in", date: c.submitted_at, question: "Como se sente ao acordar", answer: "Com dor" });
    }
  }
  return out;
}
