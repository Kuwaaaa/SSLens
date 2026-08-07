import type { WsRoomEvent } from "./useWsBridge";

export function decodeWsRoomEvent(data: string): WsRoomEvent | null {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const event = parsed as Partial<WsRoomEvent>;
    return typeof event.type === "string" ? (event as WsRoomEvent) : null;
  } catch {
    return null;
  }
}
