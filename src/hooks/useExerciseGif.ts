import { useEffect, useState } from "react";
import { getExerciseGifUrl } from "@/lib/exerciseLibrary";

/** Busca a URL do gif do exercício (ou null se não achar match na biblioteca). */
export function useExerciseGif(exerciseName: string | undefined | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!exerciseName) {
      setUrl(null);
      return;
    }
    getExerciseGifUrl(exerciseName).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [exerciseName]);

  return url;
}
