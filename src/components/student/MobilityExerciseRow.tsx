// src/components/student/MobilityExerciseRow.tsx
// Linha de exibição de um exercício de mobilidade (nome + gif de execução +
// séries/tempo + observação). Extraído de WorkoutPlan.tsx para ser
// compartilhado entre:
//  - MobilityBlock (accordion "Mobilidade pré-treino" dentro do card de
//    cada treino, em WorkoutPlan.tsx);
//  - MobilitySuggestedDrawer (Modal/Drawer aberto pelo link sutil no header
//    do card de treino do aluno — WorkoutStrategyHeader).
import { Badge } from "@/components/ui/badge";
import { useExerciseGif } from "@/hooks/useExerciseGif";

export function MobilityExerciseRow({ ex }: { ex: any }) {
  const gif = useExerciseGif(ex?.name, ex?.gifKey);
  return (
    <div className="bg-background/70 border border-border/50 rounded-md p-2.5 flex gap-3">
      {gif && (
        <img
          src={gif}
          alt={`Execução do exercício ${ex.name}`}
          loading="lazy"
          className="w-20 h-20 rounded-md object-cover bg-muted shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{ex.name}</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {ex.sets && <Badge variant="secondary" className="text-[10px]">{ex.sets} séries</Badge>}
          {ex.reps && <Badge variant="secondary" className="text-[10px]">{ex.reps}</Badge>}
        </div>
        {ex.notes && <p className="text-[11px] text-muted-foreground italic mt-1.5">{ex.notes}</p>}
      </div>
    </div>
  );
}
