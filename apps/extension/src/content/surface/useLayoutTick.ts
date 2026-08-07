import { useEffect, useState } from "react";

export function useLayoutTick(disabled: boolean): number {
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    if (disabled) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        setLayoutTick((n) => n + 1);
      });
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [disabled]);

  return layoutTick;
}
