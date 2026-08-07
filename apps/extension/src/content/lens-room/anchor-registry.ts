import { useCallback, useRef, useState } from "react";
import type { Lens, LensAnchor } from "@lumen/schema";
import { restoreAnchor } from "@lumen/anchoring";

export function useAnchorRegistry() {
  const rangesRef = useRef<Map<string, Range>>(new Map());
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());

  const getRange = useCallback((lensId: string): Range | null => (
    rangesRef.current.get(lensId) ?? null
  ), []);

  const hasRange = useCallback((lensId: string): boolean => (
    rangesRef.current.has(lensId)
  ), []);

  const clearRanges = useCallback(() => {
    rangesRef.current.clear();
  }, []);

  const removeLens = useCallback((lensId: string) => {
    rangesRef.current.delete(lensId);
    setOrphanIds((current) => {
      if (!current.has(lensId)) return current;
      const next = new Set(current);
      next.delete(lensId);
      return next;
    });
  }, []);

  const markOrphan = useCallback((lensId: string) => {
    rangesRef.current.delete(lensId);
    setOrphanIds((current) => {
      if (current.has(lensId)) return current;
      const next = new Set(current);
      next.add(lensId);
      return next;
    });
  }, []);

  const setRestoredRange = useCallback((lensId: string, range: Range) => {
    rangesRef.current.set(lensId, range);
    setOrphanIds((current) => {
      if (!current.has(lensId)) return current;
      const next = new Set(current);
      next.delete(lensId);
      return next;
    });
  }, []);

  const restoreLensAnchor = useCallback((lens: Lens): Range | null => {
    const range = restoreAnchor(lens.anchor);
    if (range) {
      setRestoredRange(lens.id, range);
    } else {
      markOrphan(lens.id);
    }
    return range;
  }, [markOrphan, setRestoredRange]);

  const restoreLensAnchorWithFallback = useCallback((
    lensId: string,
    anchor: LensAnchor,
    fallbackRange: Range,
  ): Range => {
    const restored = restoreAnchor(anchor) ?? fallbackRange.cloneRange();
    setRestoredRange(lensId, restored);
    return restored;
  }, [setRestoredRange]);

  const restoreLensBatch = useCallback((lenses: Lens[]) => {
    const orphans = new Set<string>();
    for (const lens of lenses) {
      const range = restoreAnchor(lens.anchor);
      if (range) rangesRef.current.set(lens.id, range);
      else {
        rangesRef.current.delete(lens.id);
        orphans.add(lens.id);
      }
    }
    setOrphanIds((current) => {
      const next = new Set(current);
      for (const lens of lenses) {
        if (orphans.has(lens.id)) next.add(lens.id);
        else next.delete(lens.id);
      }
      return next;
    });
    return orphans;
  }, []);

  return {
    orphanIds,
    getRange,
    hasRange,
    clearRanges,
    removeLens,
    markOrphan,
    setRestoredRange,
    restoreLensAnchor,
    restoreLensAnchorWithFallback,
    restoreLensBatch,
  };
}
