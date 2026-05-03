import type { Server } from "bun";
import { REACTION_KINDS, type ReactionKind } from "@lumen/schema";
import { db } from "./db.ts";
import { ulid } from "./ulid.ts";
import { signToken, type TokenPayload } from "./auth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// --- POST /api/redeem -------------------------------------------------------

const INVITES_REQUIRED = /^(1|true|yes)$/i.test(process.env.LUMEN_INVITES_REQUIRED ?? "");

const findInvite = db.query<
  { code: string; issued_by: string | null; consumed_at: number | null },
  [string]
>("SELECT code, issued_by, consumed_at FROM invite_codes WHERE code = ?");

const consumeInvite = db.query<unknown, [string, number, string]>(
  "UPDATE invite_codes SET consumed_by = ?, consumed_at = ? WHERE code = ? AND consumed_at IS NULL",
);

const createUser = db.query<unknown, [string, string, string | null, number]>(
  "INSERT INTO users (id, handle, invited_by, created_at) VALUES (?, ?, ?, ?)",
);

const findUserByHandle = db.query<{ id: string }, [string]>(
  "SELECT id FROM users WHERE handle = ?",
);

const findUserById = db.query<{ id: string; handle: string }, [string]>(
  "SELECT id, handle FROM users WHERE id = ?",
);

export async function handleRedeem(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { code?: string; handle?: string } | null;
  if (!body?.handle) return json({ error: "handle required" }, 400);
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(body.handle)) return json({ error: "invalid handle" }, 400);
  if (body.handle.toLowerCase() === "anonymous") return json({ error: "reserved handle" }, 400);

  const code = body.code?.trim();
  if (INVITES_REQUIRED && !code) return json({ error: "invite code required" }, 400);

  const invite = code ? findInvite.get(code) : null;
  if (code && !invite) return json({ error: "invalid code" }, 404);
  if (invite?.consumed_at !== null && invite?.consumed_at !== undefined) {
    return json({ error: "code already used" }, 409);
  }

  const existingUser = findUserByHandle.get(body.handle);
  if (existingUser) {
    const token = await signToken(existingUser.id);
    return json({ userId: existingUser.id, handle: body.handle, token });
  }

  const userId = ulid();
  const now = Date.now();
  db.transaction(() => {
    if (invite && code) consumeInvite.run(userId, now, code);
    createUser.run(userId, body.handle!, invite?.issued_by ?? null, now);
  })();

  const token = await signToken(userId);
  return json({ userId, handle: body.handle, token });
}

// --- GET /api/lenses?room=<hash> --------------------------------------------

interface LensRow {
  id: string;
  room_id: string;
  url: string;
  author_id: string;
  anonymous: number;
  type: string;
  tags: string;
  body: string;
  refs: string;
  anchor: string;
  created_at: number;
  handle: string;
  github_login: string | null;
}

const listLensesByRoom = db.query<LensRow, [string]>(`
  SELECT l.*, u.handle, u.github_login
  FROM lenses l
  JOIN users u ON l.author_id = u.id
  WHERE l.room_id = ?
  ORDER BY l.created_at ASC
`);

const fetchLensById = db.query<LensRow, [string]>(`
  SELECT l.*, u.handle, u.github_login
  FROM lenses l
  JOIN users u ON l.author_id = u.id
  WHERE l.id = ?
`);

const reactionCountsByLens = db.query<{ kind: string; count: number }, [string]>(`
  SELECT kind, COUNT(*) AS count
  FROM reactions
  WHERE lens_id = ?
  GROUP BY kind
  ORDER BY count DESC, kind ASC
`);

const userReactionsByLens = db.query<{ kind: string }, [string, string]>(`
  SELECT kind
  FROM reactions
  WHERE lens_id = ? AND user_id = ?
  ORDER BY kind ASC
`);

function reactionsForLens(lensId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of reactionCountsByLens.all(lensId)) {
    out[row.kind] = row.count;
  }
  return out;
}

