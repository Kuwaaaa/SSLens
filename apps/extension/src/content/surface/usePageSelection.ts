import { useEffect } from "react";

import type { SelectionDraft } from "../types";
import { isInsideLumenOverlay } from "./overlay-target";

interface UsePageSelectionOptions {
  disabled: boolean;
  onDraft: (draft: SelectionDraft) => void;
  onClearDraft: () => void;
}

export function usePageSelection({
  disabled,
  onDraft,
  onClearDraft,
}: UsePageSelectionOptions): void {
  useEffect(() => {
    if (disabled) return;
    function onMouseUp(e: MouseEvent) {
      if (isInsideLumenOverlay(e.target)) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        onClearDraft();
        return;
      }
      const range = sel.getRangeAt(0);
      const text = range.toString().trim();
      if (text.length < 3) {
        onClearDraft();
        return;
      }
      const rect = range.getBoundingClientRect();
      onDraft({ range: range.cloneRange(), text, rect });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [disabled, onDraft, onClearDraft]);
}
