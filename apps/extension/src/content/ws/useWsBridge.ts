import { useCallback, useEffect, useRef, useState } from "react";

import type { WsBridgeEvent } from "../types";
import { decodeWsRoomEvent } from "./ws-events";

export type WsRoomEvent = { type: string; [key: string]: unknown };
export type WsSend = (payload: unknown) => void;

interface UseWsBridgeInput {
  token: string | null;
  roomId: string;
  disabled: boolean;
  onOpen?: (send: WsSend) => void;
  onClose?: () => void;
  onBeforeDisconnect?: (send: WsSend) => void;
  onMessage: (message: WsRoomEvent) => void;
}

export function useWsBridge({
  token,
  roomId,
  disabled,
  onOpen,
  onClose,
  onBeforeDisconnect,
  onMessage,
}: UseWsBridgeInput) {
  const [connected, setConnected] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const callbacksRef = useRef({
    onOpen,
    onClose,
    onBeforeDisconnect,
    onMessage,
  });

  useEffect(() => {
    callbacksRef.current = {
      onOpen,
      onClose,
      onBeforeDisconnect,
      onMessage,
    };
  }, [onOpen, onClose, onBeforeDisconnect, onMessage]);

  const send = useCallback<WsSend>((payload: unknown) => {
    portRef.current?.postMessage({ namespace: "lumen.ws", type: "send", payload });
  }, []);

  useEffect(() => {
    if (!token || disabled) return;
    const port = chrome.runtime.connect({ name: "lumen.ws" });
    let disposed = false;
    let reconnectTimer: number | null = null;
    portRef.current = port;

    const sendThroughPort: WsSend = (payload) => {
      port.postMessage({ namespace: "lumen.ws", type: "send", payload });
    };

    port.onMessage.addListener((event: WsBridgeEvent) => {
      if (!event || event.namespace !== "lumen.ws") return;
      if (event.type === "open") {
        setConnected(true);
        callbacksRef.current.onOpen?.(sendThroughPort);
        return;
      }
      if (event.type === "error") {
        console.warn(
          "[lumen] WebSocket bridge failed. If HTTP API requests work, check token validity, extension service worker logs, and reverse-proxy Upgrade headers.",
          event.error ?? "",
        );
        return;
      }
      if (event.type === "close") {
        if (event.code !== 1000) {
          console.warn("[lumen] WebSocket closed:", {
            code: event.code,
            reason: event.reason || "(no reason)",
            wasClean: event.wasClean,
          });
        }
        setConnected(false);
        callbacksRef.current.onClose?.();
        return;
      }
      if (event.type !== "message") return;
      const message = decodeWsRoomEvent(event.data);
      if (message) callbacksRef.current.onMessage(message);
    });

    port.onDisconnect.addListener(() => {
      setConnected(false);
      callbacksRef.current.onClose?.();
      if (!disposed) {
        reconnectTimer = window.setTimeout(() => {
          setRetryTick((n) => n + 1);
        }, 1000);
      }
    });

    port.postMessage({ namespace: "lumen.ws", type: "connect", token, roomId });

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      callbacksRef.current.onBeforeDisconnect?.(sendThroughPort);
      try {
        port.postMessage({ namespace: "lumen.ws", type: "disconnect" });
        port.disconnect();
      } catch {
        // The extension worker may already be gone during tab teardown.
      }
      if (portRef.current === port) portRef.current = null;
      setConnected(false);
    };
  }, [token, roomId, disabled, retryTick]);

  return {
    connected,
    send,
  };
}