function isOperatorUser(userId: string): boolean {
  const ids = new Set(
    (process.env.LUMEN_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (ids.has(userId)) return true;

  const handles = new Set(
    (process.env.LUMEN_OPERATOR_HANDLES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (handles.size === 0) return false;

  const user = findUserById.get(userId);
  return user ? handles.has(user.handle.toLowerCase()) : false;
}

function canEditLensAnchor(r: LensRow, viewerId?: string): boolean {
  if (!viewerId) return false;
  return r.author_id === viewerId || isOperatorUser(viewerId);
}

function rowToLens(r: LensRow, viewerId?: string) {
  const isAnon = r.anonymous === 1;
  return {
    id: r.id,
    type: r.type,
    tags: JSON.parse(r.tags),
    refs: JSON.parse(r.refs),
    anchor: JSON.parse(r.anchor),
    body: r.body,
    anonymous: isAnon,
    author: isAnon
      ? { id: "anonymous", handle: "Anonymous" }
      : { id: r.author_id, handle: r.handle, githubLogin: r.github_login },
    url: r.url,
    roomId: r.room_id,
    createdAt: r.created_at,
    reactions: reactionsForLens(r.id),
    myReactions: viewerId ? myReactionsForLens(r.id, viewerId) : [],
    replyCount: 0,
    saveCount: 0,
    viewerIsAuthor: viewerId ? r.author_id === viewerId : false,
    canEditAnchor: canEditLensAnchor(r, viewerId),
  };
}

export function handleListLenses(req: Request, user: TokenPayload): Response {
  const url = new URL(req.url);
  const room = url.searchParams.get("room");
  if (!room || !/^[a-f0-9]{64}$/.test(room)) {
    return json({ error: "invalid room" }, 400);
  }
  const rows = listLensesByRoom.all(room);
  return json({ lenses: rows.map((r) => rowToLens(r, user.sub)) });
}

// --- POST /api/lenses -------------------------------------------------------

const insertLens = db.query<
  unknown,
  [string, string, string, string, number, string, string, string, string, string, number]
>(`
  INSERT INTO lenses (id, room_id, url, author_id, anonymous, type, tags, body, refs, anchor, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

interface CreateLensBody {
  roomId: string;
  url: string;
  type: string;
  body: string;
  anchor: unknown;
  tags?: string[];
  refs?: unknown[];
  anonymous?: boolean;
}

const VALID_TYPES = new Set(["quick", "fun", "question", "poll", "knowledge", "challenge", "spoiler"]);

export async function handleCreateLens(
  req: Request,
  user: TokenPayload,
  server: Server<unknown>,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as CreateLensBody | null;
  if (!body) return json({ error: "invalid body" }, 400);
  if (!/^[a-f0-9]{64}$/.test(body.roomId)) return json({ error: "invalid roomId" }, 400);
  if (!VALID_TYPES.has(body.type)) return json({ error: "invalid type" }, 400);
  if (!body.body || !body.anchor || !body.url) return json({ error: "missing fields" }, 400);
  if (body.body.length > 4096) return json({ error: "body too long" }, 413);

  const id = ulid();
  const now = Date.now();
  insertLens.run(
    id,
    body.roomId,
    body.url,
    user.sub,
    body.anonymous ? 1 : 0,
    body.type,
    JSON.stringify(body.tags ?? []),
    body.body,
    JSON.stringify(body.refs ?? []),
    JSON.stringify(body.anchor),
    now,
  );

  const row = fetchLensById.get(id);
  if (!row) return json({ error: "internal" }, 500);
  const lens = rowToLens(row, user.sub);

  server.publish(body.roomId, JSON.stringify({ type: "lens_created", lens }));

  return json({ lens }, 201);
}

// --- PATCH /api/lenses/:id/anchor ------------------------------------------

const updateLensAnchor = db.query<unknown, [string, string]>(
  "UPDATE lenses SET anchor = ? WHERE id = ?",
);

export async function handleUpdateLensAnchor(
  req: Request,
  user: TokenPayload,
  server: Server<unknown>,
  lensId: string,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { anchor?: unknown } | null;
  if (!body?.anchor) return json({ error: "anchor required" }, 400);

  const row = fetchLensById.get(lensId);
  if (!row) return json({ error: "lens not found" }, 404);
  if (!canEditLensAnchor(row, user.sub)) return json({ error: "forbidden" }, 403);

  updateLensAnchor.run(JSON.stringify(body.anchor), lensId);

  const updated = fetchLensById.get(lensId);
  if (!updated) return json({ error: "internal" }, 500);
  const lens = rowToLens(updated, user.sub);

  server.publish(updated.room_id, JSON.stringify({ type: "lens_anchor_updated", lens }));

  return json({ lens });
}

// --- POST /api/reactions ----------------------------------------------------

const ALLOWED_REACTIONS = new Set<string>(REACTION_KINDS);

function myReactionsForLens(lensId: string, userId: string): ReactionKind[] {
  return userReactionsByLens.all(lensId, userId)
    .map((r) => r.kind)
    .filter((kind): kind is ReactionKind => ALLOWED_REACTIONS.has(kind));
}

const findLensRoom = db.query<{ id: string; room_id: string }, [string]>(
  "SELECT id, room_id FROM lenses WHERE id = ?",
);

const findReaction = db.query<{ kind: string }, [string, string, string]>(
  "SELECT kind FROM reactions WHERE lens_id = ? AND user_id = ? AND kind = ?",
);

const insertReaction = db.query<unknown, [string, string, string, number]>(
  "INSERT INTO reactions (lens_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)",
);

const deleteReaction = db.query<unknown, [string, string, string]>(
  "DELETE FROM reactions WHERE lens_id = ? AND user_id = ? AND kind = ?",
);

export async function handleToggleReaction(
  req: Request,
  user: TokenPayload,
  server: Server<unknown>,
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { lensId?: string; kind?: string } | null;
  if (!body?.lensId || !body?.kind) return json({ error: "lensId and kind required" }, 400);
  if (!ALLOWED_REACTIONS.has(body.kind)) return json({ error: "unsupported reaction" }, 400);

  const lens = findLensRoom.get(body.lensId);
  if (!lens) return json({ error: "lens not found" }, 404);

  const existing = findReaction.get(body.lensId, user.sub, body.kind);
  const selected = !existing;
  if (existing) {
    deleteReaction.run(body.lensId, user.sub, body.kind);
  } else {
    insertReaction.run(body.lensId, user.sub, body.kind, Date.now());
  }

  const reactions = reactionsForLens(body.lensId);
  const myReactions = myReactionsForLens(body.lensId, user.sub);
  const payload = {
    type: "reaction_updated",
    lensId: body.lensId,
    reactions,
  };
  server.publish(lens.room_id, JSON.stringify(payload));

  return json({ lensId: body.lensId, kind: body.kind, selected, reactions, myReactions });
}

// --- POST /api/reports ------------------------------------------------------

const findLens = db.query<{ id: string }, [string]>(
  "SELECT id FROM lenses WHERE id = ?",
);

const insertReport = db.query<unknown, [string, string, string, string, number]>(
  "INSERT INTO reports (id, lens_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
);

export async function handleCreateReport(req: Request, user: TokenPayload): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { lensId?: string; reason?: string } | null;
  if (!body?.lensId) return json({ error: "lensId required" }, 400);

  const lens = findLens.get(body.lensId);
  if (!lens) return json({ error: "lens not found" }, 404);

  const reason = (body.reason ?? "user_report").trim().slice(0, 120) || "user_report";
  const id = ulid();
  const now = Date.now();
  insertReport.run(id, body.lensId, user.sub, reason, now);

  return json({ reportId: id, lensId: body.lensId }, 201);
}
