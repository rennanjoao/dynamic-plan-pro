// src/components/shared/ExerciseGifDialog.tsx
// Modal com o gif de execução em tamanho grande. Compartilhado entre aluno
// (entender o movimento antes de executar) e coach (conferir visualmente
// antes de prescrever ou de decidir se um exercício legado é força ou
// mobilidade). Drawer no mobile, Dialog no desktop — mesmo padrão já usado
// em ExerciseVideoSheet.tsx.
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { X } from "lucide-react";

interface ExerciseGifDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gifUrl: string | null;
  exerciseName?: string;
}

export function ExerciseGifDialog({ open, onOpenChange, gifUrl, exerciseName }: ExerciseGifDialogProps) {
  const isMobile = useIsMobile();
  const title = exerciseName || "Execução do exercício";

  const body = gifUrl ? (
    <div className="w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
      <img
        src={gifUrl}
        alt={`Execução do exercício ${title}`}
        className="w-full max-h-[65vh] object-contain"
      />
    </div>
  ) : (
    <div className="w-full aspect-video rounded-lg bg-muted flex items-center justify-center px-6">
      <p className="text-sm text-muted-foreground text-center">
        Gif de execução não encontrado para este exercício.
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex flex-row items-center justify-between gap-2">
            <DrawerTitle className="text-left truncate min-w-0">{title}</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                aria-label="Fechar gif"
                className="rounded-full p-2 hover:bg-black/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
