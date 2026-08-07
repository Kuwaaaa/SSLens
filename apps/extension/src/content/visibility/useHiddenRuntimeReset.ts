import { useEffect } from "react";

import {
  clearAllClusterHighlights,
  clearAllHighlights,
} from "../../marker";

interface UseHiddenRuntimeResetInput {
  hidden: boolean;
  resetOverlayUi: () => void;
  resetCompanion: () => void;
  resetBlooms: () => void;
}

export function useHiddenRuntimeReset({
  hidden,
  resetOverlayUi,
  resetCompanion,
  resetBlooms,
}: UseHiddenRuntimeResetInput): void {
  useEffect(() => {
    if (!hidden) return;
    clearAllHighlights();
    clearAllClusterHighlights();
    resetOverlayUi();
    resetCompanion();
    resetBlooms();
  }, [hidden, resetOverlayUi, resetCompanion, resetBlooms]);
}
