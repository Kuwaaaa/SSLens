# Lens Anchoring Technical Design

Date: 2026-04-25
Status: Draft v0.1

## 1. Goal

Lumen must reliably attach Lens cards to specific webpage content. The first MVP supports normal HTML pages and single-range text selections. PDF, iframe-heavy pages, Shadow DOM, and virtualized content are deferred.

## 2. Core Strategy

Do not rely on one anchor format. Store multiple selectors and recover in layers:

1. DOM range path for fast restoration
2. Text position for stable same-version pages
3. Exact quote with prefix/suffix for DOM-change recovery
4. Fuzzy matching as fallback
5. Orphan state if no reliable match

## 3. Annotation Target Schema

```json
{
  "id": "anno_123",
  "url": "https://example.com/article",
  "canonicalUrl": "https://example.com/article",
  "createdAt": "2026-04-25T10:00:00Z",
  "page": {
    "title": "Article title",
    "contentHash": "sha256(normalized-main-text)",
    "textLength": 18420
  },
  "target": {
    "quote": {
      "type": "TextQuoteSelector",
      "exact": "selected text",
      "prefix": "32-80 chars before",
      "suffix": "32-80 chars after"
    },
    "position": {
      "type": "TextPositionSelector",
      "start": 1024,
      "end": 1037
    },
    "domRange": {
      "startCss": "article p:nth-of-type(3)",
      "startXPath": "/html/body/main/article/p[3]/text()[1]",
      "startTextOffset": 15,
      "endCss": "article p:nth-of-type(3)",
      "endXPath": "/html/body/main/article/p[3]/text()[1]",
      "endTextOffset": 28
    }
  },
  "status": "anchored",
  "confidence": 1.0
}
```

## 4. Text Normalization

Normalize text before storing and matching:

- Decode entities
- Normalize Unicode
- Merge whitespace
- Trim invisible characters
- Keep CJK punctuation meaningful
- Count by stable code point/grapheme strategy, not raw UTF-16 offsets when possible

## 5. Creating an Anchor

Flow:

1. Read `window.getSelection()`.
2. Accept only non-empty single-range text selections in MVP.
3. Capture `Range` start/end containers and offsets.
4. Build a visible text-node index using `TreeWalker`.
5. Convert DOM range to global text offsets.
6. Extract exact selected text plus prefix/suffix context.
7. Serialize CSS/XPath-ish element paths.
8. Save page title, canonical URL, normalized text length, optional page content hash.

## 6. Restoring an Anchor

### Step 1: DOM Range Recovery

Use stored `domRange` paths and offsets. Extract current text and compare to `quote.exact` after normalization. If it matches, render highlight.

### Step 2: Position Recovery

Use `position.start/end` against current normalized full text. If exact text matches or similarity is very high, map offsets back to text nodes and render.

### Step 3: Exact Quote Search

Search current page text for `quote.exact`. If multiple matches exist, rank by:

- Prefix/suffix similarity
- Distance from original start offset
- DOM path similarity
- Visibility and main-content likelihood

### Step 4: Context Fuzzy Search

Find approximate prefix/suffix first, then compare middle text with exact quote. This is safer than fuzzy-searching the selected text globally.

### Step 5: Exact Fuzzy Search

Use fuzzy search only as last fallback. If confidence is low or candidates are too close, do not auto-anchor.

### Step 6: Orphan State

If recovery fails, keep the Lens but mark it as unanchored. UI should show:

- Original selected text
- “This Lens lost its page position”
- Re-anchor button

## 7. Highlight Rendering

MVP recommendation:

- Traverse visible text nodes.
- Split text nodes around ranges.
- Wrap segments in `span` or `mark` with `data-lumen-lens-id`.
- Avoid relying on `Range.surroundContents()` for cross-node ranges.
- Use Shadow DOM root for Lumen UI, but not necessarily for text highlights.

Marker style:

- Dotted underline or soft glow
- Avoid heavy background by default
- Add margin badge for paragraph-level clusters

## 8. SPA & Mutation Handling

- Run restoration after `DOMContentLoaded` and `load`.
- Use delayed retry for SPA content.
- Use `MutationObserver` with debounce.
- Cap retries and avoid infinite re-highlighting.
- If a framework re-renders and removes highlights, restore only visible/nearby anchors first.

## 9. Performance Rules

- Only activate on supported/whitelisted pages in MVP.
- Lazy-load heavy matching code.
- Build text index once, then update with debounce.
- Search only current article/main content when possible.
- Fuzzy search inside offset/context windows before full page.
- Do not run AI or embeddings during page load.

## 10. Privacy & Copyright

Stored quotes copy webpage text. Reduce risk by:

- Limit `exact`, `prefix`, `suffix` length.
- Do not store entire article text.
- For private Lens, keep sensitive anchors local or encrypted later.
- Do not publicly reveal user page visits by default.
- Explain extension permissions clearly.

## 11. MVP Limitations

Supported:

- Normal HTML pages
- Single text selection
- Same-document annotations
- Whitelist/canonicalized URLs

Deferred:

- PDFs
- Cross-iframe selections
- Shadow DOM internals
- Canvas content
- Virtualized infinite lists
- Video timestamp Lens
- Semantic anchoring

## 12. Recommended Libraries / Concepts

- W3C Web Annotation Data Model
- TextQuoteSelector
- TextPositionSelector
- Selection API
- Range API
- TreeWalker
- diff-match-patch or equivalent fuzzy matching
