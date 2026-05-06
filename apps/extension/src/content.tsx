// Content script entry. Injected into normal HTTP(S) pages by the manifest.
//
// Responsibilities:
//   - render existing Lens as CSS Highlight markers (filtered by reading mode)
//   - capture user text selection -> show "Create Lens" button -> composer
//   - bridge live room events through the extension service worker
//   - mount React overlay inside Shadow DOM so page CSS doesn't leak in
//   - track anchor recovery; surface orphan Lens through info panel
//
// The service worker owns the real WebSocket so HTTPS pages do not directly
// connect to an insecure ws:// backend during the no-domain beta.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { REACTION_KINDS, type Lens, type LensType, type ReactionKind, type ReadingMode } from "@lumen/schema";

import { canonicalizeUrl, canonicalUrlFromDocument, roomIdFor } from "./shared/canonicalize";
import {
  getReadingMode,
  getSiteHidden,
  getToken,
  getUser,
  KEY_HIDDEN_SITES,
  KEY_READING_MODE,
  KEY_TOKEN,
  KEY_USER,
  logout,
  normalizeHost,
  setReadingMode as saveReadingMode,
  type StoredUser,
} from "./shared/storage";
import { fetchLensesForRoom, createLens, reportLens, toggleReaction, updateLensAnchor } from "./shared/api-proxy";
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
const READING_MODES: ReadingMode[] = ["quiet", "thinking", "full"];
const LONG_LENS_PREVIEW_CHARS = 520;

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

interface CompanionEmojiBurst {
  id: string;
  emoji: string;
  edge: "left" | "right";
  y: number;
}

interface CompanionChatMessage {
  id: string;
  userId: string;
  handle: string;
  body: string;
  at: number;
}

type WsBridgeEvent =
  | { namespace: "lumen.ws"; type: "open" }
  | { namespace: "lumen.ws"; type: "close"; code?: number; reason?: string; wasClean?: boolean }
  | { namespace: "lumen.ws"; type: "error"; error?: string }
  | { namespace: "lumen.ws"; type: "message"; data: string };

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 280;
const DEFAULT_CLUSTER_SIBLINGS = 2;
const VIEWPORT_GUTTER = 8;
const COMPANION_EMOJI_CHOICES = [
  "\u{1F44B}",
  "\u{1F440}",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F914}",
  "\u{1F4AF}",
] as const;

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
  // quiet: keep the page sparse, but do show Quick Lens because Quick is
  // the default creation mode for v2's small-group UGC loop.
  return ["quick", "knowledge", "challenge"].includes(lens.type);
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

function isCompanionChatMessage(input: unknown): input is CompanionChatMessage {
  if (!input || typeof input !== "object") return false;
  const message = input as Partial<CompanionChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.userId === "string" &&
    typeof message.handle === "string" &&
    typeof message.body === "string" &&
    typeof message.at === "number"
  );
}

