import type { Server, ServerWebSocket } from "bun";
import { verifyToken, type TokenPayload } from "./auth.ts";
import { db } from "./db.ts";

export interface WSData {
  user: TokenPayload;
  roomId: string | null;
  companionRoomId: string | null;
}

let serverRef: Server<WSData> | null = null;
let wsConnectionCount = 0;
export function setServerRef(s: Server<WSData>) {
  serverRef = s;
}

// roomId -> userId -> open connection count (server-local presence map)
const presence = new Map<string, Map<string, number>>();
const companionPresence = new Map<string, Map<string, number>>();
const companionChatHistory = new Map<string, CompanionChatRecord[]>();
const wsRateBuckets = new Map<string, { count: number; resetAt: number }>();
const COMPANION_CHAT_HISTORY_LIMIT = 30;
const COMPANION_CHAT_HISTORY_MAX_AGE_MS = 30 * 60 * 1000;
const WS_RATE_RULES = {
  companion_chat: { limit: 10, windowMs: 1000 },
  companion_emoji: { limit: 5, windowMs: 1000 },
} as const;
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
  let room = presence.get(roomId);
  if (!room) {
    room = new Map();
    presence.set(roomId, room);
  }
  const current = room.get(userId) ?? 0;
  room.set(userId, current + 1);
  return current === 0;
}

function presenceLeave(roomId: string, userId: string): boolean {
  const room = presence.get(roomId);
  if (!room) return false;
  const current = room.get(userId) ?? 0;
  if (current <= 1) {
    room.delete(userId);
    if (room.size === 0) presence.delete(roomId);
    return current === 1;
  }
  room.set(userId, current - 1);
  return false;
}

function presenceList(roomId: string): string[] {
  return [...(presence.get(roomId)?.keys() ?? [])];
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

function checkWsRateLimit(
  action: keyof typeof WS_RATE_RULES,
  roomId: string,
  userId: string,
  now = Date.now(),
): boolean {
  const rule = WS_RATE_RULES[action];
  const key = `${action}:${roomId}:${userId}`;
  const current = wsRateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    wsRateBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= rule.limit;
}

export function pruneWsMemory(now = Date.now()) {
  for (const roomId of [...companionChatHistory.keys()]) {
    pruneCompanionChatHistory(roomId, now);
  }
  for (const [key, bucket] of wsRateBuckets) {
    if (bucket.resetAt <= now) wsRateBuckets.delete(key);
  }
}

export function wsStats() {
  let largestRoomSize = 0;
  for (const room of presence.values()) {
    largestRoomSize = Math.max(largestRoomSize, room.size);
  }
  return {
    connectionCount: wsConnectionCount,
    roomCount: presence.size,
    largestRoomSize,
    companionRoomCount: companionPresence.size,
    companionHistoryRoomCount: companionChatHistory.size,
  };
}

function websocketProtocols(req: Request): string[] {
  return (req.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenFromWebSocketRequest(req: Request): string | null {
  const protocols = websocketProtocols(req);
  const tokenProtocol = protocols.find((protocol) => protocol.startsWith("lumen-token."));
  if (tokenProtocol) return tokenProtocol.slice("lumen-token.".length);

  const url = new URL(req.url);
  return url.searchParams.get("token");
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
    const users = companionList(roomId);
    if (users.length === 0) pruneCompanionChatHistory(roomId);
    serverRef.publish(roomId, JSON.stringify({
      type: "companion_left",
      userId: ws.data.user.sub,
      users,
    }));
  }
}

export async function handleUpgrade(req: Request, server: Server<WSData>): Promise<Response | undefined> {
  const token = tokenFromWebSocketRequest(req);
  if (!token) return new Response("missing token", { status: 401 });
  const user = await verifyToken(token);
  if (!user) return new Response("invalid token", { status: 401 });

  const protocols = websocketProtocols(req);
  const upgraded = server.upgrade(req, {
    data: { user, roomId: null, companionRoomId: null },
    headers: protocols.includes("lumen.v1") ? { "Sec-WebSocket-Protocol": "lumen.v1" } : undefined,
  });
  if (!upgraded) return new Response("upgrade failed", { status: 500 });
  return undefined;
}

export const websocket = {
  open(_ws: ServerWebSocket<WSData>) {
    wsConnectionCount += 1;
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
      if (!checkWsRateLimit("companion_emoji", roomId, ws.data.user.sub)) return;
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
      if (!checkWsRateLimit("companion_chat", roomId, ws.data.user.sub)) return;
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
    wsConnectionCount = Math.max(0, wsConnectionCount - 1);
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
