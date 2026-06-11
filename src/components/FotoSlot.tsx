/**
 * FotoSlot.tsx — Componente compartilhado de upload de foto.
 * Usado em Anamnesis.tsx e CheckIn.tsx.
 * Antes estava duplicado nos dois arquivos.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  preview: string | null;
  onFile: (f: File) => void;
  onRemove: () => void;
}

export function FotoSlot({ label, preview, onFile, onRemove }: Props) {
  const inp = useRef<HTMLInputElement>(null);

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
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
        }}
      />
      {preview ? (
        <>
          <img
            src={preview}
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
