// CSS Custom Highlight API rendering. No DOM mutation.
// All Lens markers share a single `lumen-marker` highlight; one Range per lens.

import { LUMEN_THEMES, type LumenThemeId } from "./theme";

const HIGHLIGHT_NAME = "lumen-marker";

const lensRanges = new Map<string, Range>();
let highlight: Highlight | null = null;

function ensureHighlight(): Highlight {
  if (highlight) return highlight;
  if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !CSS.highlights) {
    throw new Error("CSS Custom Highlight API not supported in this browser");
  }
  highlight = new Highlight();
  CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  return highlight;
}

export function applyHighlight(lensId: string, range: Range): void {
  const h = ensureHighlight();
  const old = lensRanges.get(lensId);
  if (old) h.delete(old);
  lensRanges.set(lensId, range);
  h.add(range);
}

export function removeHighlight(lensId: string): void {
  if (!highlight) return;
  const r = lensRanges.get(lensId);
  if (r) {
    highlight.delete(r);
    lensRanges.delete(lensId);
  }
}

export function clearAllHighlights(): void {
  if (highlight) highlight.clear();
  lensRanges.clear();
}

export function getRangeForLens(lensId: string): Range | null {
  return lensRanges.get(lensId) ?? null;
}

// --- Cluster heat highlights (amber gets denser as more Lens overlap) ---

const CLUSTER_HEAT_LEVELS = [2, 3, 4] as const;
type ClusterHeatLevel = (typeof CLUSTER_HEAT_LEVELS)[number];

const clusterHeatRanges = new Map<string, { range: Range; level: ClusterHeatLevel }>();
const clusterHeatHighlights = new Map<ClusterHeatLevel, Highlight>();

function heatLevelForDepth(depth: number): ClusterHeatLevel {
  if (depth >= 4) return 4;
  if (depth >= 3) return 3;
  return 2;
}

function clusterHeatName(level: ClusterHeatLevel): string {
  return `lumen-cluster-${level}`;
}

function ensureClusterHeatHighlight(level: ClusterHeatLevel): Highlight {
  const existing = clusterHeatHighlights.get(level);
  if (existing) return existing;
  if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !CSS.highlights) {
    throw new Error("CSS Custom Highlight API not supported");
  }
  const highlight = new Highlight();
  clusterHeatHighlights.set(level, highlight);
  CSS.highlights.set(clusterHeatName(level), highlight);
  return highlight;
}

export function applyClusterHighlight(key: string, range: Range, depth: number): void {
  const level = heatLevelForDepth(depth);
  const h = ensureClusterHeatHighlight(level);
  const old = clusterHeatRanges.get(key);
  if (old) ensureClusterHeatHighlight(old.level).delete(old.range);
  clusterHeatRanges.set(key, { range, level });
  h.add(range);
}

export function clearAllClusterHighlights(): void {
  for (const h of clusterHeatHighlights.values()) h.clear();
  clusterHeatRanges.clear();
}

export function setMarkerTheme(themeId: LumenThemeId): void {
  const style = document.getElementById("lumen-marker-style") ?? document.createElement("style");
  const theme = LUMEN_THEMES[themeId];
  if (!style.id) {
    style.id = "lumen-marker-style";
    document.head.appendChild(style);
  }
  style.textContent = markerStyleText(theme.marker);
}

// Inject the global stylesheet that draws the dotted-underline on highlights.
// Called once on content-script init.
export function injectMarkerStyles(themeId: LumenThemeId): void {
  setMarkerTheme(themeId);
}

function markerStyleText(marker: {
  primary: string;
  cluster2: string;
  cluster3: string;
  cluster4: string;
}): string {
  return `
    ::highlight(${HIGHLIGHT_NAME}) {
      text-decoration: underline dotted ${marker.primary};
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    ::highlight(${clusterHeatName(2)}) {
      text-decoration: underline dotted ${marker.cluster2};
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    ::highlight(${clusterHeatName(3)}) {
      text-decoration: underline dotted ${marker.cluster3};
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
    ::highlight(${clusterHeatName(4)}) {
      text-decoration: underline dotted ${marker.cluster4};
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
  `;
}

// Find which lenses (if any) cover the given client-coord point. Used to
// detect clicks on highlights without mutating the DOM.
export function lensIdsAtPoint(x: number, y: number): string[] {
  type CaretPositionFn = (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  const docAny = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: CaretPositionFn;
  };

  let pointRange: Range | null = null;
  if (docAny.caretRangeFromPoint) {
    pointRange = docAny.caretRangeFromPoint(x, y);
  } else if (docAny.caretPositionFromPoint) {
    const pos = docAny.caretPositionFromPoint(x, y);
    if (pos) {
      pointRange = document.createRange();
      pointRange.setStart(pos.offsetNode, pos.offset);
      pointRange.collapse(true);
    }
  }
  if (!pointRange) return [];

  const ids: string[] = [];
  for (const [id, r] of lensRanges) {
    if (rangeContainsPoint(r, pointRange)) ids.push(id);
  }
  return ids;
}

export function lensAtPoint(x: number, y: number): string | null {
  return lensIdsAtPoint(x, y)[0] ?? null;
}

function rangeContainsPoint(range: Range, point: Range): boolean {
  return (
    range.compareBoundaryPoints(Range.START_TO_START, point) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, point) >= 0
  );
}
