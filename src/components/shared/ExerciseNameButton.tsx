// src/components/shared/ExerciseNameButton.tsx
// Nome do exercício clicável: abre o gif de execução em tamanho grande.
// Usado nas listas de exercício do aluno (treino de força) para resolver
// "clicar no nome pra ver o movimento". Busca o gif sozinho via
// useExerciseGif — só precisa receber nome + gifKey.
import { useState } from "react";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { ExerciseGifDialog } from "./ExerciseGifDialog";
import { cn } from "@/lib/utils";

interface ExerciseNameButtonProps {
  name: string;
  gifKey?: string | null;
  className?: string;
}

export function ExerciseNameButton({ name, gifKey, className }: ExerciseNameButtonProps) {
  const [open, setOpen] = useState(false);
  const gifUrl = useExerciseGif(name, gifKey);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-left underline decoration-dotted decoration-current/40 underline-offset-4 hover:decoration-solid",
          className
        )}
        title="Toque para ver o gif de execução"
      >
        {name}
      </button>
      <ExerciseGifDialog open={open} onOpenChange={setOpen} gifUrl={gifUrl} exerciseName={name} />
    </>
  );
}
