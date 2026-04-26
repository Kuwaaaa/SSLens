// Shared between server and extension. Pure function, no side effects when imported.

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "ref", "mc_eid", "mc_cid",
  "yclid", "msclkid", "twclid", "igshid",
  "ck_subscriber_id", "_hsenc", "_hsmi",
]);

const TRACKING_PREFIXES = ["utm_"];

export function canonicalizeUrl(input: string): string {
  const u = new URL(input);
  u.hash = "";
  u.host = u.host.toLowerCase();

  const toRemove: string[] = [];
  for (const key of u.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p))) {
      toRemove.push(key);
    }
  }
  for (const k of toRemove) u.searchParams.delete(k);

  // Sort remaining params for deterministic output
  const entries = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of entries) u.searchParams.append(k, v);

  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

export async function roomIdFor(url: string): Promise<string> {
  const canonical = canonicalizeUrl(url);
  const buf = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

if (import.meta.main) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: bun scripts/canonicalize-url.ts <url>");
    process.exit(1);
  }
  const canonical = canonicalizeUrl(input);
  const room = await roomIdFor(input);
  console.log(JSON.stringify({ input, canonical, roomId: room }, null, 2));
}
