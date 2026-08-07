import type { Lens } from "@lumen/schema";

import type { ActiveLensStack } from "../types";

type RangeLookup = (lensId: string) => Range | null;

export function rangesOverlap(a: Range, b: Range): boolean {
  // START_TO_END: compares a.end vs b.start -> >0 means a.end is after b.start.
  // END_TO_START: compares a.start vs b.end -> <0 means a.start is before b.end.
  return (
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0 &&
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0
  );
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
    a.compareBoundaryPoints(Range.END_TO_END, b) === 0
  );
}

function rangeTextLength(range: Range): number {
  return range.toString().length;
}

export function clusterIdsForLens(id: string, pool: Lens[], getRange: RangeLookup): string[] {
  const rootRange = getRange(id);
  if (!rootRange) return [];
  const siblings = pool
    .filter((lens) => {
      if (lens.id === id) return false;
      const range = getRange(lens.id);
      return range ? rangesOverlap(rootRange, range) : false;
    })
    .sort((a, b) => {
      const aRange = getRange(a.id);
      const bRange = getRange(b.id);
      const aExact = aRange ? rangesEqual(rootRange, aRange) : false;
      const bExact = bRange ? rangesEqual(rootRange, bRange) : false;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  return siblings.map((lens) => lens.id);
}

export function sortClusterLensIds(ids: string[], lenses: Lens[], getRange: RangeLookup): string[] {
  return [...ids].sort((a, b) => {
    const aRange = getRange(a);
    const bRange = getRange(b);
    const aLength = aRange ? rangeTextLength(aRange) : Number.MAX_SAFE_INTEGER;
    const bLength = bRange ? rangeTextLength(bRange) : Number.MAX_SAFE_INTEGER;
    if (aLength !== bLength) return aLength - bLength;
    const aLens = lenses.find((lens) => lens.id === a);
    const bLens = lenses.find((lens) => lens.id === b);
    return (aLens?.createdAt ?? 0) - (bLens?.createdAt ?? 0);
  });
}

export function activeStackForLens(
  id: string,
  lenses: Lens[],
  clusterableLenses: Lens[],
  getRange: RangeLookup,
): ActiveLensStack {
  if (!lenses.find((lens) => lens.id === id)) {
    return {
      rootId: id,
      clusterIds: [],
      childIds: [],
    };
  }
  return {
    rootId: id,
    clusterIds: sortClusterLensIds(
      clusterIdsForLens(id, clusterableLenses, getRange),
      lenses,
      getRange,
    ),
    childIds: [],
  };
}

export function preferredLensIdAtPoint(ids: string[], lenses: Lens[], getRange: RangeLookup): string | null {
  return sortClusterLensIds([...new Set(ids)], lenses, getRange)[0] ?? null;
}

export function lensesForActiveStack(stack: ActiveLensStack | null, lenses: Lens[]): Lens[] {
  return stack
    ? [stack.rootId, ...stack.clusterIds, ...stack.childIds]
        .map((id) => lenses.find((lens) => lens.id === id) ?? null)
        .filter((lens): lens is Lens => !!lens)
    : [];
}

export function openReferencedLensStack(
  current: ActiveLensStack | null,
  id: string,
  lenses: Lens[],
  clusterableLenses: Lens[],
  getRange: RangeLookup,
): ActiveLensStack {
  if (!current) return activeStackForLens(id, lenses, clusterableLenses, getRange);
  const existingIndex = current.childIds.indexOf(id);
  if (current.rootId === id) return { ...current, childIds: [] };
  if (current.clusterIds.includes(id)) {
    return activeStackForLens(id, lenses, clusterableLenses, getRange);
  }
  if (existingIndex >= 0) {
    return { ...current, childIds: current.childIds.slice(0, existingIndex + 1) };
  }
  return { ...current, childIds: [...current.childIds, id] };
}
