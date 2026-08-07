import { useCallback, useState } from "react";

import { makeBloomSpec, type BloomIntent, type BloomSpec } from "../../shapes";
import type { LumenThemeId } from "../../theme";

export function useBloomRuntime(themeId: LumenThemeId) {
  const [blooms, setBlooms] = useState<Array<{ id: string; spec: BloomSpec }>>([]);

  const triggerBloom = useCallback(
    (rect: DOMRect, intent: BloomIntent) => {
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBlooms((current) => [...current, { id, spec: makeBloomSpec(rect, intent, themeId) }]);
    },
    [themeId],
  );

  const removeBloom = useCallback((id: string) => {
    setBlooms((current) => current.filter((item) => item.id !== id));
  }, []);

  const resetBlooms = useCallback(() => {
    setBlooms([]);
  }, []);

  return {
    blooms,
    triggerBloom,
    removeBloom,
    resetBlooms,
  };
}
