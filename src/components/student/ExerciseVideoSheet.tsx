// src/components/student/ExerciseVideoSheet.tsx
// Player de vídeo embutido para o link colado pelo coach em `exercise.notes`.
// O aluno NÃO pode sair do WorkoutMode (perderia timers e inputs em
// andamento) — este componente nunca navega, só monta um <iframe> dentro de
// um Drawer (mobile) ou Dialog (desktop), como overlay por cima do treino.

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VideoProvider } from "@/lib/parseExerciseNotes";
import { ExternalLink } from "lucide-react";

interface ExerciseVideoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string | null;
  rawUrl: string | null;
  provider: VideoProvider | null;
  exerciseName?: string;
}

export function ExerciseVideoSheet({
  open,
  onOpenChange,
  embedUrl,
  rawUrl,
  provider,
  exerciseName,
}: ExerciseVideoSheetProps) {
  const isMobile = useIsMobile();
  const title = exerciseName ? `Vídeo de execução — ${exerciseName}` : "Vídeo de execução";

  const canEmbed = provider !== "generic" && !!embedUrl;

  const body = canEmbed ? (
    <div className="w-full aspect-video rounded-lg overflow-hidden bg-black">
      <iframe
        src={embedUrl ?? undefined}
        title={title}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  ) : (
    <div className="w-full aspect-video rounded-lg bg-muted flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="text-sm text-muted-foreground">
        Não é possível exibir este link embutido. Abra em uma nova aba (seu treino continua salvo aqui).
      </p>
      {rawUrl && (
        <a
          href={rawUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-bold underline"
        >
          Abrir link <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="text-left">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
