import { useCallback, useEffect, useRef, useState } from "react";

import { mergeCompanionMessages } from "../companion-model";
import type { CompanionChatMessage, CompanionEmojiBurst } from "../types";
import type { WsRoomEvent, WsSend } from "../ws/useWsBridge";
import {
  companionEmojiForEvent,
  companionMessagesForEvent,
  companionUsersForEvent,
} from "./companion-events";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function useCompanionRoom() {
  const [active, setActive] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [emojiBursts, setEmojiBursts] = useState<CompanionEmojiBurst[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<CompanionChatMessage[]>([]);
  const activeRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const addEmojiBurst = useCallback((input: Omit<CompanionEmojiBurst, "id">) => {
    const id = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEmojiBursts((bursts) => [
      ...bursts.slice(-10),
      {
        ...input,
        id,
        y: clamp(input.y, 0.12, 0.88),
      },
    ]);
    window.setTimeout(() => {
      setEmojiBursts((bursts) => bursts.filter((burst) => burst.id !== id));
    }, 1250);
  }, []);

  const mergeHistory = useCallback((incoming: CompanionChatMessage[]) => {
    setMessages((current) => mergeCompanionMessages(current, incoming));
  }, []);

  const reset = useCallback(() => {
    setActive(false);
    setUsers([]);
    setEmojiBursts([]);
    setChatOpen(false);
    setMessages([]);
  }, []);

  const handleBridgeOpen = useCallback((send: WsSend) => {
    if (activeRef.current) {
      send({ type: "companion_join" });
    }
  }, []);

  const handleBridgeClose = useCallback(() => {
    setUsers([]);
  }, []);

  const handleBeforeBridgeDisconnect = useCallback((send: WsSend) => {
    if (!activeRef.current) return;
    try {
      send({ type: "companion_leave" });
    } catch {
      // Socket is already gone; server close handling clears presence.
    }
  }, []);

  const handleEvent = useCallback((msg: WsRoomEvent) => {
    setUsers((current) => companionUsersForEvent(current, msg) ?? current);

    if (!activeRef.current) return;

    const emoji = companionEmojiForEvent(msg);
    if (emoji) {
      addEmojiBurst(emoji);
      return;
    }

    const incomingMessages = companionMessagesForEvent(msg);
    if (incomingMessages) {
      mergeHistory(incomingMessages);
    }
  }, [addEmojiBurst, mergeHistory]);

  const join = useCallback((send: WsSend) => {
    setActive(true);
    try {
      send({ type: "companion_join" });
    } catch {
      // The bridge will join on the next open event while active is true.
    }
  }, []);

  const leave = useCallback((send: WsSend) => {
    reset();
    try {
      send({ type: "companion_leave" });
    } catch {
      // Socket close handling on the server also clears companion presence.
    }
  }, [reset]);

  const tossEmoji = useCallback((send: WsSend, connected: boolean, emoji: string) => {
    if (!activeRef.current || !connected) return;
    const edge = Math.random() > 0.5 ? "right" : "left";
    const y = 0.18 + Math.random() * 0.64;
    send({ type: "companion_emoji", emoji, edge, y });
  }, []);

  const sendChat = useCallback((send: WsSend, connected: boolean, body: string) => {
    if (!activeRef.current || !connected) return;
    const trimmed = body.trim().slice(0, 280);
    if (!trimmed) return;
    send({ type: "companion_chat", body: trimmed });
  }, []);

  const toggleChat = useCallback(() => {
    setChatOpen((open) => !open);
  }, []);

  return {
    active,
    users,
    emojiBursts,
    chatOpen,
    messages,
    count: users.length,
    reset,
    handleBridgeOpen,
    handleBridgeClose,
    handleBeforeBridgeDisconnect,
    handleEvent,
    join,
    leave,
    tossEmoji,
    sendChat,
    toggleChat,
  };
}
