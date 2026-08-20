import type { Lens, ReadingMode } from "@lumen/schema";

import { parseBody } from "../refs";

// Reading-mode filter. Quiet keeps the page nearly clean; Thinking adds
// questions; Full shows everything. Featured Lens always show.
//
// TODO: when featured/saved/friends signals exist, Quiet should restrict
// to those instead of relying on type alone.
export function shouldShowInMode(lens: Lens, mode: ReadingMode): boolean {
  if (lens.viewerIsAuthor) return true;
  if (mode === "full") return true;
  if (lens.featured) return true;
  if (mode === "thinking") {
    return ["question", "knowledge", "challenge"].includes(lens.type);
  }
  // quiet: keep the page sparse, but do show Quick Lens because Quick is
  // the default creation mode for current beta's small-group UGC loop.
  return ["quick", "knowledge", "challenge"].includes(lens.type);
}

export function refsFromBody(body: string) {
  return parseBody(body)
    .filter((token) => token.kind === "lens" || token.kind === "url")
    .map((token) => ({
      kind: token.kind,
      target: token.value,
      ...(token.label ? { label: token.label } : {}),
    }));
}

export function mergeLensLists(current: Lens[], incoming: Lens[]): Lens[] {
  const byId = new Map<string, Lens>();
  for (const lens of current) byId.set(lens.id, lens);
  for (const lens of incoming) {
    byId.set(lens.id, { ...byId.get(lens.id), ...lens });
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}
