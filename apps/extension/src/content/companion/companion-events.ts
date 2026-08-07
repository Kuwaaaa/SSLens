import { isCompanionChatMessage } from "../companion-model";
import type { CompanionChatMessage, CompanionEmojiBurst } from "../types";
import type { WsRoomEvent } from "../ws/useWsBridge";

function stringList(input: unknown): string[] | null {
  return Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string")
    : null;
}

export function companionUsersForEvent(
  current: string[],
  message: WsRoomEvent,
): string[] | null {
  if (message.type === "companion_presence") {
    return stringList(message.users) ?? [];
  }
  if (message.type === "companion_joined") {
    const users = stringList(message.users);
    if (users) return users;
    return typeof message.userId === "string"
      ? [...new Set([...current, message.userId])]
      : current;
  }
  if (message.type === "companion_left") {
    const users = stringList(message.users);
    if (users) return users;
    return typeof message.userId === "string"
      ? current.filter((user) => user !== message.userId)
      : current;
  }
  return null;
}

export function companionEmojiForEvent(
  message: WsRoomEvent,
): Omit<CompanionEmojiBurst, "id"> | null {
  if (message.type !== "companion_emoji") return null;
  const emoji = typeof message.emoji === "string" ? message.emoji : null;
  const edge = message.edge === "left" || message.edge === "right" ? message.edge : null;
  const y = typeof message.y === "number" ? message.y : 0.5;
  return emoji && edge ? { emoji, edge, y } : null;
}

export function companionMessagesForEvent(
  message: WsRoomEvent,
  now = Date.now,
): CompanionChatMessage[] | null {
  if (message.type === "companion_chat_history") {
    return Array.isArray(message.messages)
      ? message.messages.filter(isCompanionChatMessage)
      : [];
  }
  if (message.type !== "companion_chat") return null;
  const id = typeof message.id === "string" ? message.id : null;
  const userId = typeof message.userId === "string" ? message.userId : "unknown";
  const handle = typeof message.handle === "string" ? message.handle : "unknown";
  const body = typeof message.body === "string" ? message.body : "";
  const at = typeof message.at === "number" ? message.at : now();
  return id && body.trim()
    ? [{ id, userId, handle, body, at }]
    : [];
}
