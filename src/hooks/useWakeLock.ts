import { useEffect, useRef } from "react";

/**
 * Mantém a tela do dispositivo acesa enquanto o componente está montado.
 * Usa a Screen Wake Lock API — suportada no Chrome Android e Safari iOS 16.4+.
 * Em navegadores sem suporte, falha silenciosamente sem erros.
 */
export function useWakeLock(active = true) {
  const lockRef = useRef<any>(null);

  useEffect(() => {
    if (!active) return;

    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        lockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch {
        // Silencioso: bateria fraca, aba em background, permissão negada, etc.
      }
    };

    acquire();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      lockRef.current?.release?.().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}