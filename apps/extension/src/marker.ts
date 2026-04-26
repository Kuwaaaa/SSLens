// CSS Custom Highlight API rendering. No DOM mutation.
// All Lens markers share a single `lumen-marker` highlight; one Range per lens.

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
  if (!highlight) return;
  highlight.clear();
  lensRanges.clear();
}

export function getRangeForLens(lensId: string): Range | null {
  return lensRanges.get(lensId) ?? null;
}

// Inject the global stylesheet that draws the dotted-underline on highlights.
// Called once on content-script init.
export function injectMarkerStyles(): void {
  if (document.getElementById("lumen-marker-style")) return;
  const style = document.createElement("style");
  style.id = "lumen-marker-style";
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) {
      text-decoration: underline dotted #6b21a8;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
      background-color: rgba(168, 85, 247, 0.06);
    }
  `;
  document.head.appendChild(style);
}

// Find which lens (if any) covers the given client-coord point. Used to
// detect clicks on highlights without mutating the DOM.
export function lensAtPoint(x: number, y: number): string | null {
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
  if (!pointRange) return null;

  for (const [id, r] of lensRanges) {
    if (rangeContainsPoint(r, pointRange)) return id;
  }
  return null;
}

function rangeContainsPoint(range: Range, point: Range): boolean {
  return (
    range.compareBoundaryPoints(Range.START_TO_START, point) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, point) >= 0
  );
}
