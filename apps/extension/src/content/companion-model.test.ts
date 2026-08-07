import { describe, expect, test } from "bun:test";

import { isCompanionChatMessage, mergeCompanionMessages } from "./companion-model";

describe("companion-model", () => {
  test("guards complete chat messages", () => {
    expect(isCompanionChatMessage({ id: "1", userId: "u", handle: "h", body: "hi", at: 1 })).toBe(true);
    expect(isCompanionChatMessage({ id: "1", userId: "u", handle: "h", body: "hi" })).toBe(false);
    expect(isCompanionChatMessage(null)).toBe(false);
  });

  test("dedupes, sorts, and caps chat history", () => {
    const current = [{ id: "a", userId: "u", handle: "h", body: "old", at: 2 }];
    const incoming = [
      { id: "b", userId: "u", handle: "h", body: "new", at: 1 },
      { id: "a", userId: "u", handle: "h", body: "replace", at: 3 },
    ];
    expect(mergeCompanionMessages(current, incoming)).toEqual([
      { id: "b", userId: "u", handle: "h", body: "new", at: 1 },
      { id: "a", userId: "u", handle: "h", body: "replace", at: 3 },
    ]);

    const many = Array.from({ length: 45 }, (_, i) => ({ id: `${i}`, userId: "u", handle: "h", body: "m", at: i }));
    expect(mergeCompanionMessages([], many)).toHaveLength(40);
    expect(mergeCompanionMessages([], many)[0]?.id).toBe("5");
  });
});
