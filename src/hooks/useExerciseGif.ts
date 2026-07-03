import { useEffect, useState } from "react";
import { getExerciseGifUrl } from "@/lib/exerciseLibrary";

/**
 * Busca a URL do gif do exercício (ou null se não achar match na biblioteca).
 * Se `gifKey` for informado, tenta primeiro o match exato pela chave (garantido pelo coach
 * ao prescrever). Caso contrário, cai no fallback histórico por nome.
 */
export function useExerciseGif(
  exerciseName: string | undefined | null,
  gifKey?: string | null,
) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!exerciseName && !gifKey) {
      setUrl(null);
      return;
    }
    getExerciseGifUrl(exerciseName ?? "", gifKey ?? undefined).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [exerciseName, gifKey]);

  return url;
}
