import { describe, expect, test } from "bun:test";
import type { Lens } from "@lumen/schema";

import { mergeLensLists, refsFromBody, shouldShowInMode } from "./lens-model";

function lens(input: Partial<Lens> & Pick<Lens, "id" | "type" | "createdAt">): Lens {
  return {
    tags: [],
    anchor: { quote: { exact: "anchor" } },
    body: "body",
    author: { id: "author", handle: "author" },
    reactions: {},
    replyCount: 0,
    saveCount: 0,
    ...input,
  };
}

describe("lens-model", () => {
  test("filters reading modes without hiding viewer-authored Lens", () => {
    expect(shouldShowInMode(lens({ id: "q", type: "question", createdAt: 1 }), "quiet")).toBe(false);
    expect(shouldShowInMode(lens({ id: "k", type: "knowledge", createdAt: 1 }), "quiet")).toBe(true);
    expect(shouldShowInMode(lens({ id: "f", type: "fun", createdAt: 1 }), "thinking")).toBe(false);
    expect(shouldShowInMode(lens({ id: "mine", type: "fun", createdAt: 1, viewerIsAuthor: true }), "quiet")).toBe(true);
    expect(shouldShowInMode(lens({ id: "any", type: "spoiler", createdAt: 1 }), "full")).toBe(true);
  });

  test("extracts Lens and URL references from Markdown body", () => {
    expect(refsFromBody("See [[lens:l1|first]] and [[url:https://example.com/a|site]].")).toEqual([
      { kind: "lens", target: "l1", label: "first" },
      { kind: "url", target: "https://example.com/a", label: "site" },
    ]);
  });

  test("merges incoming Lens by id and keeps createdAt ordering", () => {
    const current = [
      lens({ id: "b", type: "quick", createdAt: 20, body: "old" }),
      lens({ id: "a", type: "quick", createdAt: 10 }),
    ];
    const incoming = [
      lens({ id: "b", type: "knowledge", createdAt: 20, body: "new" }),
      lens({ id: "c", type: "question", createdAt: 30 }),
    ];

    expect(mergeLensLists(current, incoming).map((item) => [item.id, item.type, item.body])).toEqual([
      ["a", "quick", "body"],
      ["b", "knowledge", "new"],
      ["c", "question", "body"],
    ]);
  });
});
