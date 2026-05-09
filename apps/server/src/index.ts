import { db } from "./db.ts"; // ensure schema is applied before queries are prepared
import {
  json,
  handleRedeem,
  handleListLenses,
  handleCreateLens,
  handleDeleteLens,
  handleUpdateLensAnchor,
  handleToggleReaction,
  handleCreateReport,
  handleListReports,
  handleUpdateReport,
  handleRevokeUserTokens,
  isOperator,
} from "./routes.ts";
import { handleUpgrade, websocket, setServerRef, pruneWsMemory, wsStats } from "./ws.ts";
import { verifyToken, type TokenPayload } from "./auth.ts";
import { checkRateLimit, pruneRateLimitBuckets } from "./rate-limit.ts";
import { canonicalizeUrl, roomIdFor } from "@lumen/url";

const PORT = Number(process.env.PORT ?? 3000);
const startedAt = Date.now();
let recentErrorCount = 0;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

async function authFromReq(req: Request): Promise<TokenPayload | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      return handleUpgrade(req, srv);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/room" && req.method === "GET") {
      const input = url.searchParams.get("url");
      if (!input) return json({ error: "url required" }, 400);
      try {
        const canonical = canonicalizeUrl(input);
        const roomId = await roomIdFor(canonical);
        return json({ url: input, canonical, roomId });
      } catch {
        return json({ error: "invalid url" }, 400);
      }
    }

    if (req.method === "GET" && url.pathname === "/privacy") {
      const file = Bun.file("apps/server/public/privacy.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/admin")) {
      const file = Bun.file("apps/server/public/index.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    try {
      if (url.pathname === "/api/redeem" && req.method === "POST") {
        const limited = checkRateLimit(req, "redeem");
        if (limited) return limited;
        return await handleRedeem(req);
      }

      const user = await authFromReq(req);
      if (!user) return json({ error: "unauthorized" }, 401);

      if (url.pathname === "/api/lenses") {
        if (req.method === "GET") return handleListLenses(req, user);
        if (req.method === "POST") {
          const limited = checkRateLimit(req, "createLens", user);
          if (limited) return limited;
          return await handleCreateLens(req, user, srv);
        }
      }

      const anchorMatch = url.pathname.match(/^\/api\/lenses\/([^/]+)\/anchor$/);
      if (anchorMatch && req.method === "PATCH") {
        const limited = checkRateLimit(req, "updateAnchor", user);
        if (limited) return limited;
        return await handleUpdateLensAnchor(req, user, srv, decodeURIComponent(anchorMatch[1]));
      }

      const lensMatch = url.pathname.match(/^\/api\/lenses\/([^/]+)$/);
      if (lensMatch && req.method === "DELETE") {
        const limited = checkRateLimit(req, "deleteLens", user);
        if (limited) return limited;
        return await handleDeleteLens(user, srv, decodeURIComponent(lensMatch[1]));
      }

      if (url.pathname === "/api/reactions" && req.method === "POST") {
        const limited = checkRateLimit(req, "reaction", user);
        if (limited) return limited;
        return await handleToggleReaction(req, user, srv);
      }

      if (url.pathname === "/api/reports" && req.method === "POST") {
        const limited = checkRateLimit(req, "report", user);
        if (limited) return limited;
        return await handleCreateReport(req, user);
      }

      if (url.pathname === "/api/admin/reports" && req.method === "GET") {
        return handleListReports(req, user);
      }

      const reportMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
      if (reportMatch && req.method === "PATCH") {
        return await handleUpdateReport(req, user, decodeURIComponent(reportMatch[1]));
      }

      if (url.pathname === "/api/admin/revoke-user" && req.method === "POST") {
        return await handleRevokeUserTokens(req, user);
      }

      if (url.pathname === "/api/status" && req.method === "GET") {
        return handleStatus(user);
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      recentErrorCount += 1;
      console.error("[fetch]", err);
      return json({ error: "internal" }, 500);
    }
  },
  websocket,
});

setServerRef(server);

setInterval(() => {
  pruneRateLimitBuckets();
  pruneWsMemory();
}, 10 * 60_000);

console.log(`Lumen v2 server listening on http://localhost:${PORT}`);

function handleStatus(user: TokenPayload): Response {
  if (!isOperator(user.sub)) return json({ error: "forbidden" }, 403);

  let dbWritable = true;
  try {
    db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS lumen_status_write_check (id INTEGER);
      INSERT INTO lumen_status_write_check (id) VALUES (1);
      DELETE FROM lumen_status_write_check;
    `);
  } catch {
    dbWritable = false;
  }

  return json({
    ok: true,
    uptimeMs: Date.now() - startedAt,
    dbWritable,
    ws: wsStats(),
    recentErrorCount,
  });
}
