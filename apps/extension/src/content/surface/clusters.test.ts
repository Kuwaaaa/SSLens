import { describe, expect, test } from "bun:test";
import type { Lens } from "@lumen/schema";
import type { TextIndex } from "@lumen/anchoring";

import { buildClusterHeatRects, buildClusterHeatSegmentsFromIndex } from "./clusters";

(globalThis as unknown as { window: { innerHeight: number; innerWidth: number } }).window = {
  innerHeight: 800,
  innerWidth: 1200,
};
(globalThis as unknown as { Node: { TEXT_NODE: number; ELEMENT_NODE: number } }).Node = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1,
};

function lens(id: string): Lens {
  return {
    id,
    type: "quick",
    tags: [],
    anchor: { quote: { exact: id } },
    body: id,
    author: { id: "author", handle: "author" },
    reactions: {},
    replyCount: 0,
    saveCount: 0,
    createdAt: 1,
  };
}

describe("surface clusters", () => {
  test("builds heat segments from an injected text index", () => {
    const node = { nodeType: 3, textContent: "abcdefghij" } as Text;
    (globalThis as unknown as { document: { createRange: () => Range } }).document = {
      createRange: () => {
        const range = {
          startOffset: 0,
          endOffset: 0,
          setStart(_node: Text, offset: number) {
            this.startOffset = offset;
          },
          setEnd(_node: Text, offset: number) {
            this.endOffset = offset;
          },
        };
        return range as unknown as Range;
      },
    };
    const index: TextIndex = { text: "abcdefghij", entries: [{ node, start: 0, end: 10 }] };
    const ranges = new Map([
      ["a", { startContainer: node, startOffset: 0, endContainer: node, endOffset: 6 } as unknown as Range],
      ["b", { startContainer: node, startOffset: 3, endContainer: node, endOffset: 9 } as unknown as Range],
    ]);

    const segments = buildClusterHeatSegmentsFromIndex(
      [lens("a"), lens("b")],
      new Set(["a"]),
      (id) => ranges.get(id) ?? null,
      index,
    );

    expect(segments.map((segment) => [segment.key, segment.depth])).toEqual([
      ["0:3", 1],
      ["3:6", 2],
    ]);
  });

  test("builds viewport-filtered heat rects with stable keys", () => {
    const range = {
      getClientRects: () => [
        { top: 10, left: 20, right: 80, bottom: 30, width: 60, height: 20 },
        { top: 900, left: 20, right: 80, bottom: 930, width: 60, height: 20 },
      ],
    } as unknown as Range;

    const rects = buildClusterHeatRects([{ key: "1:3", range, depth: 2 }], 0);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.key).toBe("1:3:0");
    expect(rects[0]?.depth).toBe(2);
    expect(rects[0]?.width).toBeGreaterThan(60);
  });
});
