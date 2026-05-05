// MV3 service worker.
//
// API calls and the room WebSocket live here so HTTPS content pages do not
// directly request the temporary insecure HTTP/WS backend during the no-domain
// beta. Content scripts talk to this worker through chrome.runtime messaging.

import { WebSocket as ReconnectingWS } from "partysocket";
import {
  createLens,
  deleteLens,
  fetchLensesForRoom,
  reportLens,
  toggleReaction,
  updateLensAnchor,
  type CreateLensInput,
} from "./shared/api";
import { WS_BASE } from "./shared/config";
import type { LensAnchor, ReactionKind } from "@lumen/schema";

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[Lumen] installed:", details.reason);
});

type ApiRequest =
  | { namespace: "lumen.api"; action: "fetchLensesForRoom"; roomId: string; token: string }
  | { namespace: "lumen.api"; action: "createLens"; input: CreateLensInput; token: string }
  | { namespace: "lumen.api"; action: "updateLensAnchor"; lensId: string; anchor: LensAnchor; token: string }
  | { namespace: "lumen.api"; action: "deleteLens"; lensId: string; token: string }
  | { namespace: "lumen.api"; action: "toggleReaction"; lensId: string; kind: ReactionKind; token: string }
  | { namespace: "lumen.api"; action: "reportLens"; lensId: string; token: string };

type ApiResponse =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

chrome.runtime.onMessage.addListener((message: ApiRequest, _sender, sendResponse: (response: ApiResponse) => void) => {
  if (!message || message.namespace !== "lumen.api") return false;

  void (async () => {
    try {
      switch (message.action) {
        case "fetchLensesForRoom":
          sendResponse({ ok: true, value: await fetchLensesForRoom(message.roomId, message.token) });
          break;
        case "createLens":
          sendResponse({ ok: true, value: await createLens(message.input, message.token) });
          break;
        case "updateLensAnchor":
          sendResponse({
            ok: true,
            value: await updateLensAnchor(message.lensId, message.anchor, message.token),
          });
          break;
        case "deleteLens":
          sendResponse({ ok: true, value: await deleteLens(message.lensId, message.token) });
          break;
        case "toggleReaction":
          sendResponse({
            ok: true,
            value: await toggleReaction(message.lensId, message.kind, message.token),
          });
          break;
        case "reportLens":
          sendResponse({ ok: true, value: await reportLens(message.lensId, message.token) });
          break;
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();

  return true;
});

type WsBridgeRequest =
  | { namespace: "lumen.ws"; type: "connect"; token: string; roomId: string }
  | { namespace: "lumen.ws"; type: "send"; payload: unknown }
  | { namespace: "lumen.ws"; type: "disconnect" };

type WsBridgeEvent =
  | { namespace: "lumen.ws"; type: "open" }
  | { namespace: "lumen.ws"; type: "close"; code?: number; reason?: string; wasClean?: boolean }
  | { namespace: "lumen.ws"; type: "error"; error?: string }
  | { namespace: "lumen.ws"; type: "message"; data: string };

function isObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object";
}

function isValidRoomId(roomId: string): boolean {
  return /^[a-f0-9]{64}$/.test(roomId);
}

function sendPort(port: chrome.runtime.Port, event: WsBridgeEvent) {
  try {
    port.postMessage(event);
  } catch {
    // The tab may have navigated away while an async WS callback was queued.
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "lumen.ws") return;

  let ws: ReconnectingWS | null = null;
  let heartbeatId: number | null = null;
  let roomId: string | null = null;
  let companionActive = false;

  function clearHeartbeat() {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
  }

  function closeSocket(code = 1000) {
    clearHeartbeat();
    if (!ws) return;
    try {
      ws.close(code);
    } catch {
      // Already closed.
    }
    ws = null;
  }

  function sendPayload(payload: unknown) {
    if (!isObject(payload) || typeof payload.type !== "string") return;
    if (payload.type === "companion_join") companionActive = true;
    if (payload.type === "companion_leave") companionActive = false;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  function connect(token: string, nextRoomId: string) {
    if (!token || !isValidRoomId(nextRoomId)) {
      sendPort(port, { namespace: "lumen.ws", type: "error", error: "invalid connect request" });
      return;
    }

    closeSocket();
    roomId = nextRoomId;
    companionActive = false;
    ws = new ReconnectingWS(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);

    ws.addEventListener("open", () => {
      sendPort(port, { namespace: "lumen.ws", type: "open" });
      sendPayload({ type: "subscribe", roomId });
      if (companionActive) sendPayload({ type: "companion_join" });
      clearHeartbeat();
      heartbeatId = setInterval(() => {
        sendPayload({ type: "ping" });
      }, 20000) as unknown as number;
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (data) sendPort(port, { namespace: "lumen.ws", type: "message", data });
    });

    ws.addEventListener("error", () => {
      sendPort(port, { namespace: "lumen.ws", type: "error", error: "socket error" });
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      clearHeartbeat();
      sendPort(port, {
        namespace: "lumen.ws",
        type: "close",
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    });
  }

  port.onMessage.addListener((message: WsBridgeRequest) => {
    if (!message || message.namespace !== "lumen.ws") return;
    if (message.type === "connect") {
      connect(message.token, message.roomId);
    } else if (message.type === "send") {
      sendPayload(message.payload);
    } else if (message.type === "disconnect") {
      closeSocket();
    }
  });

  port.onDisconnect.addListener(() => {
    closeSocket();
  });
});
