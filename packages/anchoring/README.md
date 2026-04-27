# @lumen/anchoring

Text anchoring for Lumen. Turn a `Range` into a serializable
`LensAnchor` (W3C Web Annotation Data Model selectors); turn a
`LensAnchor` back into a `Range` on the current DOM.

## Selectors

- **TextPositionSelector** — start/end character offsets in the page's
  visible text. Cheapest restore path; only valid when the page text
  before the anchor hasn't shifted.
- **TextQuoteSelector** — exact quote with prefix/suffix context. The
  workhorse: robust to most DOM changes, since the text itself usually
  remains unchanged even when surrounding markup shifts.
- **Fuzzy fallback** — bounded-error string match via
  [`approx-string-match`](https://www.npmjs.com/package/approx-string-match)
  (Bitap algorithm). Catches small edits like typo fixes.

Restore order: TextPosition → TextQuote → fuzzy → orphan.

## Why we didn't vendor hypothesis/client

`docs/ARCHITECTURE.md` §6.2 originally proposed vendoring
`hypothesis/client/src/annotator/anchoring/` (~1500 LOC). In practice
that module has internal dependencies on hypothesis-specific utility
modules, type definitions, and PDF.js integration we don't need.

This package is a clean implementation of the same W3C model, ~250
lines of TypeScript we own, with `approx-string-match` (the actual
algorithmic value Hypothesis also depends on) as the only npm dep.
If we hit edge cases that hypothesis already handles cleanly, we can
pull more from upstream then.

## API

```ts
import { createAnchor, restoreAnchor } from "@lumen/anchoring";
import type { LensAnchor } from "@lumen/schema";

// At Lens creation time:
const anchor: LensAnchor = createAnchor(selectionRange);

// At page load time:
const range: Range | null = restoreAnchor(anchor);
```

The returned `LensAnchor` is the exact shape the schema and server
expect — no adapter layer needed.

## Known limitations (MVP)

- Whitespace not normalized — relies on the same renderer producing
  the same text. Cross-browser anchors should still work but anchors
  written against an HTML edit may not survive that edit.
- No Shadow DOM piercing — selectors only cover light DOM.
- No PDF support.
- No iframe support.
