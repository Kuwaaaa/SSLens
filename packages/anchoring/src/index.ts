// Public API. `LensAnchor` matches the @lumen/schema shape so values are
// directly serializable to/from the server.

import type { LensAnchor } from "@lumen/schema";
import {
  buildTextIndex,
  flatOffsetsToRange,
  rangeToFlatOffsets,
  type TextIndex,
} from "./text-index";
import { buildQuoteSelector, findByQuote } from "./quote";
import { fuzzyFind } from "./match";

export type { LensAnchor };
export { buildTextIndex, flatOffsetsToRange, rangeToFlatOffsets };
export type { TextIndex };

const DEFAULT_CONTEXT = 32;

export function createAnchor(range: Range, root: Element = document.body): LensAnchor {
  const index = buildTextIndex(root);
  const offsets = rangeToFlatOffsets(range, index);

  if (!offsets) {
    // Range doesn't sit cleanly in the indexed text (e.g., user selected
    // inside a script tag). Best effort: store just the raw quote.
    const exact = range.toString();
    return { quote: { exact } };
  }

  const quote = buildQuoteSelector(index, offsets.start, offsets.end, DEFAULT_CONTEXT);

  return {
    quote: {
      exact: quote.exact,
      prefix: quote.prefix,
      suffix: quote.suffix,
    },
    position: { start: offsets.start, end: offsets.end },
  };
}

export function restoreAnchor(anchor: LensAnchor, root: Element = document.body): Range | null {
  const index = buildTextIndex(root);
  return restoreAgainstIndex(anchor, index);
}

function restoreAgainstIndex(anchor: LensAnchor, index: TextIndex): Range | null {
  // 1) TextPositionSelector — only trust it if the slice still matches
  //    the stored exact quote. Otherwise the page text has shifted and
  //    we fall through.
  if (anchor.position && anchor.quote?.exact) {
    const slice = index.text.slice(anchor.position.start, anchor.position.end);
    if (slice === anchor.quote.exact) {
      const r = flatOffsetsToRange(anchor.position.start, anchor.position.end, index);
      if (r) return r;
    }
  }

  // 2) TextQuoteSelector with prefix/suffix tie-breaking.
  if (anchor.quote?.exact) {
    const hit = findByQuote(anchor.quote, index);
    if (hit) {
      const r = flatOffsetsToRange(hit.start, hit.end, index);
      if (r) return r;
    }
  }

  // 3) Fuzzy fallback for editing/typo drift.
  if (anchor.quote?.exact) {
    const fuzz = fuzzyFind(anchor.quote.exact, index);
    if (fuzz) {
      const r = flatOffsetsToRange(fuzz.start, fuzz.end, index);
      if (r) return r;
    }
  }

  return null;
}
