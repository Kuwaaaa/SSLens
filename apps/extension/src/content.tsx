// Content script entry. Injected into whitelisted pages by the manifest.
//
// Responsibilities:
//   - render existing Lens as CSS Highlight markers (filtered by reading mode)
//   - capture user text selection -> show "Create Lens" button -> composer
//   - WebSocket subscription to the page's room (lens_created, presence_*)
//   - mount React overlay inside Shadow DOM so page CSS doesn't leak in
//   - track anchor recovery; surface orphan Lens through info panel
//
// MVP NOTE: WebSocket is owned here, not the service worker. See README.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WebSocket as ReconnectingWS } from "partysocket";
import { REACTION_KINDS, type Lens, type LensType, type ReactionKind, type ReadingMode } from "@lumen/schema";

import { canonicalizeUrl, roomIdFor } from "./shared/canonicalize";
import {
  getReadingMode,
  getSiteHidden,
  getToken,
  KEY_HIDDEN_SITES,
  KEY_READING_MODE,
  normalizeHost,
} from "./shared/storage";
import { fetchLensesForRoom, createLens, reportLens, toggleReaction, updateLensAnchor } from "./shared/api";
import { WS_BASE } from "./shared/config";
import { buildTextIndex, createAnchor, flatOffsetsToRange, rangeToFlatOffsets, restoreAnchor } from "@lumen/anchoring";
import {
  applyClusterHighlight,
  applyHighlight,
  clearAllClusterHighlights,
  clearAllHighlights,
  injectMarkerStyles,
  lensIdsAtPoint,
} from "./marker";
import { parseBody, RenderBody } from "./refs";
import { BloomLayer, makeBloomSpec, type BloomIntent, type BloomSpec } from "./shapes";

import overlayCss from "./styles.css?inline";

const LENS_TYPES: LensType[] = ["quick", "fun", "question", "knowledge"];
const REACTION_CHOICES = REACTION_KINDS;

interface SelectionDraft {
  range: Range;
  text: string;
  rect: DOMRect;
}

interface ActiveLensStack {
  rootId: string;
  clusterIds: string[];
  childIds: string[];
}

interface CardPosition {
  top: number;
  left: number;
}

interface ClusterHeatSegment {
  key: string;
  range: Range;
  depth: number;
}

interface ClusterHeatRect {
  key: string;
  depth: number;
  top: number;
  left: number;
  width: number;
  height: number;
  rotate: number;
  radius: number;
}

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 280;
const DEFAULT_CLUSTER_SIBLINGS = 2;
const VIEWPORT_GUTTER = 8;

function hostForUrl(input: string): string {
  try {
    return normalizeHost(new URL(input).hostname);
  } catch {
    return normalizeHost(window.location.hostname);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function positionCardNear(
  anchorRect: DOMRect | null | undefined,
  cardRect?: DOMRect | null,
): CardPosition {
  if (!anchorRect) return { top: 96, left: 24 };

  const cardWidth = Math.min(CARD_WIDTH, Math.max(160, window.innerWidth - 32));
  const cardHeight = Math.min(
    cardRect?.height ?? CARD_HEIGHT_ESTIMATE,
    Math.max(80, window.innerHeight - VIEWPORT_GUTTER * 2),
  );
  const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - cardWidth - VIEWPORT_GUTTER);
  const below = anchorRect.bottom + 8;
  const above = anchorRect.top - cardHeight - 8;
  const hasRoomBelow = below + cardHeight <= window.innerHeight - VIEWPORT_GUTTER;
  const preferredTop = hasRoomBelow || above < VIEWPORT_GUTTER ? below : above;
  const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - cardHeight - VIEWPORT_GUTTER);

  return {
    top: clamp(preferredTop, VIEWPORT_GUTTER, maxTop),
    left: clamp(anchorRect.left, VIEWPORT_GUTTER, maxLeft),
  };
}

// Reading-mode filter. Quiet keeps the page nearly clean; Thinking adds
// questions; Full shows everything. Featured Lens always show.
//
// TODO: when featured/saved/friends signals exist, Quiet should restrict
// to those instead of relying on type alone.
function shouldShowInMode(lens: Lens, mode: ReadingMode): boolean {
  if (lens.viewerIsAuthor) return true;
  if (mode === "full") return true;
  if (lens.featured) return true;
  if (mode === "thinking") {
    return ["question", "knowledge", "challenge"].includes(lens.type);
  }
  // quiet
  return ["knowledge", "challenge"].includes(lens.type);
}

function refsFromBody(body: string) {
  return parseBody(body)
    .filter((token) => token.kind === "lens" || token.kind === "url")
    .map((token) => ({
      kind: token.kind,
      target: token.value,
      ...(token.label ? { label: token.label } : {}),
    }));
}

function rangesOverlap(a: Range, b: Range): boolean {
  // START_TO_END: compares a.end vs b.start → >0 means a.end is after b.start
  // END_TO_START: compares a.start vs b.end → <0 means a.start is before b.end
  return (
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0 &&
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0
  );
}

function rangesEqual(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.START_TO_START, b) === 0 &&
    a.compareBoundaryPoints(Range.END_TO_END, b) === 0
  );
}

function rangeTextLength(range: Range): number {
  return range.toString().length;
}

