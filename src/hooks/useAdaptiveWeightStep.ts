import { useRef } from "react";

/**
 * useAdaptiveWeightStep — incremento adaptativo de carga por hold.
 * Quanto mais tempo o botão fica pressionado, maior o step (1 → 2.5 → 5 → 10 kg).
 */
export function useAdaptiveWeightStep(setter: React.Dispatch<React.SetStateAction<number>>) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const holdStartRef = useRef(0);

  const stepFor = (ms: number) => (ms < 700 ? 1 : ms < 1800 ? 2.5 : ms < 3200 ? 5 : 10);

  const start = (dir: 1 | -1) => {
    holdStartRef.current = Date.now();
    setter((v) => Math.max(0, +(v + dir * 1).toFixed(1)));
    const tick = () => {
      const elapsed = Date.now() - holdStartRef.current;
      setter((v) => Math.max(0, +(v + dir * stepFor(elapsed)).toFixed(1)));
      timerRef.current = setTimeout(tick, 140);
    };
    timerRef.current = setTimeout(tick, 350);
  };

  const stop = () => clearTimeout(timerRef.current);

  return {
    onPointerDown: (dir: 1 | -1) => (e: React.PointerEvent) => {
      e.preventDefault();
      start(dir);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
  };
}