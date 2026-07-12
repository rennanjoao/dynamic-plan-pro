/**
 * CheckinPayloadAnswers.tsx
 * Renderiza respostas do payload de um check-in (humor, dieta, treino, sono, etc.)
 * agrupadas pelas seções declarativas de CHECKIN_SECTIONS.
 * Compartilhado entre CoachDashboard e EvolutionComparison.
 *
 * Fotos: por padrão ficam ocultas (EvolutionComparison tem galeria própria).
 * Passe `showPhotos` para renderizar um grid 2x2 no topo com lightbox.
 */
import { useState } from "react";
import { CHECKIN_SECTIONS } from "@/lib/checkInSchema";

const IGNORED = new Set(["metrics_raw", "fotos", "_updated"]);

const POSE_KEYS = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
const POSE_LABEL: Record<string, string> = {
  frente: "Frente", lateral_dir: "Lado Dir.", lateral_esq: "Lado Esq.", costas: "Costas",
};

function pickPhoto(
  fotos: Record<string, string>,
  pose: string,
  photoUrl?: string | null,
): string | null {
  if (pose === "frente") {
    return fotos.frente || fotos.front || photoUrl || null;
  }
  return fotos[pose] || null;
}

export default function CheckinPayloadAnswers({
  payload,
  showPhotos = false,
}: {
  payload: Record<string, unknown> | null | undefined;
  showPhotos?: boolean;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!payload) return null;

  const fotos = ((payload as Record<string, unknown>).fotos as Record<string, string> | undefined) || {};
  const photoUrl = (payload as Record<string, unknown>).photo_url as string | undefined;
  const photoEntries = showPhotos
    ? POSE_KEYS.map((k) => ({ key: k, url: pickPhoto(fotos, k, photoUrl) })).filter((e) => !!e.url)
    : [];

  const sections = CHECKIN_SECTIONS.map((sec) => {
    const filled = sec.fields
      .filter((f) => !IGNORED.has(f.key))
      .map((f) => ({ label: f.label, value: (payload as Record<string, unknown>)[f.key] }))
      .filter(({ value }) => value !== undefined && value !== null && value !== "");
    return { title: sec.title, filled };
  }).filter((s) => s.filled.length > 0);
  if (sections.length === 0 && photoEntries.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {photoEntries.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase text-primary mb-1">Fotos</p>
          <div className="grid grid-cols-2 gap-2">
            {photoEntries.map(({ key, url }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLightbox(url!)}
                className="rounded-lg overflow-hidden border border-border bg-black/40 aspect-[3/4] relative group"
              >
                <img src={url!} alt={POSE_LABEL[key]} className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/60 text-white py-0.5 text-center">
                  {POSE_LABEL[key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="text-[10px] font-bold uppercase text-primary mb-1">{sec.title}</p>
          <div className="space-y-1">
            {sec.filled.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-3 text-xs py-0.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-right max-w-[60%] whitespace-pre-wrap">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Foto" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}