function stableJitter(input: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

function Overlay({ url, roomId, canonical }: { url: string; roomId: string; canonical: string }) {
  const siteHost = useMemo(() => hostForUrl(canonical || url), [canonical, url]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  // --- Orphan handling ---
  // When restoreAnchor() returns null (DOM has shifted too much for any of
  // TextPosition / TextQuote+context / fuzzy fallback to find the text),
  // we mark the Lens as orphan and surface it through InfoPanel.
  //
  // MANUAL VERIFICATION DEFERRED. The path is implemented but not yet
  // confirmed end-to-end on a live page. Test recipes (in priority order):
  //   1. /admin console: create a Lens with a `Quote` that doesn't appear
  //      on the page (e.g. "ZZZ_NOT_ON_PAGE"). Reload the extension page;
  //      it should land in InfoPanel's "Orphan lens" section.
  //   2. Chrome DevTools "Sources -> Overrides" to persist hand-edits that
  //      scramble previously-anchored quotes.
  //   3. Direct SQLite: UPDATE lenses SET anchor='{"quote":{"exact":"NX"}}'
  //      WHERE id='...';
  //
  // Re-anchor flow: user starts from an orphan row, selects replacement
  // text, confirms, then the client patches the Lens anchor on the server.
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [presence, setPresence] = useState<string[]>([]);
  const [activeLens, setActiveLens] = useState<ActiveLensStack | null>(null);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reanchorTargetId, setReanchorTargetId] = useState<string | null>(null);
  const [reanchorBusy, setReanchorBusy] = useState(false);
  const [reanchorError, setReanchorError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("quiet");
  const [siteHidden, setSiteHiddenState] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const anchorRanges = useRef<Map<string, Range>>(new Map());

  // --- Geometric shape blooms ---
  // Small SVG primitives that emerge from behind a card (or beside a new
  // marker). See shapes.tsx + the `lumen-bloom` keyframe in styles.css.
  const [blooms, setBlooms] = useState<Array<{ id: string; spec: BloomSpec }>>([]);
  const triggerBloom = useCallback(
    (rect: DOMRect, intent: BloomIntent) => {
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBlooms((b) => [...b, { id, spec: makeBloomSpec(rect, intent) }]);
    },
    [],
  );
  const removeBloom = useCallback((id: string) => {
    setBlooms((b) => b.filter((x) => x.id !== id));
  }, []);

  const lumenHidden = siteHidden || tabHidden;

  // Load token + reading mode + site visibility.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getToken(), getReadingMode(), getSiteHidden(siteHost)])
      .then(([nextToken, nextMode, hidden]) => {
        if (cancelled) return;
        setToken(nextToken);
        setReadingMode(nextMode);
        setSiteHiddenState(hidden);
      })
      .catch((err) => {
        console.warn("[Lumen] settings load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setSettingsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [siteHost]);

  // Listen for popup changes.
  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      const c = changes[KEY_READING_MODE];
      if (c) setReadingMode((c.newValue as ReadingMode | undefined) ?? "quiet");
      const hidden = changes[KEY_HIDDEN_SITES];
      if (hidden) {
        const next = (hidden.newValue as Record<string, boolean> | undefined) ?? {};
        setSiteHiddenState(next[siteHost] === true);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [siteHost]);

  useEffect(() => {
    if (!lumenHidden) return;
    clearAllHighlights();
    clearAllClusterHighlights();
    setPanelOpen(false);
    setActiveLens(null);
    setDraft(null);
    setComposerOpen(false);
    setReanchorTargetId(null);
    setReanchorError(null);
    setPresence([]);
    setWsConnected(false);
    setBlooms([]);
  }, [lumenHidden]);

  useEffect(() => {
    if (lumenHidden) return;
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        setLayoutTick((n) => n + 1);
      });
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [lumenHidden]);

  // Initial fetch: hydrate ranges + orphan set
  useEffect(() => {
    if (!token || lumenHidden) return;
    let cancelled = false;
    fetchLensesForRoom(roomId, token)
      .then((ls) => {
        if (cancelled) return;
        anchorRanges.current.clear();
        const orphans = new Set<string>();
        for (const lens of ls) {
          const range = restoreAnchor(lens.anchor);
          if (range) anchorRanges.current.set(lens.id, range);
          else orphans.add(lens.id);
        }
        setOrphanIds(orphans);
        setLenses(ls);
      })
      .catch((err) => console.warn("[Lumen] fetchLenses failed:", err));
    return () => {
      cancelled = true;
      anchorRanges.current.clear();
      clearAllHighlights();
    };
  }, [token, roomId, lumenHidden]);

  // WebSocket
  useEffect(() => {
    if (!token || lumenHidden) return;
    const ws = new ReconnectingWS(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);

    ws.addEventListener("open", () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", roomId }));
    });
    ws.addEventListener("close", () => setWsConnected(false));
    ws.addEventListener("message", (e: MessageEvent) => {
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      if (msg.type === "subscribed") {
        setPresence((msg.presence as string[]) ?? []);
      } else if (msg.type === "presence_join") {
        setPresence((p) => [...new Set([...p, msg.userId as string])]);
      } else if (msg.type === "presence_leave") {
        setPresence((p) => p.filter((u) => u !== (msg.userId as string)));
      } else if (msg.type === "lens_created") {
        const lens = msg.lens as Lens;
        // Dedup against the always-current ref Map
        if (!anchorRanges.current.has(lens.id)) {
          const range = restoreAnchor(lens.anchor);
          if (range) {
            anchorRanges.current.set(lens.id, range);
            // Pop a small bloom near the new marker once highlight has rendered.
            window.setTimeout(() => {
              const r = range.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                triggerBloom(r, "marker");
              }
            }, 80);
          } else {
            setOrphanIds((s) => {
              if (s.has(lens.id)) return s;
              const next = new Set(s);
              next.add(lens.id);
              return next;
            });
          }
        }
        setLenses((prev) => (prev.some((l) => l.id === lens.id) ? prev : [...prev, lens]));
      } else if (msg.type === "lens_anchor_updated") {
        const lens = msg.lens as Lens;
        const range = restoreAnchor(lens.anchor);
        if (range) {
          anchorRanges.current.set(lens.id, range);
          setOrphanIds((s) => {
            if (!s.has(lens.id)) return s;
            const next = new Set(s);
            next.delete(lens.id);
            return next;
          });
        } else {
          anchorRanges.current.delete(lens.id);
          setOrphanIds((s) => {
            if (s.has(lens.id)) return s;
            const next = new Set(s);
            next.add(lens.id);
            return next;
          });
        }
        setLenses((prev) => (
          prev.some((l) => l.id === lens.id)
            ? prev.map((l) => (l.id === lens.id ? { ...lens, myReactions: l.myReactions } : l))
            : [...prev, lens]
        ));
      } else if (msg.type === "reaction_updated") {
        const lensId = msg.lensId as string;
        const reactions = msg.reactions as Partial<Record<ReactionKind, number>>;
        setLenses((prev) => prev.map((l) => (
          l.id === lensId ? { ...l, reactions } : l
        )));
      }
    });

    return () => {
      ws.close();
      setWsConnected(false);
    };
  }, [token, roomId, lumenHidden]);

  // Visible lenses = not orphan + passes mode filter
  const visibleLenses = useMemo(
    () => lumenHidden ? [] : lenses.filter((l) => !orphanIds.has(l.id) && shouldShowInMode(l, readingMode)),
    [lenses, lumenHidden, orphanIds, readingMode],
  );

  const clusterableLenses = useMemo(
    () => lumenHidden ? [] : lenses.filter((l) => !orphanIds.has(l.id)),
    [lenses, lumenHidden, orphanIds],
  );

  const visibleLensIds = useMemo(
    () => new Set(visibleLenses.map((lens) => lens.id)),
    [visibleLenses],
  );

  const draftOverlapLenses = useMemo(() => {
    if (!draft) return [];
    return lenses.filter((lens) => {
      if (orphanIds.has(lens.id)) return false;
      const range = anchorRanges.current.get(lens.id);
      return range ? rangesOverlap(draft.range, range) : false;
    });
  }, [draft, lenses, orphanIds]);

  const clusterHeatSegments = useMemo(
    () => buildClusterHeatSegments(clusterableLenses, visibleLensIds),
    [clusterableLenses, visibleLensIds],
  );

  const clusterHeatRects = useMemo(
    () => buildClusterHeatRects(clusterHeatSegments, layoutTick),
    [clusterHeatSegments, layoutTick],
  );

  // Apply highlights for visible lenses, clear hidden ones
  useEffect(() => {
    clearAllHighlights();
    for (const lens of visibleLenses) {
      const range = anchorRanges.current.get(lens.id);
      if (range) applyHighlight(lens.id, range);
    }
  }, [visibleLenses]);

  // The rounded overlay paints every visible marker segment. Single-covered
  // spans stay very quiet; overlaps get progressively warmer and denser.
  // CSS Highlights still provide the dotted underline and click hit testing.
  useEffect(() => {
    clearAllClusterHighlights();
    for (const segment of clusterHeatSegments) {
      if (segment.depth >= 2) {
        applyClusterHighlight(segment.key, segment.range, segment.depth);
      }
    }
    return () => clearAllClusterHighlights();
  }, [clusterHeatSegments]);

  // Auto-close only if the root Lens disappears. Ref children may be hidden
  // by the current reading mode and should stay readable inside the stack.
  useEffect(() => {
    if (activeLens && !lenses.find((l) => l.id === activeLens.rootId)) {
      setActiveLens(null);
    }
  }, [activeLens, lenses]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveLens(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Capture text selection
  useEffect(() => {
    if (lumenHidden) return;
    function onMouseUp(e: MouseEvent) {
      const target = e.target as Node | null;
      if (target && (target as Element).closest?.("#lumen-root, [data-lumen-overlay]")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setDraft(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = range.toString().trim();
      if (text.length < 3) {
        setDraft(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setDraft({ range: range.cloneRange(), text, rect });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [lumenHidden]);

  // Click handler for highlights
  useEffect(() => {
    if (lumenHidden) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (target && (target as Element).closest?.("#lumen-root, [data-lumen-overlay]")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length >= 3) {
        return;
      }
      const pointIds = lensIdsAtPoint(e.clientX, e.clientY);
      const id = preferredLensIdAtPoint(pointIds);
      if (id) {
        setActiveLens(activeStackForLens(id));
        setDraft(null);
      } else {
        setActiveLens(null);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [lumenHidden, clusterableLenses]);

  async function publish(input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) {
    if (!token || !draft) return;
    const anchor = createAnchor(draft.range);
    await createLens(
      {
        roomId,
        url: canonical,
        type: input.type,
        body: input.body,
        anchor,
        tags: input.tags,
        refs: refsFromBody(input.body),
        anonymous: input.anonymous,
      },
      token,
    );
    setComposerOpen(false);
    setDraft(null);
    window.getSelection()?.removeAllRanges();
  }

  async function confirmReanchor() {
    if (!token || !draft || !reanchorTargetId) return;
    setReanchorBusy(true);
    setReanchorError(null);
    try {
      const anchor = createAnchor(draft.range);
      const lens = await updateLensAnchor(reanchorTargetId, anchor, token);
      const restored = restoreAnchor(lens.anchor) ?? draft.range.cloneRange();
      anchorRanges.current.set(lens.id, restored);
      setLenses((prev) => prev.map((l) => (l.id === lens.id ? lens : l)));
      setOrphanIds((s) => {
        const next = new Set(s);
        next.delete(lens.id);
        return next;
      });
      setReanchorTargetId(null);
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setReanchorError(
        message.includes("403")
          ? "Only the original author or an operator can re-anchor this Lens."
          : message,
      );
    } finally {
      setReanchorBusy(false);
    }
  }

  if (!settingsReady) return null;
  if (tabHidden) return <RestoreTabButton onClick={() => setTabHidden(false)} />;
  if (lumenHidden) return null;
  if (!token) return <NoTokenHint />;

  const activeLensStack = activeLens
    ? [activeLens.rootId, ...activeLens.clusterIds, ...activeLens.childIds]
        .map((id) => lenses.find((l) => l.id === id) ?? null)
        .filter((l): l is Lens => !!l)
    : [];
  const activeLensRange = activeLens ? anchorRanges.current.get(activeLens.rootId) ?? null : null;
  const activeLensClusterCount = activeLens ? activeLens.clusterIds.length + 1 : 0;
  const others = presence.length;
  const hiddenCount = lenses.length - visibleLenses.length - orphanIds.size;

  function clusterIdsForLens(id: string, pool: Lens[]): string[] {
    const rootRange = anchorRanges.current.get(id);
    if (!rootRange) return [];
    const siblings = pool
      .filter((lens) => {
        if (lens.id === id) return false;
        const range = anchorRanges.current.get(lens.id);
        return range ? rangesOverlap(rootRange, range) : false;
      })
      .sort((a, b) => {
        const aRange = anchorRanges.current.get(a.id);
        const bRange = anchorRanges.current.get(b.id);
        const aExact = aRange ? rangesEqual(rootRange, aRange) : false;
        const bExact = bRange ? rangesEqual(rootRange, bRange) : false;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.createdAt - b.createdAt;
      });
    return siblings.map((lens) => lens.id);
  }

  function sortClusterLensIds(ids: string[]): string[] {
    return [...ids].sort((a, b) => {
      const aRange = anchorRanges.current.get(a);
      const bRange = anchorRanges.current.get(b);
      const aLength = aRange ? rangeTextLength(aRange) : Number.MAX_SAFE_INTEGER;
      const bLength = bRange ? rangeTextLength(bRange) : Number.MAX_SAFE_INTEGER;
      if (aLength !== bLength) return aLength - bLength;
      const aLens = lenses.find((lens) => lens.id === a);
      const bLens = lenses.find((lens) => lens.id === b);
      return (aLens?.createdAt ?? 0) - (bLens?.createdAt ?? 0);
    });
  }

  function activeStackForLensIds(ids: string[]): ActiveLensStack | null {
    const sorted = sortClusterLensIds([...new Set(ids)]);
    const rootId = sorted[0];
    if (!rootId) return null;
    return {
      rootId,
      clusterIds: sorted.slice(1),
      childIds: [],
    };
  }

  function activeStackForLens(id: string): ActiveLensStack {
    if (!lenses.find((lens) => lens.id === id)) {
      return {
        rootId: id,
        clusterIds: [],
        childIds: [],
      };
    }
    return {
      rootId: id,
      clusterIds: sortClusterLensIds(clusterIdsForLens(id, clusterableLenses)),
      childIds: [],
    };
  }

  function preferredLensIdAtPoint(ids: string[]): string | null {
    return sortClusterLensIds([...new Set(ids)])[0] ?? null;
  }

  function buildClusterHeatSegments(pool: Lens[], visibleIds: Set<string>): ClusterHeatSegment[] {
    const index = buildTextIndex(document.body);
    const spans = pool
      .map((lens) => {
        const range = anchorRanges.current.get(lens.id);
        const offsets = range ? rangeToFlatOffsets(range, index) : null;
        if (!offsets || offsets.end <= offsets.start) return null;
        return {
          id: lens.id,
          start: offsets.start,
          end: offsets.end,
          visible: visibleIds.has(lens.id),
        };
      })
      .filter((span): span is { id: string; start: number; end: number; visible: boolean } => !!span);

    if (spans.length === 0) return [];

    const boundaries = [...new Set(spans.flatMap((span) => [span.start, span.end]))]
      .sort((a, b) => a - b);
    const segments: ClusterHeatSegment[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (end <= start) continue;

      const covering = spans.filter((span) => span.start < end && span.end > start);
      if (covering.length === 0 || !covering.some((span) => span.visible)) continue;

      const range = flatOffsetsToRange(start, end, index);
      if (!range) continue;
      segments.push({
        key: `${start}:${end}`,
        range,
        depth: covering.length,
      });
    }

    return segments;
  }

  function buildClusterHeatRects(segments: ClusterHeatSegment[], tick: number): ClusterHeatRect[] {
    void tick;
    return segments.flatMap((segment) => (
      Array.from(segment.range.getClientRects())
        .filter((rect) => (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.top <= window.innerHeight &&
          rect.right >= 0 &&
          rect.left <= window.innerWidth
        ))
        .map((rect, index) => {
          const key = `${segment.key}:${index}`;
          return {
            key,
            depth: segment.depth,
            top: rect.top + 1 + stableJitter(key, 1) * 0.8,
            left: rect.left - 1 + stableJitter(key, 2) * 0.9,
            width: rect.width + 2 + stableJitter(key, 3) * 1.8,
            height: Math.max(4, rect.height - 1 + stableJitter(key, 4) * 1.4),
            rotate: stableJitter(key, 5) * 0.45,
            radius: 4.5 + stableJitter(key, 6) * 1.4,
          };
        })
    ));
  }

  function jumpToLensAnchor(id: string) {
    const range = anchorRanges.current.get(id);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      window.scrollBy({
        top: rect.top - window.innerHeight * 0.35,
        behavior: "smooth",
      });
    } else {
      const node = range.startContainer;
      const el = node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    setActiveLens(activeStackForLens(id));
  }

  function openReferencedLens(id: string) {
    setActiveLens((current) => {
      if (!current) return activeStackForLens(id);
      const existingIndex = current.childIds.indexOf(id);
      if (current.rootId === id) return { ...current, childIds: [] };
      if (current.clusterIds.includes(id)) {
        return activeStackForLens(id);
      }
      if (existingIndex >= 0) {
        return { ...current, childIds: current.childIds.slice(0, existingIndex + 1) };
      }
      return { ...current, childIds: [...current.childIds, id] };
    });
  }

  async function reactToLens(id: string, kind: ReactionKind) {
    if (!token) return;
    const result = await toggleReaction(id, kind, token);
    setLenses((prev) => prev.map((l) => (
      l.id === result.lensId
        ? { ...l, reactions: result.reactions, myReactions: result.myReactions }
        : l
    )));
  }

  async function reportLensById(id: string) {
    if (!token) return;
    await reportLens(id, token);
  }

  function startReanchor(id: string) {
    setReanchorTargetId(id);
    setReanchorError(null);
    setComposerOpen(false);
    setDraft(null);
    setActiveLens(null);
  }

  return (
    <>
      <Orb
        count={visibleLenses.length}
        live={wsConnected}
        others={others}
        extraCount={hiddenCount + orphanIds.size}
        onToggle={() => setPanelOpen((v) => !v)}
      />
      <ClusterHeatOverlay rects={clusterHeatRects} />
      {panelOpen && (
        <InfoPanel
          mode={readingMode}
          visible={visibleLenses.length}
          hidden={hiddenCount}
          orphanLenses={lenses.filter((l) => orphanIds.has(l.id))}
          currentLens={activeLensStack[activeLensStack.length - 1] ?? null}
          reanchorTargetId={reanchorTargetId}
          onClose={() => setPanelOpen(false)}
          onHideTab={() => setTabHidden(true)}
          onReport={reportLensById}
          onReanchor={startReanchor}
          onCancelReanchor={() => {
            setReanchorTargetId(null);
            setReanchorError(null);
          }}
        />
      )}
      {draft && !composerOpen && !reanchorTargetId && (
        <CreateButton draft={draft} onClick={() => setComposerOpen(true)} />
      )}
      {reanchorTargetId && draft && (
        <ReanchorConfirm
          draft={draft}
          busy={reanchorBusy}
          error={reanchorError}
          onCancel={() => {
            setReanchorTargetId(null);
            setReanchorError(null);
            setDraft(null);
          }}
          onConfirm={() => void confirmReanchor()}
        />
      )}
      {composerOpen && draft && !reanchorTargetId && (
        <Composer
          draft={draft}
          referenceLenses={lenses}
          overlapLenses={draftOverlapLenses}
          onCancel={() => {
            setComposerOpen(false);
            setDraft(null);
          }}
          onSubmit={publish}
        />
      )}
      {activeLens && activeLensStack.length > 0 && (
        <LensCard
          key={activeLens.rootId}
          lenses={activeLensStack}
          clusterCount={activeLensClusterCount}
          rootAnchorRange={activeLensRange}
          hasAnchor={(id) => anchorRanges.current.has(id)}
          onJumpToAnchor={jumpToLensAnchor}
          knownLenses={lenses}
          onLensClick={openReferencedLens}
          onReact={reactToLens}
          onMount={(rect) => triggerBloom(rect, "card-open")}
        />
      )}
      {blooms.map((b) => (
        <BloomLayer key={b.id} spec={b.spec} onComplete={() => removeBloom(b.id)} />
      ))}
    </>
  );
}

function Orb({
  count,
  live,
  others = 0,
  extraCount = 0,
  onToggle,
}: {
  count: number;
  live: boolean;
  others?: number;
  extraCount?: number;
  onToggle: () => void;
}) {
  return (
    <button className="orb" onClick={onToggle}>
      <span className={`dot ${live ? "" : "idle"}`} />
      <span>{count} lens</span>
      {others > 0 && <span className="orb-meta">· {others} here</span>}
      {extraCount > 0 && <span className="orb-badge">+{extraCount}</span>}
    </button>
  );
}

function ClusterHeatOverlay({ rects }: { rects: ClusterHeatRect[] }) {
  return (
    <div className="cluster-heat-layer" data-lumen-overlay="" aria-hidden="true">
      {rects.map((rect) => (
        <span
          key={rect.key}
          className={`cluster-heat depth-${Math.min(rect.depth, 4)}`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: rect.radius,
            transform: `rotate(${rect.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function InfoPanel({
  mode,
  visible,
  hidden,
  orphanLenses,
  currentLens,
  reanchorTargetId,
  onClose,
  onHideTab,
  onReport,
  onReanchor,
  onCancelReanchor,
}: {
  mode: ReadingMode;
  visible: number;
  hidden: number;
  orphanLenses: Lens[];
  currentLens: Lens | null;
  reanchorTargetId: string | null;
  onClose: () => void;
  onHideTab: () => void;
  onReport: (id: string) => void | Promise<void>;
  onReanchor: (id: string) => void;
  onCancelReanchor: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [reportState, setReportState] = useState<"idle" | "reported" | "failed">("idle");
  const copyResetTimer = useRef<number | null>(null);
  const reportResetTimer = useRef<number | null>(null);

  useEffect(() => {
    setCopyState("idle");
    setReportState("idle");
  }, [currentLens?.id]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      if (reportResetTimer.current !== null) window.clearTimeout(reportResetTimer.current);
    };
  }, []);

  async function copyRef() {
    if (!currentLens) return;
    try {
      await writeClipboardText(`[[lens:${currentLens.id}]]`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), 1400);
  }

  async function report() {
    if (!currentLens) return;
    try {
      await onReport(currentLens.id);
      setReportState("reported");
    } catch {
      setReportState("failed");
    }
    if (reportResetTimer.current !== null) window.clearTimeout(reportResetTimer.current);
    reportResetTimer.current = window.setTimeout(() => setReportState("idle"), 1800);
  }

  const copyLabel = copyState === "copied"
    ? "Copied"
    : copyState === "failed"
      ? "Copy failed"
      : "Copy reference";
  const reportLabel = reportState === "reported"
    ? "Reported"
    : reportState === "failed"
      ? "Report failed"
      : "Report";

  return (
    <section className="info-panel" data-lumen-overlay="">
      <div className="ip-header">
        <strong>Lumen</strong>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="ip-section">
        <div className="ip-row">
          <span>Reading mode</span>
          <span className="pill">{mode}</span>
        </div>
        <div className="ip-hint">Switch in the extension popup.</div>
      </div>

      <div className="ip-section">
        <div className="ip-row"><span>{visible} visible on this page</span></div>
        {hidden > 0 && (
          <div className="ip-row muted">{hidden} hidden by {mode} mode</div>
        )}
        {orphanLenses.length > 0 && (
          <div className="ip-row muted">{orphanLenses.length} lost their anchor</div>
        )}
      </div>

      <div className="ip-section">
        <button className="ip-action" onClick={onHideTab}>Hide on this tab</button>
      </div>

      {currentLens && (
        <div className="ip-section">
          <div className="ip-label">Current lens</div>
          <div className="ip-row">
            <span className="ip-current-meta">
              <span className="pill">{currentLens.type}</span>
              <span>@{currentLens.author?.handle ?? "unknown"}</span>
            </span>
          </div>
          <div className="ip-actions">
            <button
              className={copyState === "copied" ? "success" : copyState === "failed" ? "danger" : ""}
              onClick={() => void copyRef()}
            >
              {copyLabel}
            </button>
            <button
              className={`report ${reportState === "reported" ? "success" : reportState === "failed" ? "danger" : ""}`}
              onClick={() => void report()}
            >
              {reportLabel}
            </button>
          </div>
        </div>
      )}

      {orphanLenses.length > 0 && (
        <div className="ip-section">
          <div className="ip-label">Orphan lens</div>
          {reanchorTargetId && (
            <div className="ip-hint reanchor-hint">
              <span>Select the new text anchor on the page.</span>
              <button onClick={onCancelReanchor}>Cancel</button>
            </div>
          )}
          {orphanLenses.map((l) => (
            <div key={l.id} className="orphan-row">
              <div className="orphan-meta">
                <span className="pill">{l.type}</span>
                <span>@{l.author?.handle ?? "unknown"}</span>
              </div>
              {l.anchor?.quote?.exact && (
                <div className="orphan-quote">"{l.anchor.quote.exact.slice(0, 80)}"</div>
              )}
              <div className="orphan-body">
                {l.body.slice(0, 100)}{l.body.length > 100 ? "…" : ""}
              </div>
              {l.canEditAnchor ? (
                <button
                  className="orphan-action"
                  onClick={() => onReanchor(l.id)}
                  disabled={reanchorTargetId === l.id}
                >
                  {reanchorTargetId === l.id ? "Selecting..." : "Re-anchor"}
                </button>
              ) : (
                <div className="orphan-note">Only the author or an operator can re-anchor this Lens.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NoTokenHint() {
  return (
    <div className="no-token-hint">
      <strong>Lumen</strong>
      <div style={{ marginTop: 4 }}>
        Click the extension icon to redeem an invite, then reload this page.
      </div>
    </div>
  );
}

function RestoreTabButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="restore-tab" onClick={onClick} data-lumen-overlay="">
      Show Lumen
    </button>
  );
}

function CreateButton({ draft, onClick }: { draft: SelectionDraft; onClick: () => void }) {
  const top = Math.min(window.innerHeight - 50, draft.rect.bottom + 6);
  const left = Math.max(8, Math.min(window.innerWidth - 130, draft.rect.left));
  return (
    <button
      className="create-button"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      Create Lens
    </button>
  );
}

function ReanchorConfirm({
  draft,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  draft: SelectionDraft;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const top = Math.min(window.innerHeight - 150, draft.rect.bottom + 8);
  const left = Math.max(8, Math.min(window.innerWidth - 300, draft.rect.left));

  return (
    <div className="reanchor-confirm" style={{ top, left }} data-lumen-overlay="">
      <div className="quote-preview">"{draft.text.slice(0, 140)}"</div>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={onConfirm} disabled={busy}>{busy ? "Saving..." : "Use as anchor"}</button>
      </div>
    </div>
  );
}

function Composer({
  draft,
  referenceLenses,
  overlapLenses,
  onCancel,
  onSubmit,
}: {
  draft: SelectionDraft;
  referenceLenses: Lens[];
  overlapLenses: Lens[];
  onCancel: () => void;
  onSubmit: (input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) => void | Promise<void>;
}) {
  const [type, setType] = useState<LensType>("quick");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const top = Math.min(window.innerHeight - 320, draft.rect.bottom + 12);
  const left = Math.max(8, Math.min(window.innerWidth - 380, draft.rect.left));

  async function submit() {
    if (!body.trim()) {
      setError("Body required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      await onSubmit({ type, body: body.trim(), tags, anonymous });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function insertLensRef(lensId: string) {
    const snippet = `[[lens:${lensId}]]`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const prefix = body.slice(0, start);
    const suffix = body.slice(end);
    const spacerBefore = prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
    const spacerAfter = suffix.length > 0 && !/^\s/.test(suffix) ? " " : "";
    const inserted = `${spacerBefore}${snippet}${spacerAfter}`;
    const next = `${prefix}${inserted}${suffix}`;
    setBody(next);
    setRefPickerOpen(false);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      const pos = start + inserted.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <div className="composer" style={{ top, left }} data-lumen-overlay="">
      <div className="quote-preview">"{draft.text.slice(0, 200)}"</div>
      {overlapLenses.length > 0 && (
        <div className="overlap-hint">
          <span>{overlapLenses.length} Lens already here</span>
          <button type="button" onClick={() => setRefPickerOpen(true)}>Reference one</button>
        </div>
      )}
      <div>
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as LensType)}>
          {LENS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label>Body</label>
        <textarea ref={textareaRef} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </div>
      {referenceLenses.length > 0 && (
        <div className="ref-insert">
          <button type="button" className="ref-insert-toggle" onClick={() => setRefPickerOpen((v) => !v)}>
            Insert reference
          </button>
          {refPickerOpen && (
            <div className="ref-insert-list">
              {referenceLenses.map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  className="ref-insert-item"
                  onClick={() => insertLensRef(lens.id)}
                >
                  <span className="ref-insert-meta">
                    <span className="pill">{lens.type}</span>
                    <span>@{lens.author?.handle ?? "unknown"}</span>
                  </span>
                  <span className="ref-insert-body">{lens.body.slice(0, 72)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <label>Tags (comma-separated)</label>
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.currentTarget.checked)}
        />
        <span>Post as Anonymous</span>
      </label>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy}>{busy ? "Posting…" : "Publish"}</button>
      </div>
    </div>
  );
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some content-script contexts expose Clipboard API but reject writes.
    }
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position: fixed; left: -9999px; top: 0;";
  document.body.appendChild(el);
  el.select();
  const copied = document.execCommand("copy");
  el.remove();
  if (!copied) throw new Error("copy failed");
}

function LensCard({
  lenses,
  clusterCount,
  rootAnchorRange,
  hasAnchor,
  onJumpToAnchor,
  knownLenses,
  onLensClick,
  onReact,
  onMount,
}: {
  lenses: Lens[];
  clusterCount: number;
  rootAnchorRange: Range | null;
  hasAnchor: (id: string) => boolean;
  onJumpToAnchor: (id: string) => void;
  knownLenses?: Lens[];
  onLensClick?: (id: string) => void;
  onReact: (id: string, kind: ReactionKind) => void | Promise<void>;
  onMount?: (rect: DOMRect) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const expandableRef = useRef<HTMLDivElement>(null);
  const [clusterExpanded, setClusterExpanded] = useState(false);
  const [expandableHeight, setExpandableHeight] = useState(0);
  const [position, setPosition] = useState<CardPosition>(() =>
    positionCardNear(rootAnchorRange?.getBoundingClientRect()),
  );
  const rootLens = lenses[0] ?? null;
  const clusterSiblings = lenses.slice(1, clusterCount);
  const referencedLenses = lenses.slice(clusterCount);
  const visibleClusterSiblings = clusterSiblings.slice(0, DEFAULT_CLUSTER_SIBLINGS);
  const expandableClusterSiblings = clusterSiblings.slice(DEFAULT_CLUSTER_SIBLINGS);
  const primaryLenses = [
    ...(rootLens ? [rootLens] : []),
    ...visibleClusterSiblings,
  ];

  useEffect(() => {
    if (sectionRef.current && onMount) {
      onMount(sectionRef.current.getBoundingClientRect());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = expandableRef.current;
    if (!el) {
      setExpandableHeight(0);
      return;
    }
    const measure = () => setExpandableHeight(el.scrollHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandableClusterSiblings.length, clusterExpanded]);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = positionCardNear(
        rootAnchorRange?.getBoundingClientRect(),
        sectionRef.current?.getBoundingClientRect(),
      );
      setPosition((prev) => (
        prev.top === next.top && prev.left === next.left ? prev : next
      ));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [rootAnchorRange, lenses.length, clusterCount, clusterExpanded]);

  return (
    <section ref={sectionRef} className="card card-stack" style={position} data-lumen-overlay="">
      {clusterCount > 1 && (
        <div className="cluster-note">{clusterCount} Lens on this passage</div>
      )}
      {primaryLenses.map((lens, index) => (
        <LensPanel
          key={lens.id}
          lens={lens}
          depth={index}
          stackLabel={index > 0 && index <= visibleClusterSiblings.length ? "Same passage" : "Referenced lens"}
          hasAnchor={hasAnchor(lens.id)}
          knownLenses={knownLenses}
          onLensClick={onLensClick}
          onReact={onReact}
          onJumpToAnchor={() => onJumpToAnchor(lens.id)}
        />
      ))}
      {expandableClusterSiblings.length > 0 && (
        <div className={`collapsed-cluster ${clusterExpanded ? "hidden" : ""}`}>
          <div className="stack-label">Same passage</div>
          {expandableClusterSiblings.slice(0, 3).map((lens) => (
            <button
              key={lens.id}
              type="button"
              className="collapsed-lens"
              onClick={() => setClusterExpanded(true)}
            >
              <span className="pill">{lens.type}</span>
              <span>@{lens.author?.handle ?? "unknown"}</span>
              <span className="collapsed-body">{lens.body.slice(0, 72)}</span>
            </button>
          ))}
          <button className="show-more-lens" onClick={() => setClusterExpanded(true)}>
            Show {expandableClusterSiblings.length} more
          </button>
        </div>
      )}
      {expandableClusterSiblings.length > 0 && (
        <div
          className={`expandable-cluster ${clusterExpanded ? "expanded" : ""}`}
          style={{ maxHeight: clusterExpanded ? expandableHeight : 0 }}
          aria-hidden={!clusterExpanded}
        >
          <div ref={expandableRef} className="expandable-cluster-inner">
            {expandableClusterSiblings.map((lens, index) => (
              <LensPanel
                key={lens.id}
                lens={lens}
                depth={visibleClusterSiblings.length + index + 1}
                stackLabel="Same passage"
                hasAnchor={hasAnchor(lens.id)}
                knownLenses={knownLenses}
                onLensClick={onLensClick}
                onReact={onReact}
                onJumpToAnchor={() => onJumpToAnchor(lens.id)}
              />
            ))}
          </div>
        </div>
      )}
      {clusterExpanded && expandableClusterSiblings.length > 0 && (
        <button className="show-more-lens collapse" onClick={() => setClusterExpanded(false)}>
          Collapse same-passage Lens
        </button>
      )}
      {referencedLenses.map((lens, index) => (
        <LensPanel
          key={lens.id}
          lens={lens}
          depth={primaryLenses.length + expandableClusterSiblings.length + index}
          stackLabel="Referenced lens"
          hasAnchor={hasAnchor(lens.id)}
          knownLenses={knownLenses}
          onLensClick={onLensClick}
          onReact={onReact}
          onJumpToAnchor={() => onJumpToAnchor(lens.id)}
        />
      ))}
    </section>
  );
}

function LensPanel({
  lens,
  depth,
  stackLabel,
  hasAnchor,
  knownLenses,
  onLensClick,
  onReact,
  onJumpToAnchor,
}: {
  lens: Lens;
  depth: number;
  stackLabel: string;
  hasAnchor: boolean;
  knownLenses?: Lens[];
  onLensClick?: (id: string) => void;
  onReact: (id: string, kind: ReactionKind) => void | Promise<void>;
  onJumpToAnchor: () => void;
}) {
  const quote = lens.anchor?.quote?.exact ?? "";
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function toggleEmoji(kind: ReactionKind) {
    setReactionBusy(kind);
    try {
      await onReact(lens.id, kind);
      setPickerOpen(false);
    } finally {
      setReactionBusy(null);
    }
  }

  const visibleReactions = REACTION_CHOICES.filter((kind) => (
    (lens.reactions?.[kind] ?? 0) > 0 || (lens.myReactions?.includes(kind) ?? false)
  ));

  return (
    <div className={depth === 0 ? "lens-panel" : "lens-panel ref-panel"}>
      {depth > 0 && <div className="stack-label">{stackLabel}</div>}
      <div className="meta">
        <span className="pill">{lens.type}</span>
        {(lens.tags ?? []).map((t) => (
          <span key={t} className="pill" style={{ background: "#f0f0f0", color: "#555" }}>{t}</span>
        ))}
        <span>@{lens.author?.handle ?? "unknown"}</span>
        {depth > 0 && hasAnchor && (
          <span className="card-actions">
            <button
              className="icon-action jump-anchor"
              onClick={onJumpToAnchor}
              aria-label="View anchor"
              data-tooltip="View anchor"
            >
              <TargetIcon />
            </button>
          </span>
        )}
      </div>
      {quote && <div className="quote">"{quote.slice(0, 160)}"</div>}
      <div className="body">
        <RenderBody body={lens.body} knownLenses={knownLenses} onLensClick={onLensClick} />
      </div>
      <div className="reaction-bar" aria-label="Reactions">
        {visibleReactions.map((kind) => {
          const count = lens.reactions?.[kind] ?? 0;
          const selected = lens.myReactions?.includes(kind) ?? false;
          return (
            <button
              key={kind}
              className={`reaction-chip${selected ? " selected" : ""}`}
              onClick={() => void toggleEmoji(kind)}
              disabled={reactionBusy === kind}
              aria-label={`${selected ? "Remove" : "Add"} ${kind} reaction`}
            >
              <span>{kind}</span>
              {count > 0 && <span className="reaction-count">{count}</span>}
            </button>
          );
        })}
        <button
          className="reaction-add"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
        >
          +
        </button>
        {pickerOpen && (
          <div className="reaction-picker">
            {REACTION_CHOICES.map((kind) => (
              <button
                key={kind}
                className="reaction-choice"
                onClick={() => void toggleEmoji(kind)}
                disabled={reactionBusy === kind}
                aria-label={`Add ${kind} reaction`}
              >
                {kind}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
    </svg>
  );
}

// --- bootstrap ---

async function boot() {
  if (document.getElementById("lumen-root")) return;

  const url = window.location.href;
  let roomId: string;
  let canonical: string;
  try {
    canonical = canonicalizeUrl(url);
    roomId = await roomIdFor(url);
  } catch (err) {
    console.warn("[Lumen] could not derive room from URL, aborting:", err);
    return;
  }

  injectMarkerStyles();

  const host = document.createElement("div");
  host.id = "lumen-root";
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = overlayCss;
  shadow.appendChild(styleEl);
  const mount = document.createElement("div");
  mount.setAttribute("data-lumen-overlay", "");
  shadow.appendChild(mount);

  createRoot(mount).render(<Overlay url={url} roomId={roomId} canonical={canonical} />);
}

void boot();
