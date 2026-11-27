// LGPD: fotos tiradas no celular carregam metadados (EXIF) — localização GPS,
// modelo do aparelho, data/hora. Redesenhar a imagem num canvas e salvar de novo
// gera um arquivo só com os pixels, sem esses dados. A orientação da foto é
// mantida (o navegador já aplica a rotação do EXIF ao desenhar).

export const SANITIZE_MAX_DIM = 2048;
export const SANITIZE_QUALITY = 0.88;

/** Tipos que dá para redesenhar com segurança (GIF/SVG ficam de fora). */
export function canReencode(type: string | undefined | null): boolean {
  return !!type && /^image\/(jpe?g|png|webp|heic|heif|avif|bmp)$/i.test(type);
}

/**
 * Sempre gera um JPEG novo (sem metadados), reduzindo se passar de `maxDim`.
 * Se o navegador não conseguir abrir a imagem (ex.: HEIC em alguns aparelhos),
 * devolve o arquivo original para não travar o envio.
 */
export async function reencodeImage(
  file: File,
  { maxDim = SANITIZE_MAX_DIM, quality = SANITIZE_QUALITY }: { maxDim?: number; quality?: number } = {},
): Promise<File> {
  if (!canReencode(file.type)) return file;
  let url: string | null = null;
  try {
    // Sem canvas (ambiente sem suporte), envia o original sem esperar a imagem carregar.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      const timer = setTimeout(() => reject(new Error("timeout")), 15000);
      im.onload = () => { clearTimeout(timer); resolve(im); };
      im.onerror = (e) => { clearTimeout(timer); reject(e); };
      im.src = url as string;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return file;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    canvas.width = dw;
    canvas.height = dh;
    // Fundo branco: PNG com transparência não vira preto no JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(img, 0, 0, dw, dh);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