function mergeCompanionMessages(
  current: CompanionChatMessage[],
  incoming: CompanionChatMessage[],
): CompanionChatMessage[] {
  const byId = new Map<string, CompanionChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-40);
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
  const [activeLens, setActiveLens] = useState<ActiveLensStack | null>(null);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reanchorTargetId, setReanchorTargetId] = useState<string | null>(null);
  const [reanchorBusy, setReanchorBusy] = useState(false);
  const [reanchorError, setReanchorError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("quiet");
  const [siteHidden, setSiteHiddenState] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [companionActive, setCompanionActive] = useState(false);
  const [companionUsers, setCompanionUsers] = useState<string[]>([]);
  const [emojiBursts, setEmojiBursts] = useState<CompanionEmojiBurst[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [companionMessages, setCompanionMessages] = useState<CompanionChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const anchorRanges = useRef<Map<string, Range>>(new Map());
  const wsRef = useRef<chrome.runtime.Port | null>(null);
  const companionActiveRef = useRef(false);

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
  const addEmojiBurst = useCallback((input: Omit<CompanionEmojiBurst, "id">) => {
    const id = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setEmojiBursts((bursts) => [
      ...bursts.slice(-10),
      {
        ...input,
        id,
        y: clamp(input.y, 0.12, 0.88),
      },
    ]);
    window.setTimeout(() => {
      setEmojiBursts((bursts) => bursts.filter((burst) => burst.id !== id));
    }, 1250);
  }, []);
  const addCompanionMessage = useCallback((message: CompanionChatMessage) => {
    setCompanionMessages((messages) => mergeCompanionMessages(messages, [message]));
  }, []);
  const mergeCompanionHistory = useCallback((messages: CompanionChatMessage[]) => {
    setCompanionMessages((current) => mergeCompanionMessages(current, messages));
  }, []);

  const lumenHidden = siteHidden || tabHidden;

  useEffect(() => {
    companionActiveRef.current = companionActive;
  }, [companionActive]);

  // Load token + reading mode + site visibility.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getToken(), getUser(), getReadingMode(), getSiteHidden(siteHost)])
      .then(([nextToken, nextUser, nextMode, hidden]) => {
        if (cancelled) return;
        setToken(nextToken);
        setCurrentUser(nextUser);
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
      const tokenChange = changes[KEY_TOKEN];
      if (tokenChange) setToken((tokenChange.newValue as string | undefined) ?? null);
      const userChange = changes[KEY_USER];
      if (userChange) setCurrentUser((userChange.newValue as StoredUser | undefined) ?? null);
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
    setWsConnected(false);
    setCompanionActive(false);
    setCompanionUsers([]);
    setEmojiBursts([]);
    setChatOpen(false);
    setCompanionMessages([]);
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
      .catch(async (err) => {
        if (err instanceof Error && err.message.includes("fetchLenses 401")) {
          console.warn("[Lumen] token was rejected by the server; logging out:", err);
          await logout();
          if (!cancelled) {
            setToken(null);
            setCurrentUser(null);
          }
          return;
        }
        console.warn("[Lumen] fetchLenses failed:", err);
      });
    return () => {
      cancelled = true;
      anchorRanges.current.clear();
      clearAllHighlights();
    };
  }, [token, roomId, lumenHidden]);

  // WebSocket
  useEffect(() => {
    if (!token || lumenHidden) return;
    const port = chrome.runtime.connect({ name: "lumen.ws" });
    wsRef.current = port;

    port.onMessage.addListener((event: WsBridgeEvent) => {
      if (!event || event.namespace !== "lumen.ws") return;
      if (event.type === "open") {
        setWsConnected(true);
        if (companionActiveRef.current) {
          port.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_join" } });
        }
        return;
      }
      if (event.type === "error") {
        console.warn(
          "[Lumen] WebSocket bridge failed. If HTTP API requests work, check token validity, extension service worker logs, and reverse-proxy Upgrade headers.",
          event.error ?? "",
        );
        return;
      }
      if (event.type === "close") {
        if (event.code !== 1000) {
          console.warn("[Lumen] WebSocket closed:", {
            code: event.code,
            reason: event.reason || "(no reason)",
            wasClean: event.wasClean,
          });
        }
        setWsConnected(false);
        setCompanionUsers([]);
        return;
      }
      if (event.type !== "message") return;
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "subscribed") {
        return;
      } else if (msg.type === "companion_presence") {
        setCompanionUsers((msg.users as string[] | undefined) ?? []);
      } else if (msg.type === "companion_joined") {
        const users = msg.users as string[] | undefined;
        if (users) setCompanionUsers(users);
        else setCompanionUsers((p) => [...new Set([...p, msg.userId as string])]);
      } else if (msg.type === "companion_left") {
        const users = msg.users as string[] | undefined;
        if (users) setCompanionUsers(users);
        else setCompanionUsers((p) => p.filter((u) => u !== (msg.userId as string)));
      } else if (msg.type === "companion_emoji") {
        if (!companionActiveRef.current) return;
        const emoji = typeof msg.emoji === "string" ? msg.emoji : null;
        const edge = msg.edge === "left" || msg.edge === "right" ? msg.edge : null;
        const y = typeof msg.y === "number" ? msg.y : 0.5;
        if (emoji && edge) addEmojiBurst({ emoji, edge, y });
      } else if (msg.type === "companion_chat_history") {
        if (!companionActiveRef.current) return;
        const messages = Array.isArray(msg.messages)
          ? msg.messages.filter(isCompanionChatMessage)
          : [];
        mergeCompanionHistory(messages);
      } else if (msg.type === "companion_chat") {
        if (!companionActiveRef.current) return;
        const id = typeof msg.id === "string" ? msg.id : null;
        const userId = typeof msg.userId === "string" ? msg.userId : "unknown";
        const handle = typeof msg.handle === "string" ? msg.handle : "unknown";
        const body = typeof msg.body === "string" ? msg.body : "";
        const at = typeof msg.at === "number" ? msg.at : Date.now();
        if (id && body.trim()) addCompanionMessage({ id, userId, handle, body, at });
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
      } else if (msg.type === "lens_deleted" && typeof msg.lensId === "string") {
        const lensId = msg.lensId;
        anchorRanges.current.delete(lensId);
        setOrphanIds((s) => {
          if (!s.has(lensId)) return s;
          const next = new Set(s);
          next.delete(lensId);
          return next;
        });
        setLenses((prev) => prev.filter((l) => l.id !== lensId));
        setActiveLens((prev) => prev && (prev.rootId === lensId || prev.clusterIds.includes(lensId) || prev.childIds.includes(lensId))
          ? null
          : prev);
      } else if (msg.type === "reaction_updated") {
        const lensId = msg.lensId as string;
        const reactions = msg.reactions as Partial<Record<ReactionKind, number>>;
        setLenses((prev) => prev.map((l) => (
          l.id === lensId ? { ...l, reactions } : l
        )));
      }
    });

    port.onDisconnect.addListener(() => {
      setWsConnected(false);
      setCompanionUsers([]);
    });

    port.postMessage({ namespace: "lumen.ws", type: "connect", token, roomId });

    return () => {
      if (companionActiveRef.current) {
        try {
          port.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_leave" } });
        } catch {
          // Socket is already gone; server close handling clears presence.
        }
      }
      try {
        port.postMessage({ namespace: "lumen.ws", type: "disconnect" });
        port.disconnect();
      } catch {
        // The extension worker may already be gone during tab teardown.
      }
      if (wsRef.current === port) wsRef.current = null;
      setWsConnected(false);
    };
  }, [token, roomId, lumenHidden, addEmojiBurst, addCompanionMessage, mergeCompanionHistory]);

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
    try {
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
    } catch (err) {
      if (err instanceof Error && err.message.includes("createLens 401")) {
        console.warn("[Lumen] token was rejected while creating a Lens; logging out:", err);
        await logout();
        setToken(null);
        setCurrentUser(null);
      }
      throw err;
    }
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
  const companionCount = companionUsers.length;
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

  function findCompanion() {
    setCompanionActive(true);
    try {
      wsRef.current?.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_join" } });
    } catch {
      // The bridge will join on the next open event while companionActive is true.
    }
  }

  function leaveCompanionMode() {
    setCompanionActive(false);
    setCompanionUsers([]);
    setEmojiBursts([]);
    setChatOpen(false);
    setCompanionMessages([]);
    try {
      wsRef.current?.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_leave" } });
    } catch {
      // Socket close handling on the server also clears companion presence.
    }
  }

  function tossCompanionEmoji(emoji: string) {
    if (!companionActive || !wsConnected) return;
    const edge = Math.random() > 0.5 ? "right" : "left";
    const y = 0.18 + Math.random() * 0.64;
    wsRef.current?.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_emoji", emoji, edge, y } });
  }

  function sendCompanionChat(body: string) {
    if (!companionActive || !wsConnected) return;
    const trimmed = body.trim().slice(0, 280);
    if (!trimmed) return;
    wsRef.current?.postMessage({ namespace: "lumen.ws", type: "send", payload: { type: "companion_chat", body: trimmed } });
  }

  async function changeReadingMode(mode: ReadingMode) {
    await saveReadingMode(mode);
    setReadingMode(mode);
  }

  return (
    <>
      <Orb
        count={visibleLenses.length}
        live={wsConnected}
        companionActive={companionActive}
        companionCount={companionCount}
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
          canonical={canonical}
          roomId={roomId}
          reanchorTargetId={reanchorTargetId}
          companionActive={companionActive}
          companionCount={companionCount}
          companionConnected={wsConnected}
          companionEmojiChoices={COMPANION_EMOJI_CHOICES}
          chatOpen={chatOpen}
          companionMessages={companionMessages}
          currentUserId={currentUser?.userId ?? null}
          onModeChange={(mode) => void changeReadingMode(mode)}
          onClose={() => setPanelOpen(false)}
          onHideTab={() => setTabHidden(true)}
          onFindCompanion={findCompanion}
          onLeaveCompanion={leaveCompanionMode}
          onTossCompanionEmoji={tossCompanionEmoji}
          onToggleChat={() => setChatOpen((open) => !open)}
          onSendCompanionChat={sendCompanionChat}
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
      <CompanionEmojiLayer bursts={emojiBursts} />
    </>
  );
}

