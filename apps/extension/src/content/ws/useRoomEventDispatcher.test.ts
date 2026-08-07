import { describe, expect, test } from "bun:test";
import type { Lens, ReactionKind } from "@lumen/schema";

import type { WsRoomEvent } from "./useWsBridge";
import { dispatchRoomEvent } from "./useRoomEventDispatcher";

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

describe("room event dispatcher", () => {
  test("routes WebSocket room events to domain handlers", () => {
    const calls: string[] = [];
    const restoredRange = {} as Range;
    const handlers = {
      onCompanionEvent: (event: WsRoomEvent) => calls.push(`companion:${event.type}`),
      onLensCreated: (created: Lens) => {
        calls.push(`created:${created.id}`);
        return restoredRange;
      },
      onLensAnchorUpdated: (updated: Lens) => calls.push(`anchor:${updated.id}`),
      onLensDeleted: (lensId: string) => calls.push(`deleted:${lensId}`),
      onReactionUpdated: (
        lensId: string,
        reactions: Partial<Record<ReactionKind, number>>,
      ) => calls.push(`reaction:${lensId}:${reactions["🔥"]}`),
      onRestoredMarker: (range: Range) => calls.push(range === restoredRange ? "marker" : "wrong-marker"),
    };

    dispatchRoomEvent({ type: "subscribed" }, handlers);
    dispatchRoomEvent({ type: "companion_presence" }, handlers);
    dispatchRoomEvent({ type: "lens_created", lens: lens("a") }, handlers);
    dispatchRoomEvent({ type: "lens_anchor_updated", lens: lens("b") }, handlers);
    dispatchRoomEvent({ type: "lens_deleted", lensId: "c" }, handlers);
    dispatchRoomEvent({ type: "reaction_updated", lensId: "d", reactions: { "🔥": 2 } }, handlers);

    expect(calls).toEqual([
      "companion:companion_presence",
      "created:a",
      "marker",
      "anchor:b",
      "deleted:c",
      "reaction:d:2",
    ]);
  });
});
