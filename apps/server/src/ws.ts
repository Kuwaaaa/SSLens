import type { Server, ServerWebSocket } from "bun";
import { verifyToken, type TokenPayload } from "./auth.ts";
import { db } from "./db.ts";

export interface WSData {
  user: TokenPayload;
  roomId: string | null;
  companionRoomId: string | null;
}

let serverRef: Server<WSData> | null = null;
export function setServerRef(s: Server<WSData>) {
  serverRef = s;
}

// roomId -> set of user ids currently subscribed (server-local presence map)
const presence = new Map<string, Set<string>>();
const companionPresence = new Map<string, Map<string, number>>();
const companionChatHistory = new Map<string, CompanionChatRecord[]>();
const COMPANION_CHAT_HISTORY_LIMIT = 30;
const COMPANION_CHAT_HISTORY_MAX_AGE_MS = 30 * 60 * 1000;
const COMPANION_EMOJI_CHOICES = new Set([
  "\u{1F44B}",
  "\u{1F440}",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F914}",
  "\u{1F4AF}",
]);
const findUserHandle = db.query<{ handle: string }, [string]>("SELECT handle FROM users WHERE id = ?");

interface CompanionChatRecord {
  id: string;
  userId: string;
  handle: string;
  body: string;
  at: number;
}

function presenceJoin(roomId: string, userId: string): boolean {
  let set = presence.get(roomId);
  if (!set) {
    set = new Set();
    presence.set(roomId, set);
  }
  if (set.has(userId)) return false;
  set.add(userId);
  return true;
}

function presenceLeave(roomId: string, userId: string): boolean {
  const set = presence.get(roomId);
  if (!set?.delete(userId)) return false;
  if (set.size === 0) presence.delete(roomId);
  return true;
}

function presenceList(roomId: string): string[] {
  return [...(presence.get(roomId) ?? [])];
}

function companionJoin(roomId: string, userId: string): boolean {
  let room = companionPresence.get(roomId);
  if (!room) {
    room = new Map();
    companionPresence.set(roomId, room);
  }
  const current = room.get(userId) ?? 0;
  room.set(userId, current + 1);
  return current === 0;
}

function companionLeave(roomId: string, userId: string): boolean {
  const room = companionPresence.get(roomId);
  if (!room) return false;
  const current = room.get(userId) ?? 0;
  if (current <= 1) {
    room.delete(userId);
    if (room.size === 0) companionPresence.delete(roomId);
    return current === 1;
  }
  room.set(userId, current - 1);
  return false;
}

function companionList(roomId: string): string[] {
  return [...(companionPresence.get(roomId)?.keys() ?? [])];
}

function pruneCompanionChatHistory(roomId: string, now = Date.now()): CompanionChatRecord[] {
  const fresh = (companionChatHistory.get(roomId) ?? [])
    .filter((message) => now - message.at <= COMPANION_CHAT_HISTORY_MAX_AGE_MS)
    .slice(-COMPANION_CHAT_HISTORY_LIMIT);
  if (fresh.length > 0) companionChatHistory.set(roomId, fresh);
  else companionChatHistory.delete(roomId);
  return fresh;
}

function rememberCompanionChat(roomId: string, message: CompanionChatRecord) {
  const messages = [...pruneCompanionChatHistory(roomId, message.at), message]
    .slice(-COMPANION_CHAT_HISTORY_LIMIT);
  companionChatHistory.set(roomId, messages);
}

function isCompanionEmoji(input: unknown): input is string {
  return typeof input === "string" && COMPANION_EMOJI_CHOICES.has(input);
}

function companionHandle(userId: string): string {
  return findUserHandle.get(userId)?.handle ?? "unknown";
}

function leaveCompanion(ws: ServerWebSocket<WSData>) {
  if (!ws.data.companionRoomId) return;
  const roomId = ws.data.companionRoomId;
  ws.data.companionRoomId = null;
  if (companionLeave(roomId, ws.data.user.sub) && serverRef) {
    serverRef.publish(roomId, JSON.stringify({
      type: "companion_left",
      userId: ws.data.user.sub,
      users: companionList(roomId),
    }));
  }
}

export async function handleUpgrade(req: Request, server: Server<WSData>): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("missing token", { status: 401 });
  const user = await verifyToken(token);
  if (!user) return new Response("invalid token", { status: 401 });

  const upgraded = server.upgrade(req, { data: { user, roomId: null, companionRoomId: null } });
  if (!upgraded) return new Response("upgrade failed", { status: 500 });
  return undefined;
}

