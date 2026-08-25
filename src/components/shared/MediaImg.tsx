/**
 * MediaImg.tsx — <img> que resolve mídia privada do bucket `student-media`
 * em URL assinada de curta duração. URLs legadas passam direto.
 */
import { useMediaUrl } from "@/lib/studentMedia";
import { cn } from "@/lib/utils";

export function MediaImg({ src, className, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const url = useMediaUrl(typeof src === "string" ? src : null);
  return <img {...rest} src={url || undefined} className={cn("max-w-full h-auto", className)} />;
}
