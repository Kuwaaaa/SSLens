import type { TokenPayload } from "./auth.ts";
import { json } from "./routes.ts";

interface Bucket {
  count: number;
  resetAt: number;
}

interface LimitRule {
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

const RULES: Record<string, LimitRule> = {
  redeem: { limit: 20, windowMs: 10 * 60_000 },
  createLens: { limit: 30, windowMs: 60_000 },
  updateAnchor: { limit: 20, windowMs: 60_000 },
  deleteLens: { limit: 30, windowMs: 60_000 },
  reaction: { limit: 120, windowMs: 60_000 },
  report: { limit: 20, windowMs: 60_000 },
};

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

function keyFor(req: Request, action: string, user?: TokenPayload | null): string {
  return `${action}:${user?.sub ?? clientIp(req)}`;
}

export function checkRateLimit(req: Request, action: keyof typeof RULES, user?: TokenPayload | null): Response | null {
  const rule = RULES[action];
  const now = Date.now();
  const key = keyFor(req, action, user);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= rule.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return json({ error: "rate_limited", retryAfter }, 429);
}

export function pruneRateLimitBuckets(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