function Orb({
  count,
  live,
  companionActive,
  companionCount,
  extraCount = 0,
  onToggle,
}: {
  count: number;
  live: boolean;
  companionActive: boolean;
  companionCount: number;
  extraCount?: number;
  onToggle: () => void;
}) {
  return (
    <button className="orb" onClick={onToggle}>
      <span className={`dot ${live ? "" : "idle"}`} />
      <span>{count} lens</span>
      {companionActive && (
        <span className="orb-meta">{companionCount > 0 ? `Companion ${companionCount}` : "Companion"}</span>
      )}
      {extraCount > 0 && <span className="orb-badge">+{extraCount}</span>}
    </button>
  );
}

function CompanionEmojiLayer({ bursts }: { bursts: CompanionEmojiBurst[] }) {
  if (bursts.length === 0) return null;
  return (
    <div className="companion-emoji-layer" data-lumen-overlay="" aria-hidden="true">
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className={`companion-emoji-burst ${burst.edge}`}
          style={{ top: `${burst.y * 100}%` }}
        >
          {burst.emoji}
        </span>
      ))}
    </div>
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
  canonical,
  roomId,
  reanchorTargetId,
  companionActive,
  companionCount,
  companionConnected,
  companionEmojiChoices,
  chatOpen,
  companionMessages,
  currentUserId,
  onModeChange,
  onClose,
  onHideTab,
  onFindCompanion,
  onLeaveCompanion,
  onTossCompanionEmoji,
  onToggleChat,
  onSendCompanionChat,
  onReport,
  onReanchor,
  onCancelReanchor,
}: {
  mode: ReadingMode;
  visible: number;
  hidden: number;
  orphanLenses: Lens[];
  currentLens: Lens | null;
  canonical: string;
  roomId: string;
  reanchorTargetId: string | null;
  companionActive: boolean;
  companionCount: number;
  companionConnected: boolean;
  companionEmojiChoices: readonly string[];
  chatOpen: boolean;
  companionMessages: CompanionChatMessage[];
  currentUserId: string | null;
  onModeChange: (mode: ReadingMode) => void;
  onClose: () => void;
  onHideTab: () => void;
  onFindCompanion: () => void;
  onLeaveCompanion: () => void;
  onTossCompanionEmoji: (emoji: string) => void;
  onToggleChat: () => void;
  onSendCompanionChat: (body: string) => void;
  onReport: (id: string) => void | Promise<void>;
  onReanchor: (id: string) => void;
  onCancelReanchor: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [reportState, setReportState] = useState<"idle" | "reported" | "failed">("idle");
  const [debugOpen, setDebugOpen] = useState(false);
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
  const chatFocused = companionActive && chatOpen;

  return (
    <section className={`info-panel ${chatFocused ? "chat-focus" : ""}`} data-lumen-overlay="">
      <div className="ip-header">
        <div>
          <strong>Lumen</strong>
          <div className="ip-header-meta">{visible} visible</div>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {chatFocused && (
        <div className="ip-chat-summary">
          <span>{mode}</span>
          <span>{visible} visible</span>
          <span>{companionConnected ? "Companion live" : "Companion offline"}</span>
        </div>
      )}

      <div className={`ip-section ip-control-section ${chatFocused ? "soft-collapsed" : ""}`}>
        <div className="ip-section-head">
          <span className="ip-label">Reading mode</span>
          <span className="pill">{mode}</span>
        </div>
        <div className="ip-mode-switch" role="group" aria-label="Reading mode">
          {READING_MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={`ip-section ip-lens-status ${chatFocused ? "soft-collapsed" : ""}`}>
        <div className="ip-section-head">
          <span className="ip-label">Page lens</span>
          <button className="ip-link-action" onClick={onHideTab}>Hide this tab</button>
        </div>
        <div className="ip-stat-grid">
          <div className="ip-stat">
            <strong>{visible}</strong>
            <span>visible</span>
          </div>
          <div className="ip-stat">
            <strong>{hidden}</strong>
            <span>filtered</span>
          </div>
          <div className="ip-stat">
            <strong>{orphanLenses.length}</strong>
            <span>orphan</span>
          </div>
        </div>
        {hidden > 0 && <div className="ip-hint">{hidden} hidden by {mode} mode.</div>}
        {orphanLenses.length > 0 && <div className="ip-hint">{orphanLenses.length} Lens lost their anchor.</div>}
      </div>

      <div className="ip-section companion-dock">
        <div className="ip-section-head">
          <span className="ip-label">Companion</span>
          {companionActive && (
            <span className={`pill ${companionConnected ? "" : "muted"}`}>
              {companionConnected ? "live" : "offline"}
            </span>
          )}
        </div>
        {companionActive ? (
          <>
            <div className="ip-row">
              <span>{companionCount <= 1 ? "Only you here now" : `${companionCount} here now`}</span>
              <button className="ip-link-action" onClick={onLeaveCompanion}>Leave</button>
            </div>
            <div className="companion-toss-row" aria-label="Toss emoji">
              {companionEmojiChoices.map((emoji) => (
                <button
                  key={emoji}
                  className="companion-emoji-button"
                  onClick={() => onTossCompanionEmoji(emoji)}
                  disabled={!companionConnected}
                  aria-label="Toss emoji"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button className="ip-action companion-chat-toggle" onClick={onToggleChat} aria-expanded={chatOpen}>
              {chatOpen ? "Hide tiny chat" : companionMessages.length > 0 ? `Open tiny chat (${companionMessages.length})` : "Open tiny chat"}
            </button>
            <CompanionChat
              open={chatOpen}
              messages={companionMessages}
              currentUserId={currentUserId}
              disabled={!companionConnected || !chatOpen}
              onSend={onSendCompanionChat}
            />
          </>
        ) : (
          <>
            <div className="ip-hint">Opt in for live presence, emoji toss, and tiny chat on this page.</div>
            <button className="ip-action companion" onClick={onFindCompanion} disabled={!companionConnected}>
              {companionConnected ? "Find companion" : "Connecting..."}
            </button>
          </>
        )}
      </div>

      {currentLens && (
        <div className={`ip-section ${chatFocused ? "soft-collapsed" : ""}`}>
            <div className="ip-section-head">
              <span className="ip-label">Current lens</span>
            </div>
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
        <div className={`ip-section ${chatFocused ? "soft-collapsed" : ""}`}>
            <div className="ip-section-head">
              <span className="ip-label">Orphan lens</span>
            </div>
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

      <div className={`ip-section ip-debug-section ${chatFocused ? "soft-collapsed" : ""}`}>
        <button className="ip-debug-toggle" onClick={() => setDebugOpen((open) => !open)} aria-expanded={debugOpen}>
          Room debug
        </button>
        {debugOpen && (
          <div className="ip-debug-body">
            <div>
              <span>canonical</span>
              <code title={canonical}>{canonical}</code>
            </div>
            <div>
              <span>room</span>
              <code title={roomId}>{roomId}</code>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CompanionChat({
  open,
  messages,
  currentUserId,
  disabled,
  onSend,
}: {
  open: boolean;
  messages: CompanionChatMessage[];
  currentUserId: string | null;
  disabled: boolean;
  onSend: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!open || !trimmed || disabled) return;
    onSend(trimmed);
    setBody("");
  }

  return (
    <div className={`companion-chat ${open ? "expanded" : "collapsed"}`} aria-hidden={!open}>
      <div ref={listRef} className="companion-chat-messages">
        {messages.length === 0 ? (
          <div className="companion-chat-empty">Tiny chat starts here.</div>
        ) : messages.map((message) => {
          const mine = currentUserId !== null && message.userId === currentUserId;
          return (
            <div key={message.id} className={`companion-chat-message ${mine ? "mine" : ""}`}>
              <div className="companion-chat-meta">{mine ? "You" : `@${message.handle}`}</div>
              <div className="companion-chat-body">{message.body}</div>
            </div>
          );
        })}
      </div>
      <form className="companion-chat-form" onSubmit={submit}>
        <input
          value={body}
          onChange={(e) => setBody(e.currentTarget.value.slice(0, 280))}
          placeholder={disabled ? "Reconnecting..." : "Say something small"}
          disabled={disabled}
          maxLength={280}
        />
        <button disabled={disabled || !body.trim()}>Send</button>
      </form>
    </div>
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
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const isLongBody = lens.body.length > LONG_LENS_PREVIEW_CHARS || lens.body.split(/\r?\n/).length > 10;

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
      <div className={`body ${isLongBody ? "long" : ""} ${bodyExpanded ? "expanded" : ""}`}>
        <div className="body-scroll">
          <RenderBody body={lens.body} knownLenses={knownLenses} onLensClick={onLensClick} />
        </div>
        {isLongBody && !bodyExpanded && <div className="body-fade" aria-hidden="true" />}
      </div>
      {isLongBody && (
        <button className="body-read-more" onClick={() => setBodyExpanded((v) => !v)}>
          {bodyExpanded ? "Show less" : "Read more"}
        </button>
      )}
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
    const documentCanonical = canonicalUrlFromDocument();
    canonical = canonicalizeUrl(url, documentCanonical);
    roomId = await roomIdFor(url, documentCanonical);
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