export const websocket = {
  open(_ws: ServerWebSocket<WSData>) {
    // Wait for client to send subscribe.
  },

  message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
    let msg: { type?: string; roomId?: string; emoji?: unknown; edge?: unknown; y?: unknown; body?: unknown };
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
    } catch {
      return;
    }

    if (msg.type === "subscribe" && typeof msg.roomId === "string" && /^[a-f0-9]{64}$/.test(msg.roomId)) {
      if (ws.data.roomId === msg.roomId) return;

      // Leave previous room
      if (ws.data.roomId) {
        const prev = ws.data.roomId;
        if (ws.data.companionRoomId === prev) leaveCompanion(ws);
        ws.unsubscribe(prev);
        if (presenceLeave(prev, ws.data.user.sub)) {
          ws.publish(prev, JSON.stringify({ type: "presence_leave", userId: ws.data.user.sub }));
        }
      }

      ws.data.roomId = msg.roomId;
      ws.subscribe(msg.roomId);
      const newToRoom = presenceJoin(msg.roomId, ws.data.user.sub);

      ws.send(JSON.stringify({
        type: "subscribed",
        roomId: msg.roomId,
        presence: presenceList(msg.roomId),
      }));

      if (newToRoom) {
        ws.publish(msg.roomId, JSON.stringify({ type: "presence_join", userId: ws.data.user.sub }));
      }
      return;
    }

    if (msg.type === "companion_join") {
      if (!ws.data.roomId) return;
      const roomId = ws.data.roomId;
      if (ws.data.companionRoomId === roomId) {
        ws.send(JSON.stringify({
          type: "companion_presence",
          users: companionList(roomId),
        }));
        ws.send(JSON.stringify({
          type: "companion_chat_history",
          messages: pruneCompanionChatHistory(roomId),
        }));
        return;
      }
      if (ws.data.companionRoomId) leaveCompanion(ws);
      ws.data.companionRoomId = roomId;
      const newToCompanion = companionJoin(roomId, ws.data.user.sub);
      const users = companionList(roomId);
      ws.send(JSON.stringify({ type: "companion_presence", users }));
      ws.send(JSON.stringify({
        type: "companion_chat_history",
        messages: pruneCompanionChatHistory(roomId),
      }));
      if (newToCompanion) {
        ws.publish(roomId, JSON.stringify({
          type: "companion_joined",
          userId: ws.data.user.sub,
          users,
        }));
      }
      return;
    }

    if (msg.type === "companion_leave") {
      leaveCompanion(ws);
      return;
    }

    if (msg.type === "companion_emoji") {
      const roomId = ws.data.companionRoomId;
      if (!roomId || roomId !== ws.data.roomId) return;
      if (!isCompanionEmoji(msg.emoji)) return;
      const edge = msg.edge === "left" || msg.edge === "right" ? msg.edge : null;
      if (!edge) return;
      const y = typeof msg.y === "number" && Number.isFinite(msg.y)
        ? Math.max(0.12, Math.min(0.88, msg.y))
        : 0.5;
      const payload = JSON.stringify({
        type: "companion_emoji",
        userId: ws.data.user.sub,
        emoji: msg.emoji,
        edge,
        y,
        at: Date.now(),
      });
      ws.send(payload);
      ws.publish(roomId, payload);
      return;
    }

    if (msg.type === "companion_chat") {
      const roomId = ws.data.companionRoomId;
      if (!roomId || roomId !== ws.data.roomId) return;
      const body = typeof msg.body === "string" ? msg.body.trim().slice(0, 280) : "";
      if (!body) return;
      const message = {
        id: `chat-${Date.now()}-${crypto.randomUUID()}`,
        userId: ws.data.user.sub,
        handle: companionHandle(ws.data.user.sub),
        body,
        at: Date.now(),
      };
      rememberCompanionChat(roomId, message);
      const payload = JSON.stringify({ type: "companion_chat", ...message });
      ws.send(payload);
      ws.publish(roomId, payload);
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    leaveCompanion(ws);
    if (!ws.data.roomId) return;
    const roomId = ws.data.roomId;
    if (presenceLeave(roomId, ws.data.user.sub) && serverRef) {
      // ws.publish doesn't work on closed sockets; route through the server.
      serverRef.publish(roomId, JSON.stringify({ type: "presence_leave", userId: ws.data.user.sub }));
    }
    ws.data.roomId = null;
  },
};
