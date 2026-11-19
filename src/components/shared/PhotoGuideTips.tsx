import { PHOTO_GUIDE_TITLE, photoGuideTips, type PhotoGender } from "@/lib/photoGuide";

/** Dicas de foto padronizadas (anamnese e check-in usam o mesmo bloco). */
export function PhotoGuideTips({ gender, className = "" }: { gender?: PhotoGender; className?: string }) {
  return (
    <div
      className={`bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1.5 ${className}`}
      data-testid="photo-guide-tips"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{PHOTO_GUIDE_TITLE}</p>
      {photoGuideTips(gender).map((tip) => (
        <div key={tip.text} className="flex items-start gap-2 text-xs text-muted-foreground">
          <span aria-hidden>{tip.icon}</span>
          <span className="text-foreground/90">{tip.text}</span>
        </div>
      ))}
    </div>
  );
}

export default PhotoGuideTips;
