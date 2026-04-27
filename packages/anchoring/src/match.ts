// Bounded-error fuzzy match using Bitap, via `approx-string-match`.
// Last fallback when exact and prefix/suffix lookup both fail.

import search from "approx-string-match";
import type { TextIndex } from "./text-index";

export interface FlatRange {
  start: number;
  end: number;
}

export function fuzzyFind(needle: string, index: TextIndex): FlatRange | null {
  if (!needle) return null;
  // Allow up to ~10% edit distance, minimum 2.
  const maxErrors = Math.max(2, Math.floor(needle.length * 0.1));
  const matches = search(index.text, needle, maxErrors);
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.errors - b.errors);
  const best = matches[0];
  return { start: best.start, end: best.end };
}
