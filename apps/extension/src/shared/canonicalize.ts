import { canonicalizeUrl, roomIdFor } from "@lumen/url";

export { canonicalizeUrl, roomIdFor };

export function canonicalUrlFromDocument(doc: Document = document): string | null {
  const selectors = [
    'link[rel~="canonical"][href]',
    'meta[property="og:url"][content]',
    'meta[name="twitter:url"][content]',
  ];
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const value = el instanceof HTMLLinkElement
      ? el.href
      : el instanceof HTMLMetaElement
        ? el.content
        : "";
    const normalized = normalizeCanonicalCandidate(value, doc.location.href);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeCanonicalCandidate(value: string, base: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
