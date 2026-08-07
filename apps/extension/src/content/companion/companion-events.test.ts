import { describe, expect, test } from "bun:test";

import {
  companionEmojiForEvent,
  companionMessagesForEvent,
  companionUsersForEvent,
} from "./companion-events";

describe("companion events", () => {
  test("derives presence user lists from room events", () => {
    expect(companionUsersForEvent([], { type: "companion_presence", users: ["a", "b"] })).toEqual(["a", "b"]);
    expect(companionUsersForEvent(["a"], { type: "companion_joined", userId: "b" })).toEqual(["a", "b"]);
    expect(companionUsersForEvent(["a", "b"], { type: "companion_joined", users: ["c"] })).toEqual(["c"]);
    expect(companionUsersForEvent(["a", "b"], { type: "companion_left", userId: "a" })).toEqual(["b"]);
    expect(companionUsersForEvent(["a"], { type: "companion_chat" })).toBeNull();
  });

  test("parses emoji bursts defensively", () => {
    expect(companionEmojiForEvent({ type: "companion_emoji", emoji: "🔥", edge: "left", y: 0.2 })).toEqual({
      emoji: "🔥",
      edge: "left",
      y: 0.2,
    });
    expect(companionEmojiForEvent({ type: "companion_emoji", emoji: "🔥", edge: "top", y: 0.2 })).toBeNull();
    expect(companionEmojiForEvent({ type: "companion_chat" })).toBeNull();
  });

  test("parses chat history and chat events", () => {
    expect(companionMessagesForEvent({
      type: "companion_chat_history",
      messages: [
        { id: "1", userId: "u", handle: "h", body: "hi", at: 1 },
        { id: "bad", body: "missing fields" },
      ],
    })).toEqual([{ id: "1", userId: "u", handle: "h", body: "hi", at: 1 }]);

    expect(companionMessagesForEvent({
      type: "companion_chat",
      id: "2",
      body: "hello",
    }, () => 42)).toEqual([{ id: "2", userId: "unknown", handle: "unknown", body: "hello", at: 42 }]);

    expect(companionMessagesForEvent({ type: "companion_chat", id: "3", body: "   " })).toEqual([]);
    expect(companionMessagesForEvent({ type: "companion_presence" })).toBeNull();
  });
});
