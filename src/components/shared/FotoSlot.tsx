/**
 * FotoSlot.tsx — Componente compartilhado de upload de foto.
 * Usado em Anamnesis.tsx e CheckIn.tsx.
 * Antes estava duplicado nos dois arquivos.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useMediaUrl } from "@/lib/studentMedia";

interface Props {
  label: string;
  preview: string | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}

const MAX_DIM = 1200;
const JPEG_QUALITY = 0.78;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const { naturalWidth: w, naturalHeight: h } = img;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(url); return file; }
    ctx.drawImage(img, 0, 0, dw, dh);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", JPEG_QUALITY)
    );
    URL.revokeObjectURL(url);
    if (!blob || blob.size >= file.size) return file;
    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function FotoSlot({ label, preview, onFile, onRemove }: Props) {
  const inp = useRef<HTMLInputElement>(null);
  const previewUrl = useMediaUrl(preview);

  return (
    <div
      onClick={() => !preview && inp.current?.click()}
      className={cn(
        "relative aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
        preview
          ? "border-primary/40 border-solid"
          : "border-border/40 hover:border-primary/40"
      )}
    >
      <input
        ref={inp}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const compressed = await compressImage(f);
          onFile(compressed);
          e.target.value = "";
        }}
      />
      {preview ? (
        <>
          <img
            src={previewUrl || undefined}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/70 border border-border text-white text-xs flex items-center justify-center"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span className="text-2xl mb-1">📷</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center px-1">
            {label}
          </span>
        </>
      )}
    </div>
  );
}
