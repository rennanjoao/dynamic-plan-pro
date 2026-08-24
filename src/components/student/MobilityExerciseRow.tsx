// src/components/student/MobilityExerciseRow.tsx
// Linha de exibição de um exercício de mobilidade (nome + gif de execução +
// séries/tempo + observação). Compartilhado entre:
//  - MobilityBlock (accordion "Mobilidade pré-treino" dentro do card de
//    cada treino, em WorkoutPlan.tsx);
//  - MobilitySuggestedDrawer (Modal/Drawer aberto pelo link sutil no header
//    do card de treino do aluno — WorkoutStrategyHeader);
//  - StudentProtocolPreview (preview do coach de como o aluno vê o treino).
// Nome e miniatura são clicáveis: abrem o gif de execução em tamanho
// grande (ExerciseGifDialog), pra confirmar o movimento antes de fazer.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { ExerciseGifDialog } from "@/components/shared/ExerciseGifDialog";
import { Maximize2 } from "lucide-react";

export function MobilityExerciseRow({ ex }: { ex: any }) {
  const gif = useExerciseGif(ex?.name, ex?.gifKey);
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-background/70 border border-border/50 rounded-md p-2.5 flex gap-3">
      {gif && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative w-20 h-20 rounded-md overflow-hidden shrink-0 group"
          title="Ver execução em tamanho maior"
        >
          <img
            src={gif}
            alt={`Execução do exercício ${ex.name}`}
            loading="lazy"
            className="w-full h-full object-cover bg-muted"
          />
          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50">
            <Maximize2 className="w-4 h-4 text-white" />
          </span>
        </button>
      )}
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold text-foreground text-left underline decoration-dotted decoration-current/40 underline-offset-4 hover:decoration-solid"
        >
          {ex.name}
        </button>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {ex.sets && <Badge variant="secondary" className="text-[10px]">{ex.sets} séries</Badge>}
          {ex.reps && <Badge variant="secondary" className="text-[10px]">{ex.reps}</Badge>}
        </div>
        {ex.notes && <p className="text-[11px] text-muted-foreground italic mt-1.5">{ex.notes}</p>}
      </div>
      <ExerciseGifDialog open={open} onOpenChange={setOpen} gifUrl={gif} exerciseName={ex?.name} />
    </div>
  );
}
