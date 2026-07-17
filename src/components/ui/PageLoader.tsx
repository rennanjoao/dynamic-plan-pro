import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Loader de página inteira (fundo bg-background, spinner primário centralizado).
 * Substitui o padrão repetido:
 *   <div className="min-h-screen flex items-center justify-center bg-background">
 *     <Loader2 className="w-8 h-8 animate-spin text-primary" />
 *   </div>
 *
 * Comportamento visual idêntico — apenas centraliza a implementação.
 */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center bg-background",
        className
      )}
    >
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export default PageLoader;