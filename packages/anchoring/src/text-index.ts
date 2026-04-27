// Build a flat string index of the document's visible text, plus a map
// back to the underlying text nodes. Working in flat character offsets
// makes cross-node ranges trivial.

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
]);

export interface TextIndexEntry {
  node: Text;
  start: number;
  end: number;
}

export interface TextIndex {
  text: string;
  entries: TextIndexEntry[];
}

export function buildTextIndex(root: Element): TextIndex {
  const parts: string[] = [];
  const entries: TextIndexEntry[] = [];
  let offset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      // Don't index our own overlay
      if (parent.closest("#lumen-root, [data-lumen-overlay]")) return NodeFilter.FILTER_REJECT;
      const text = node.textContent ?? "";
      if (!text) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent ?? "";
    entries.push({ node, start: offset, end: offset + text.length });
    parts.push(text);
    offset += text.length;
  }

  return { text: parts.join(""), entries };
}

// Locate where a (container, offset) boundary lives in the flat text.
// Handles both Text-node containers (offset is char index) and Element
// containers (offset is child index).
function flatOffsetForBoundary(
  index: TextIndex,
  container: Node,
  offset: number,
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = index.entries.find((e) => e.node === container);
    if (!entry) return null;
    const clamped = Math.min(offset, entry.end - entry.start);
    return entry.start + clamped;
  }

  if (container.nodeType === Node.ELEMENT_NODE) {
    const children = container.childNodes;
    if (offset >= children.length) {
      // Boundary is at end-of-element. Use the last indexed entry that
      // descends from this container.
      let last: TextIndexEntry | null = null;
      for (const e of index.entries) {
        if (container.contains(e.node)) last = e;
      }
      return last ? last.end : null;
    }
    const targetChild = children[offset];
    for (const e of index.entries) {
      if (e.node === targetChild || targetChild.contains(e.node)) {
        return e.start;
      }
    }
    return null;
  }

  return null;
}

export function rangeToFlatOffsets(
  range: Range,
  index: TextIndex,
): { start: number; end: number } | null {
  const start = flatOffsetForBoundary(index, range.startContainer, range.startOffset);
  const end = flatOffsetForBoundary(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end < start) return null;
  return { start, end };
}

export function flatOffsetsToRange(
  start: number,
  end: number,
  index: TextIndex,
): Range | null {
  const startEntry = index.entries.find((e) => start >= e.start && start <= e.end);
  const endEntry = index.entries.find((e) => end >= e.start && end <= e.end);
  if (!startEntry || !endEntry) return null;
  const range = document.createRange();
  range.setStart(startEntry.node, start - startEntry.start);
  range.setEnd(endEntry.node, end - endEntry.start);
  return range;
}
