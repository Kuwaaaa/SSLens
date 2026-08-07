import { describe, expect, test } from "bun:test";
import type { Lens } from "@lumen/schema";

import {
  activeStackForLens,
  openReferencedLensStack,
  preferredLensIdAtPoint,
  rangesOverlap,
} from "./active-stack";

const RangeConstants = {
  START_TO_START: 0,
  START_TO_END: 1,
  END_TO_END: 2,
  END_TO_START: 3,
};

(globalThis as unknown as { Range: typeof RangeConstants }).Range = RangeConstants;

interface FakeRange {
  start: number;
  end: number;
  compareBoundaryPoints: (how: number, other: FakeRange) => number;
  toString: () => string;
}

function fakeRange(start: number, end: number): Range {
  const range: FakeRange = {
    start,
    end,
    compareBoundaryPoints(how, other) {
      const left = how === RangeConstants.START_TO_END ? this.end : this.start;
      const right = how === RangeConstants.END_TO_START ? other.end : other.start;
      return left === right ? 0 : left < right ? -1 : 1;
    },
    toString() {
      return "x".repeat(Math.max(0, end - start));
    },
  };
  return range as unknown as Range;
}

function lens(id: string, createdAt: number): Lens {
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
    createdAt,
  };
}

describe("active-stack", () => {
  const lenses = [lens("a", 20), lens("b", 10), lens("c", 30), lens("d", 40)];
  const ranges = new Map([
    ["a", fakeRange(0, 10)],
    ["b", fakeRange(0, 10)],
    ["c", fakeRange(2, 5)],
    ["d", fakeRange(20, 30)],
  ]);
  const getRange = (id: string) => ranges.get(id) ?? null;

  test("detects overlapping ranges", () => {
    expect(rangesOverlap(fakeRange(0, 10), fakeRange(9, 12))).toBe(true);
    expect(rangesOverlap(fakeRange(0, 10), fakeRange(10, 12))).toBe(false);
  });

  test("builds active stack with short overlapping Lens first", () => {
    expect(activeStackForLens("a", lenses, lenses, getRange)).toEqual({
      rootId: "a",
      clusterIds: ["c", "b"],
      childIds: [],
    });
  });

  test("prefers the shortest clicked Lens and preserves reference navigation", () => {
    expect(preferredLensIdAtPoint(["a", "c"], lenses, getRange)).toBe("c");
    expect(openReferencedLensStack({ rootId: "a", clusterIds: ["c"], childIds: [] }, "d", lenses, lenses, getRange)).toEqual({
      rootId: "a",
      clusterIds: ["c"],
      childIds: ["d"],
    });
    expect(openReferencedLensStack({ rootId: "a", clusterIds: ["c"], childIds: ["d"] }, "c", lenses, lenses, getRange)).toEqual({
      rootId: "c",
      clusterIds: ["b", "a"],
      childIds: [],
    });
  });
});
