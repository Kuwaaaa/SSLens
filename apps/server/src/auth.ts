import { existsSync, readFileSync } from "node:fs";

const KEYS_PATH = process.env.LUMEN_KEYS ?? "data/keys.json";

if (!existsSync(KEYS_PATH)) {
  console.error(
    `Keys file not found at ${KEYS_PATH}.\n` +
    `Run \`bun run keygen\` from the repo root, then restart.`
  );
  process.exit(1);
}

const { privateJwk, publicJwk } = JSON.parse(readFileSync(KEYS_PATH, "utf-8")) as {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
};

const privateKey = await crypto.subtle.importKey(
  "jwk",
  privateJwk,
  { name: "Ed25519" },
  false,
  ["sign"],
);
const publicKey = await crypto.subtle.importKey(
  "jwk",
  publicJwk,
  { name: "Ed25519" },
  false,
  ["verify"],
);

const enc = new TextEncoder();

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function signToken(sub: string, ttlSec = 365 * 24 * 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = { sub, iat: now, exp: now + ttlSec };
  const header = { alg: "EdDSA", typ: "JWT" };
  const message = `${b64urlEncode(JSON.stringify(header))}.${b64urlEncode(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("Ed25519", privateKey, enc.encode(message));
  return `${message}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const ok = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      b64urlToBytes(sigB64),
      enc.encode(`${headerB64}.${payloadB64}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64)) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- base64url helpers ---

function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return b64urlEncode(s);
}

function b64urlToBytes(s: string): Uint8Array {
  const decoded = b64urlDecode(s);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}
