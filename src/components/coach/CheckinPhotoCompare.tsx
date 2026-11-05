/**
 * CheckinPhotoCompare.tsx — fotos do check-in ANTERIOR ao lado das ATUAIS,
 * uma pose por vez (Frente / Lateral D / Lateral E / Costas), dentro do
 * painel de feedback. Evita abrir a tela de Evolução só para comparar.
 *
 * Recebe os mapas já resolvidos (resolveCheckinPhotos) — não faz consulta.
 * Respeita o Modo Privacidade via PrivateImg (desfoque).
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PrivateImg } from "@/components/coach/PrivacyMode";

const POSES = [
  { key: "frente", label: "Frente" },
  { key: "lateral_dir", label: "Lateral D" },
  { key: "lateral_esq", label: "Lateral E" },
  { key: "costas", label: "Costas" },
] as const;

interface Props {
  current: Record<string, string>;
  previous: Record<string, string>;
  /** ex.: "26/10/2026" */
  currentLabel: string;
  /** ex.: "12/10/2026"; omitido quando não existe check-in anterior */
  previousLabel?: string | null;
}

function Shot({ src, alt, caption, empty }: { src?: string; alt: string; caption: string; empty: string }) {
  return (
    <figure className="min-w-0 space-y-1">
      <figcaption className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
        {caption}
      </figcaption>
      <div className="aspect-[3/4] rounded-md overflow-hidden border border-border/50 bg-muted/30">
        {src ? (
          <PrivateImg src={src} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </figure>
  );
}

export default function CheckinPhotoCompare({ current, previous, currentLabel, previousLabel }: Props) {
  const available = POSES.filter((p) => current[p.key] || previous[p.key]);
  const [pose, setPose] = useState<string>("frente");
  if (available.length === 0) return null;

  const active = available.find((p) => p.key === pose) ?? available[0];
  const hasPrevious = !!previousLabel;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPose(p.key)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              p.key === active.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className={cn("grid gap-3", hasPrevious ? "grid-cols-2" : "grid-cols-1 max-w-[60%]")}>
        {hasPrevious && (
          <Shot
            src={previous[active.key]}
            alt={`${active.label} — anterior`}
            caption={`Anterior · ${previousLabel}`}
            empty="Sem foto nesta pose"
          />
        )}
        <Shot
          src={current[active.key]}
          alt={`${active.label} — atual`}
          caption={`Atual · ${currentLabel}`}
          empty="Sem foto nesta pose"
        />
      </div>
    </div>
  );
}
