import jsPDF from "jspdf";

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line: string) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function header(doc: jsPDF, title: string, subtitle: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(225, 29, 72); // #E11D48
  doc.text("Elite Lab Hub", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, 14, 24);

  doc.setDrawColor(225, 29, 72);
  doc.setLineWidth(0.6);
  doc.line(14, 28, 196, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(title, 14, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(subtitle, 14, 44);
  return 54;
}

function section(doc: jsPDF, title: string, y: number): number {
  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(225, 29, 72);
  doc.text(title, 14, y);
  doc.setDrawColor(225, 29, 72);
  doc.setLineWidth(0.3);
  doc.line(14, y + 1.2, 196, y + 1.2);
  doc.setTextColor(30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return y + 7;
}

function kv(doc: jsPDF, label: string, value: string, y: number): number {
  if (y > 280) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setTextColor(90);
  doc.text(label, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20);
  const labelW = doc.getTextWidth(label) + 3;
  return addWrappedText(doc, value, 14 + labelW, y, 196 - 14 - labelW);
}

export function exportCheckinPDF(params: {
  studentName: string;
  submittedAt: string;
  currentMetrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  coachFeedback?: string | null;
  sections: Array<{ title: string; fields: Array<{ key: string; label: string }> }>;
}): void {
  const { studentName, submittedAt, currentMetrics, payload, coachFeedback, sections } = params;
  const doc = new jsPDF();
  let y = header(doc, `Feedback / Check-in — ${studentName}`, `Enviado em ${fmtDate(submittedAt)}`);

  if (currentMetrics && Object.keys(currentMetrics).length > 0) {
    y = section(doc, "Métricas Atuais", y);
    for (const [k, v] of Object.entries(currentMetrics)) {
      const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—");
      y = kv(doc, `${k}:`, val, y);
    }
    y += 2;
  }

  if (payload) {
    const IGNORED = new Set(["metrics_raw", "fotos", "_updated"]);
    for (const sec of sections) {
      const filled = sec.fields
        .filter((f) => !IGNORED.has(f.key))
        .map((f) => ({ label: f.label, value: (payload as Record<string, unknown>)[f.key] }))
        .filter(({ value }) => value !== undefined && value !== null && value !== "");
      if (filled.length === 0) continue;
      y = section(doc, sec.title, y);
      for (const { label, value } of filled) {
        const val = typeof value === "object" ? JSON.stringify(value) : String(value);
        y = kv(doc, `${label}:`, val, y);
      }
      y += 2;
    }
  }

  if (coachFeedback) {
    y = section(doc, "Feedback do Coach", y);
    y = addWrappedText(doc, coachFeedback, 14, y, 182);
  }

  doc.save(`feedback_${studentName.replace(/\s+/g, "_")}_${new Date(submittedAt).toISOString().slice(0, 10)}.pdf`);
}

export function exportAnamnesisPDF(params: {
  studentName: string;
  submittedAt: string | null;
  baselineMetrics: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  sections: Array<{ title: string; fields: Array<{ key: string; label: string }> }>;
}): void {
  const { studentName, submittedAt, baselineMetrics, payload, sections } = params;
  const doc = new jsPDF();
  let y = header(doc, `Anamnese Completa — ${studentName}`, `Submetida em ${fmtDate(submittedAt)}`);

  if (baselineMetrics && Object.keys(baselineMetrics).length > 0) {
    y = section(doc, "Métricas Baseline", y);
    for (const [k, v] of Object.entries(baselineMetrics)) {
      const val = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—");
      y = kv(doc, `${k}:`, val, y);
    }
    y += 2;
  }

  if (payload) {
    for (const sec of sections) {
      const filled = sec.fields
        .map((f) => ({ label: f.label, value: (payload as Record<string, unknown>)[f.key] }))
        .filter(({ value }) => value !== undefined && value !== null && value !== "");
      if (filled.length === 0) continue;
      y = section(doc, sec.title, y);
      for (const { label, value } of filled) {
        const val = Array.isArray(value)
          ? value.join(", ")
          : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);
        y = kv(doc, `${label}:`, val, y);
      }
      y += 2;
    }
  }

  doc.save(`anamnese_${studentName.replace(/\s+/g, "_")}.pdf`);
}