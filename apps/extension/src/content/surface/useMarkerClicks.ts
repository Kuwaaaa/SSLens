import { useEffect } from "react";

import { lensIdsAtPoint } from "../../marker";
import { isInsideLumenOverlay } from "./overlay-target";

interface UseMarkerClicksOptions {
  disabled: boolean;
  onMarkerLensIds: (lensIds: string[]) => void;
  onEmptyClick: () => void;
}

export function useMarkerClicks({
  disabled,
  onMarkerLensIds,
  onEmptyClick,
}: UseMarkerClicksOptions): void {
  useEffect(() => {
    if (disabled) return;
    function onClick(e: MouseEvent) {
      if (isInsideLumenOverlay(e.target)) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length >= 3) {
        return;
      }
      const pointIds = lensIdsAtPoint(e.clientX, e.clientY);
      if (pointIds.length > 0) {
        onMarkerLensIds(pointIds);
      } else {
        onEmptyClick();
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [disabled, onMarkerLensIds, onEmptyClick]);
}
