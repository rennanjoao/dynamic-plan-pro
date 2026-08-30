/**
 * PreviewModeBar — barra "Modo Espelho" exibida nas telas do aluno quando o
 * coach navega com ?previewAs=<student_id>. Marcação visual idêntica à usada
 * em StudentArea.tsx. Renderiza nada fora do modo espelho.
 */
import { useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PreviewModeBar() {
  const [searchParams] = useSearchParams();
  const previewAs = searchParams.get("previewAs");
  if (!previewAs) return null;

  return (
    <div className="bg-indigo-600/95 backdrop-blur shadow-md sticky top-0 z-50 text-white px-4 py-2.5 flex items-center justify-between border-b border-indigo-400/30">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="text-[11px] sm:text-xs font-medium truncate">
          Modo Espelho — visualizando como aluno
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 px-3 text-[10px] sm:text-xs bg-white text-indigo-600 hover:bg-white/90 shrink-0 font-bold"
        onClick={() => window.close()}
      >
        Sair do Preview
      </Button>
    </div>
  );
}
