import { REF_COLOR, REF_LABEL, lineToPixels, refOf, type AnnotationLine } from "@/lib/photoAnnotations";
import { resolveMediaUrl } from "@/lib/studentMedia";

/**
 * Gera uma cópia TEMPORÁRIA da foto com as linhas por cima (canvas → PNG).
 * A foto original no storage nunca é alterada; a URL usada é a assinada/privada atual.
 * Por padrão inclui só linhas + legenda (origem/data/pose) — nada de notas ou respostas.
 */
export async function renderAnnotatedImage(photo: string, lines: AnnotationLine[], caption: string): Promise<Blob> {
  const url = await resolveMediaUrl(photo);
  if (!url) throw new Error("Link da foto indisponível ou expirado. Feche e abra novamente.");
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Não foi possível baixar a foto (link expirado ou sem permissão).");
  const bmp = await createImageBitmap(await res.blob());
  const w = bmp.width, h = bmp.height;
  const band = Math.max(28, Math.round(h * 0.04));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h + band;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não permitiu gerar a imagem.");
  ctx.drawImage(bmp, 0, 0);
  const lw = Math.max(2, Math.round(w / 300));
  for (const l of lines) {
    const p = lineToPixels(l, w, h);
    ctx.strokeStyle = REF_COLOR[refOf(l)];
    ctx.lineWidth = lw;
    ctx.setLineDash(l.tool === "vertical" ? [lw * 4, lw * 3] : l.notAssessable ? [lw * 2, lw * 2] : []);
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = "#050505"; ctx.fillRect(0, h, w, band);
  ctx.fillStyle = "#F5F5F5"; ctx.font = `${Math.round(band * 0.5)}px sans-serif`; ctx.textBaseline = "middle";
  const legend = Array.from(new Set(lines.map((l) => REF_LABEL[refOf(l)]))).join(" · ");
  ctx.fillText(`${caption}${legend ? "  —  " + legend : ""}  ·  referência visual, não é diagnóstico`, 10, h + band / 2, w - 20);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))), "image/png"));
}

/** Copia para a área de transferência; retorna false quando o navegador não suporta/permite. */
export async function copyImageBlob(blob: Blob, nav: Navigator = navigator): Promise<boolean> {
  try {
    const CI = (globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!CI || !nav.clipboard?.write) return false;
    await nav.clipboard.write([new CI({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
