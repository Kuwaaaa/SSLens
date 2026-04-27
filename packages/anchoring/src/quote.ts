// TextQuoteSelector: locate the best occurrence of `exact` in the flat
// document text, ranked by prefix/suffix similarity when there are
// multiple matches.

import type { TextIndex } from "./text-index";

export interface QuoteSelector {
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface FlatRange {
  start: number;
  end: number;
}

export function findByQuote(quote: QuoteSelector, index: TextIndex): FlatRange | null {
  const { text } = index;
  const exact = quote.exact;
  if (!exact) return null;

  const candidates: number[] = [];
  let cursor = 0;
  while (true) {
    const i = text.indexOf(exact, cursor);
    if (i < 0) break;
    candidates.push(i);
    cursor = i + 1;
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { start: candidates[0], end: candidates[0] + exact.length };
  }

  // Multiple occurrences: pick the one whose surrounding context best
  // matches the stored prefix/suffix.
  let bestStart = candidates[0];
  let bestScore = -1;
  for (const idx of candidates) {
    let score = 0;
    if (quote.prefix) {
      const before = text.slice(Math.max(0, idx - quote.prefix.length), idx);
      score += suffixMatchLength(before, quote.prefix);
    }
    if (quote.suffix) {
      const after = text.slice(idx + exact.length, idx + exact.length + quote.suffix.length);
      score += prefixMatchLength(after, quote.suffix);
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = idx;
    }
  }

  return { start: bestStart, end: bestStart + exact.length };
}

export function buildQuoteSelector(
  index: TextIndex,
  start: number,
  end: number,
  context = 32,
): QuoteSelector {
  const exact = index.text.slice(start, end);
  const prefix = index.text.slice(Math.max(0, start - context), start);
  const suffix = index.text.slice(end, Math.min(index.text.length, end + context));
  return { exact, prefix, suffix };
}

// Trailing-character match length between `a` and `b`.
function suffixMatchLength(a: string, b: string): number {
  let n = 0;
  const min = Math.min(a.length, b.length);
  for (let i = 1; i <= min; i++) {
    if (a[a.length - i] === b[b.length - i]) n++;
    else break;
  }
  return n;
}

// Leading-character match length between `a` and `b`.
function prefixMatchLength(a: string, b: string): number {
  let n = 0;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) {
    if (a[i] === b[i]) n++;
    else break;
  }
  return n;
}
