import { describe, expect, test } from "bun:test";

import { buildClusterHeatRects } from "./clusters";

(globalThis as unknown as { window: { innerHeight: number; innerWidth: number } }).window = {
  innerHeight: 800,
  innerWidth: 1200,
};

describe("surface clusters", () => {
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
