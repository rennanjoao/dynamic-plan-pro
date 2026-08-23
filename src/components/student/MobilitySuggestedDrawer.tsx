// src/components/student/MobilitySuggestedDrawer.tsx
// Modal/Drawer da "Mobilidade sugerida", acionado pelo link sutil logo
// abaixo do header do card de treino do aluno (WorkoutStrategyHeader).
// Mostra APENAS os exercícios marcados como mobilidade do treino de hoje —
// a lista principal de exercícios do treino já filtra e exclui esses itens
// (WorkoutPlan.tsx e WorkoutMode.tsx), então não há duplicação.
//
// Segue o mesmo padrão responsivo já estabelecido em ExerciseVideoSheet.tsx
// para overlays auxiliares do aluno em torno do treino: Drawer (vaul) no
// mobile, Dialog no desktop — evita introduzir um terceiro tipo de overlay
// (ex: Sheet lateral) para o mesmo tipo de conteúdo.
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose,
} from "@/components/ui/drawer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilityExerciseRow } from "./MobilityExerciseRow";
import { StretchHorizontal, X } from "lucide-react";

interface MobilitySuggestedDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exercícios com is_mobility=true do treino de hoje — já filtrados pelo chamador. */
  exercises: any[];
}

const DESCRIPTION =
  "Faça antes de iniciar o treino de hoje para preparar as articulações e reduzir risco de lesão.";

function MobilityList({ exercises }: { exercises: any[] }) {
  if (exercises.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-6 text-center">
        Nenhum exercício de mobilidade cadastrado para hoje.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {exercises.map((ex: any, i: number) => (
        <MobilityExerciseRow key={ex?.__id ?? i} ex={ex} />
      ))}
    </div>
  );
}

export function MobilitySuggestedDrawer({ open, onOpenChange, exercises }: MobilitySuggestedDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="flex flex-row items-start justify-between gap-2">
            <div className="text-left">
              <DrawerTitle className="flex items-center gap-2">
                <StretchHorizontal className="w-4 h-4 text-sky-500" />
                Mobilidade sugerida
              </DrawerTitle>
              <DrawerDescription>{DESCRIPTION}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar mobilidade sugerida"
                className="rounded-full p-2 hover:bg-black/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            <MobilityList exercises={exercises} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StretchHorizontal className="w-4 h-4 text-sky-500" />
            Mobilidade sugerida
          </DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <MobilityList exercises={exercises} />
      </DialogContent>
    </Dialog>
  );
}
