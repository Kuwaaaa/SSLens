import { describe, expect, test } from "bun:test";

import { decodeWsRoomEvent } from "./ws-events";

describe("ws-events", () => {
  test("decodes object messages with a string type", () => {
    expect(decodeWsRoomEvent('{"type":"lens_created","lens":{"id":"l1"}}')).toEqual({
      type: "lens_created",
      lens: { id: "l1" },
    });
  });

  test("rejects invalid room event payloads", () => {
    expect(decodeWsRoomEvent("not-json")).toBeNull();
    expect(decodeWsRoomEvent("null")).toBeNull();
    expect(decodeWsRoomEvent('{"lensId":"l1"}')).toBeNull();
  });
});
