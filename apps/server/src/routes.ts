import type { Server } from "bun";
import {
  REACTION_KINDS,
  validateCreateLensInput,
  validateLensAnchor,
  type ReactionKind,
} from "@lumen/schema";
import { db } from "./db.ts";
import { ulid } from "./ulid.ts";
import { revokeTokensForUser, signToken, type TokenPayload } from "./auth.ts";
import { roomIdFor } from "@lumen/url";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// --- POST /api/redeem -------------------------------------------------------

const INVITES_REQUIRED = /^(1|true|yes)$/i.test(process.env.LUMEN_INVITES_REQUIRED ?? "");
const ALLOWED_REACTIONS = new Set<string>(REACTION_KINDS);

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
    return json({ error: "handle already registered" }, 409);
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

const reactionCountsByRoom = db.query<{ lens_id: string; kind: string; count: number }, [string]>(`
  SELECT r.lens_id, r.kind, COUNT(*) AS count
  FROM reactions r
  JOIN lenses l ON l.id = r.lens_id
  WHERE l.room_id = ?
  GROUP BY r.lens_id, r.kind
  ORDER BY r.lens_id ASC, count DESC, r.kind ASC
`);

const userReactionsByRoom = db.query<{ lens_id: string; kind: string }, [string, string]>(`
  SELECT r.lens_id, r.kind
  FROM reactions r
  JOIN lenses l ON l.id = r.lens_id
  WHERE l.room_id = ? AND r.user_id = ?
  ORDER BY r.lens_id ASC, r.kind ASC
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

export function isOperator(userId: string): boolean {
  return isOperatorUser(userId);
}

function canEditLensAnchor(r: LensRow, viewerId?: string): boolean {
  if (!viewerId) return false;
  return r.author_id === viewerId || isOperatorUser(viewerId);
}

function rowToLens(
  r: LensRow,
  viewerId?: string,
  reactions: Record<string, number> = reactionsForLens(r.id),
  myReactions: ReactionKind[] = viewerId ? myReactionsForLens(r.id, viewerId) : [],
  viewerIsOperator: boolean = viewerId ? isOperatorUser(viewerId) : false,
) {
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
    reactions,
    myReactions,
    replyCount: 0,
    saveCount: 0,
    viewerIsAuthor: viewerId ? r.author_id === viewerId : false,
    canEditAnchor: viewerId ? r.author_id === viewerId || viewerIsOperator : false,
  };
}

function reactionsByLensForRoom(roomId: string): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const row of reactionCountsByRoom.all(roomId)) {
    const existing = out.get(row.lens_id) ?? {};
    existing[row.kind] = row.count;
    out.set(row.lens_id, existing);
  }
  return out;
}

function myReactionsByLensForRoom(roomId: string, userId: string): Map<string, ReactionKind[]> {
  const out = new Map<string, ReactionKind[]>();
  for (const row of userReactionsByRoom.all(roomId, userId)) {
    if (!ALLOWED_REACTIONS.has(row.kind)) continue;
    const existing = out.get(row.lens_id) ?? [];
    existing.push(row.kind as ReactionKind);
    out.set(row.lens_id, existing);
  }
  return out;
}

export function handleListLenses(req: Request, user: TokenPayload): Response {
  const url = new URL(req.url);
  const room = url.searchParams.get("room");
  if (!room || !/^[a-f0-9]{64}$/.test(room)) {
    return json({ error: "invalid room" }, 400);
  }
  const rows = listLensesByRoom.all(room);
  const reactionsByLens = reactionsByLensForRoom(room);
  const myReactionsByLens = myReactionsByLensForRoom(room, user.sub);
  const viewerIsOperator = isOperatorUser(user.sub);
  return json({
    lenses: rows.map((r) => rowToLens(
      r,
      user.sub,
      reactionsByLens.get(r.id) ?? {},
      myReactionsByLens.get(r.id) ?? [],
      viewerIsOperator,
    )),
  });
}

// --- POST /api/lenses -------------------------------------------------------

const insertLens = db.query<
  unknown,
  [string, string, string, string, number, string, string, string, string, string, number]
>(`
  INSERT INTO lenses (id, room_id, url, author_id, anonymous, type, tags, body, refs, anchor, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export async function handleCreateLens(
  req: Request,
  user: TokenPayload,
  server: Server<unknown>,
): Promise<Response> {
  const rawBody = await req.json().catch(() => null);
  const body = validateCreateLensInput(rawBody);
  if (!body) return json({ error: "invalid body" }, 400);

  let expectedRoomId: string;
  try {
    expectedRoomId = await roomIdFor(body.url);
  } catch {
    return json({ error: "invalid url" }, 400);
  }
  if (expectedRoomId !== body.roomId) return json({ error: "roomId does not match url" }, 400);

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
  const anchor = validateLensAnchor(body?.anchor);
  if (!anchor) return json({ error: "invalid anchor" }, 400);

  const row = fetchLensById.get(lensId);
  if (!row) return json({ error: "lens not found" }, 404);
  if (!canEditLensAnchor(row, user.sub)) return json({ error: "forbidden" }, 403);

  updateLensAnchor.run(JSON.stringify(anchor), lensId);

  const updated = fetchLensById.get(lensId);
  if (!updated) return json({ error: "internal" }, 500);
  const lens = rowToLens(updated, user.sub);

  server.publish(updated.room_id, JSON.stringify({ type: "lens_anchor_updated", lens }));

  return json({ lens });
}

// --- DELETE /api/lenses/:id -------------------------------------------------

const deleteLensReactions = db.query<unknown, [string]>(
  "DELETE FROM reactions WHERE lens_id = ?",
);

const deleteLensReports = db.query<unknown, [string]>(
  "DELETE FROM reports WHERE lens_id = ?",
);

const deleteLensById = db.query<unknown, [string]>(
  "DELETE FROM lenses WHERE id = ?",
);

export async function handleDeleteLens(
  user: TokenPayload,
  server: Server<unknown>,
  lensId: string,
): Promise<Response> {
  if (!isOperatorUser(user.sub)) return json({ error: "forbidden" }, 403);

  const row = fetchLensById.get(lensId);
  if (!row) return json({ error: "lens not found" }, 404);

  db.transaction(() => {
    deleteLensReactions.run(lensId);
    deleteLensReports.run(lensId);
    deleteLensById.run(lensId);
  })();

  server.publish(row.room_id, JSON.stringify({ type: "lens_deleted", lensId }));

  return json({ lensId, deleted: true });
}

// --- POST /api/reactions ----------------------------------------------------

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

type ReportStatus = "open" | "reviewed" | "dismissed";

interface ReportRow {
  id: string;
  lens_id: string;
  reporter_id: string;
  reporter_handle: string;
  reason: string;
  status: ReportStatus;
  created_at: number;
  reviewed_by: string | null;
  reviewed_at: number | null;
  review_note: string | null;
  lens_body: string;
  lens_type: string;
  lens_url: string;
  lens_room_id: string;
  lens_author_id: string;
  lens_author_handle: string;
}

const REPORT_STATUSES = new Set<ReportStatus>(["open", "reviewed", "dismissed"]);

const listReportsByStatus = db.query<ReportRow, [string]>(`
  SELECT
    r.id,
    r.lens_id,
    r.reporter_id,
    reporter.handle AS reporter_handle,
    r.reason,
    r.status,
    r.created_at,
    r.reviewed_by,
    r.reviewed_at,
    r.review_note,
    l.body AS lens_body,
    l.type AS lens_type,
    l.url AS lens_url,
    l.room_id AS lens_room_id,
    l.author_id AS lens_author_id,
    author.handle AS lens_author_handle
  FROM reports r
  JOIN lenses l ON l.id = r.lens_id
  JOIN users reporter ON reporter.id = r.reporter_id
  JOIN users author ON author.id = l.author_id
  WHERE r.status = ?
  ORDER BY r.created_at ASC
  LIMIT 200
`);

const listReportsAll = db.query<ReportRow, []>(`
  SELECT
    r.id,
    r.lens_id,
    r.reporter_id,
    reporter.handle AS reporter_handle,
    r.reason,
    r.status,
    r.created_at,
    r.reviewed_by,
    r.reviewed_at,
    r.review_note,
    l.body AS lens_body,
    l.type AS lens_type,
    l.url AS lens_url,
    l.room_id AS lens_room_id,
    l.author_id AS lens_author_id,
    author.handle AS lens_author_handle
  FROM reports r
  JOIN lenses l ON l.id = r.lens_id
  JOIN users reporter ON reporter.id = r.reporter_id
  JOIN users author ON author.id = l.author_id
  ORDER BY r.created_at DESC
  LIMIT 200
`);

const findReportById = db.query<{ id: string }, [string]>(
  "SELECT id FROM reports WHERE id = ?",
);

const updateReportReview = db.query<unknown, [ReportStatus, string, number, string | null, string]>(
  "UPDATE reports SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?",
);

function rowToReport(row: ReportRow) {
  return {
    id: row.id,
    lensId: row.lens_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    reporter: { id: row.reporter_id, handle: row.reporter_handle },
    lens: {
      id: row.lens_id,
      type: row.lens_type,
      body: row.lens_body,
      url: row.lens_url,
      roomId: row.lens_room_id,
      author: { id: row.lens_author_id, handle: row.lens_author_handle },
    },
  };
}

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

// --- GET/PATCH /api/admin/reports ------------------------------------------

export function handleListReports(req: Request, user: TokenPayload): Response {
  if (!isOperatorUser(user.sub)) return json({ error: "forbidden" }, 403);

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  if (status === "all") {
    return json({ reports: listReportsAll.all().map(rowToReport) });
  }
  if (!REPORT_STATUSES.has(status as ReportStatus)) return json({ error: "invalid status" }, 400);

  return json({ reports: listReportsByStatus.all(status).map(rowToReport) });
}

export async function handleUpdateReport(
  req: Request,
  user: TokenPayload,
  reportId: string,
): Promise<Response> {
  if (!isOperatorUser(user.sub)) return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => null)) as { status?: string; note?: string } | null;
  const status = body?.status;
  if (!status || !REPORT_STATUSES.has(status as ReportStatus)) {
    return json({ error: "invalid status" }, 400);
  }

  const report = findReportById.get(reportId);
  if (!report) return json({ error: "report not found" }, 404);

  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  updateReportReview.run(status as ReportStatus, user.sub, Date.now(), note, reportId);
  return json({ reportId, status, reviewed: true });
}

// --- POST /api/admin/revoke-user -------------------------------------------

export async function handleRevokeUserTokens(req: Request, user: TokenPayload): Promise<Response> {
  if (!isOperatorUser(user.sub)) return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) return json({ error: "userId required" }, 400);

  const target = findUserById.get(userId);
  if (!target) return json({ error: "user not found" }, 404);

  const revokedBefore = Math.floor(Date.now() / 1000);
  revokeTokensForUser(userId, revokedBefore);
  return json({ userId, revokedBefore, revoked: true });
}
