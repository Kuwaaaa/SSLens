// Simple text-quote anchoring for MVP. Walks visible text nodes, finds the
// first occurrence of `anchor.quote.exact`. Single-text-node match only.
//
// TODO: replace with vendored hypothesis/client/src/annotator/anchoring/
// (~1500 LOC, BSD-2) for cross-node ranges, prefix/suffix recovery, and
// approx-string-match fuzzy fallback. See ARCHITECTURE.md §6.2.

import type { LensAnchor } from "@lumen/schema";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"]);

function isSkippable(node: Node): boolean {
  const parent = (node as Text).parentElement;
  if (!parent) return true;
  if (SKIP_TAGS.has(parent.tagName)) return true;
  if (parent.closest("#lumen-root, [data-lumen-overlay]")) return true;
  return false;
}

export function findAnchor(anchor: LensAnchor, root: Node = document.body): Range | null {
  const exact = anchor.quote?.exact;
  if (!exact) return null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isSkippable(node)) return NodeFilter.FILTER_REJECT;
      const text = node.textContent ?? "";
      if (!text.trim()) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent ?? "";
    const idx = text.indexOf(exact);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + exact.length);
      return range;
    }
  }

  return null;
}

export function createAnchor(range: Range): LensAnchor {
  // Capture small prefix/suffix so the future Hypothesis-based recovery has
  // something to work with even though we don't use them ourselves yet.
  const exact = range.toString();
  const { prefix, suffix } = collectContext(range, 32);
  return { quote: { exact, prefix, suffix } };
}

function collectContext(range: Range, n: number): { prefix: string; suffix: string } {
  const before = document.createRange();
  before.setStart(document.body, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const beforeText = before.toString();
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(document.body, document.body.childNodes.length);
  const afterText = after.toString();
  return {
    prefix: beforeText.slice(-n),
    suffix: afterText.slice(0, n),
  };
}
