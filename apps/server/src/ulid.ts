// Crockford's base32, no I/L/O/U.
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(): string {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

function encodeTime(time: number, len: number): string {
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    const mod = time % 32;
    out = ENCODING[mod] + out;
    time = (time - mod) / 32;
  }
  return out;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ENCODING[bytes[i] % 32];
  return out;
}
