import type { Server, ServerWebSocket } from "bun";
import { verifyToken, type TokenPayload } from "./auth.ts";

export interface WSData {
  user: TokenPayload;
  roomId: string | null;
}

let serverRef: Server | null = null;
export function setServerRef(s: Server) {
  serverRef = s;
}

// roomId -> set of user ids currently subscribed (server-local presence map)
const presence = new Map<string, Set<string>>();

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

export async function handleUpgrade(req: Request, server: Server): Promise<Response | undefined> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("missing token", { status: 401 });
  const user = await verifyToken(token);
  if (!user) return new Response("invalid token", { status: 401 });

  const upgraded = server.upgrade<WSData>(req, { data: { user, roomId: null } });
  if (!upgraded) return new Response("upgrade failed", { status: 500 });
  return undefined;
}

export const websocket = {
  open(_ws: ServerWebSocket<WSData>) {
    // Wait for client to send subscribe.
  },

  message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
    let msg: { type?: string; roomId?: string };
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

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    if (!ws.data.roomId) return;
    const roomId = ws.data.roomId;
    if (presenceLeave(roomId, ws.data.user.sub) && serverRef) {
      // ws.publish doesn't work on closed sockets; route through the server.
      serverRef.publish(roomId, JSON.stringify({ type: "presence_leave", userId: ws.data.user.sub }));
    }
    ws.data.roomId = null;
  },
};
