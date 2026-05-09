const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "ref", "mc_eid", "mc_cid",
  "yclid", "msclkid", "twclid", "igshid",
  "ck_subscriber_id", "_hsenc", "_hsmi",
  "spm_id_from", "from_spmid", "vd_source",
  "share_source", "share_medium", "share_plat", "share_session_id",
  "si", "siid",
]);

const TRACKING_PREFIXES = ["utm_", "WT.", "pk_", "ycl_"];

interface SiteCanonicalRule {
  hosts: string[];
  matchPath: RegExp;
  canonicalHost?: string;
  buildPath(match: RegExpMatchArray): string;
  keepQuery?: string[];
}

const SITE_RULES: SiteCanonicalRule[] = [
  {
    hosts: ["bilibili.com"],
    matchPath: /^\/video\/((?:BV|av)[A-Za-z0-9]+)\/?$/i,
    canonicalHost: "www.bilibili.com",
    buildPath: (match) => `/video/${match[1]}`,
    keepQuery: [],
  },
];

export function canonicalizeUrl(input: string, documentCanonical?: string | null): string {
  const source = documentCanonical && sameOriginOrHost(input, documentCanonical)
    ? documentCanonical
    : input;
  return canonicalizeUrlString(source);
}

export function canonicalizeUrlString(input: string): string {
  const u = new URL(input);
  u.hash = "";
  u.host = u.host.toLowerCase();
  u.protocol = u.protocol.toLowerCase();

  applySiteCanonicalRule(u);

  const toRemove: string[] = [];
  for (const key of u.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()))) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) u.searchParams.delete(key);

  const entries = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [key, value] of entries) u.searchParams.append(key, value);

  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

function applySiteCanonicalRule(u: URL) {
  for (const rule of SITE_RULES) {
    if (!rule.hosts.some((host) => u.hostname === host || u.hostname.endsWith(`.${host}`))) continue;
    const match = u.pathname.match(rule.matchPath);
    if (!match) continue;
    if (rule.canonicalHost) u.hostname = rule.canonicalHost;
    u.pathname = rule.buildPath(match);
    const keep = new Set((rule.keepQuery ?? []).map((key) => key.toLowerCase()));
    for (const key of [...u.searchParams.keys()]) {
      if (!keep.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    return;
  }
}

function sameOriginOrHost(current: string, candidate: string): boolean {
  try {
    const currentUrl = new URL(current);
    const candidateUrl = new URL(candidate);
    return currentUrl.origin === candidateUrl.origin || currentUrl.hostname === candidateUrl.hostname;
  } catch {
    return false;
  }
}

export async function roomIdFor(url: string, documentCanonical?: string | null): Promise<string> {
  const canonical = canonicalizeUrl(url, documentCanonical);
  const input = new TextEncoder().encode(canonical);
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", input);
    return bytesToHex(new Uint8Array(hash));
  }
  return sha256Hex(input);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sha256Hex(input: Uint8Array): string {
  const words: number[] = [];
  for (let i = 0; i < input.length; i++) {
    words[i >> 2] = (words[i >> 2] ?? 0) | (input[i] << (24 - (i % 4) * 8));
  }
  const bitLength = input.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64);
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t] ?? 0;
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[t] + w[t]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function rightRotate(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
