// src/components/shared/ExerciseNameButton.tsx
// Nome do exercício clicável: abre o gif de execução em tamanho grande.
// Usado nas listas de exercício do aluno (treino de força) para resolver
// "clicar no nome pra ver o movimento". Busca o gif sozinho via
// useExerciseGif — só precisa receber nome + gifKey.
// Com `withThumb`, também renderiza a miniatura clicável ao lado do nome;
// nome e miniatura compartilham o MESMO estado de modal (nunca abrem dois).
import { useState } from "react";
import { useExerciseGif } from "@/hooks/useExerciseGif";
import { ExerciseGifDialog } from "./ExerciseGifDialog";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";

interface ExerciseNameButtonProps {
  name: string;
  gifKey?: string | null;
  className?: string;
  /** Mostra a miniatura do gif (quando existir) à esquerda do nome. */
  withThumb?: boolean;
}

export function ExerciseNameButton({ name, gifKey, className, withThumb }: ExerciseNameButtonProps) {
  const [open, setOpen] = useState(false);
  const gifUrl = useExerciseGif(name, gifKey);

  const nameButton = (
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
  );

  return (
    <>
      {withThumb && gifUrl ? (
        <span className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative w-12 h-12 rounded-md overflow-hidden shrink-0 group"
            title="Ver execução em tamanho maior"
          >
            <img
              src={gifUrl}
              alt={`Execução do exercício ${name}`}
              loading="lazy"
              className="w-full h-full object-cover bg-muted"
            />
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50">
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </span>
          </button>
          {nameButton}
        </span>
      ) : (
        nameButton
      )}
      <ExerciseGifDialog open={open} onOpenChange={setOpen} gifUrl={gifUrl} exerciseName={name} />
    </>
  );
}
