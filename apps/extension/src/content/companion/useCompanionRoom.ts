import { useCallback, useEffect, useRef, useState } from "react";

import { isCompanionChatMessage, mergeCompanionMessages } from "../companion-model";
import type { CompanionChatMessage, CompanionEmojiBurst } from "../types";
import type { WsRoomEvent, WsSend } from "../ws/useWsBridge";

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

  const addMessage = useCallback((message: CompanionChatMessage) => {
    setMessages((current) => mergeCompanionMessages(current, [message]));
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
    if (msg.type === "companion_presence") {
      setUsers((msg.users as string[] | undefined) ?? []);
    } else if (msg.type === "companion_joined") {
      const nextUsers = msg.users as string[] | undefined;
      if (nextUsers) setUsers(nextUsers);
      else setUsers((current) => [...new Set([...current, msg.userId as string])]);
    } else if (msg.type === "companion_left") {
      const nextUsers = msg.users as string[] | undefined;
      if (nextUsers) setUsers(nextUsers);
      else setUsers((current) => current.filter((user) => user !== (msg.userId as string)));
    } else if (msg.type === "companion_emoji") {
      if (!activeRef.current) return;
      const emoji = typeof msg.emoji === "string" ? msg.emoji : null;
      const edge = msg.edge === "left" || msg.edge === "right" ? msg.edge : null;
      const y = typeof msg.y === "number" ? msg.y : 0.5;
      if (emoji && edge) addEmojiBurst({ emoji, edge, y });
    } else if (msg.type === "companion_chat_history") {
      if (!activeRef.current) return;
      const incoming = Array.isArray(msg.messages)
        ? msg.messages.filter(isCompanionChatMessage)
        : [];
      mergeHistory(incoming);
    } else if (msg.type === "companion_chat") {
      if (!activeRef.current) return;
      const id = typeof msg.id === "string" ? msg.id : null;
      const userId = typeof msg.userId === "string" ? msg.userId : "unknown";
      const handle = typeof msg.handle === "string" ? msg.handle : "unknown";
      const body = typeof msg.body === "string" ? msg.body : "";
      const at = typeof msg.at === "number" ? msg.at : Date.now();
      if (id && body.trim()) addMessage({ id, userId, handle, body, at });
    }
  }, [addEmojiBurst, addMessage, mergeHistory]);

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
