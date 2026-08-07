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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Lens, type LensType, type ReactionKind } from "@lumen/schema";

import { logout } from "./shared/storage";
import { fetchLensesForRoom, createLens, reportLens, toggleReaction, updateLensAnchor } from "./shared/api-proxy";
import { buildTextIndex, createAnchor, flatOffsetsToRange, rangeToFlatOffsets } from "@lumen/anchoring";
import {
  applyClusterHighlight,
  applyHighlight,
  clearAllClusterHighlights,
  clearAllHighlights,
  lensIdsAtPoint,
} from "./marker";
import { BloomLayer, makeBloomSpec, type BloomIntent, type BloomSpec } from "./shapes";
import { bootContentRuntime } from "./content/bootstrap";
import { isCompanionChatMessage, mergeCompanionMessages } from "./content/companion-model";
import {
  ClusterHeatOverlay,
  CompanionEmojiLayer,
  Composer as ComposerPanel,
  CreateButton,
  InfoPanel,
  LensCard,
  NoTokenHint,
  Orb,
  ReanchorConfirm,
  RestoreTabButton,
} from "./content/components";
import { mergeLensLists, refsFromBody, shouldShowInMode } from "./content/lens-model";
import {
  activeStackForLens,
  lensesForActiveStack,
  openReferencedLensStack,
  preferredLensIdAtPoint,
  rangesOverlap,
} from "./content/lens-room/active-stack";
import { useAnchorRegistry } from "./content/lens-room/anchor-registry";
import type {
  ActiveLensStack,
  ClusterHeatRect,
  ClusterHeatSegment,
  CompanionChatMessage,
  CompanionEmojiBurst,
  SelectionDraft,
  WsBridgeEvent,
} from "./content/types";
import { useOverlaySettings } from "./content/settings/useOverlaySettings";

const COMPANION_EMOJI_CHOICES = [
  "\u{1F44B}",
  "\u{1F440}",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F914}",
  "\u{1F4AF}",
] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
  const {
    token,
    currentUser,
    readingMode,
    themeId,
    tabHidden,
    settingsReady,
    lumenHidden,
    changeReadingMode,
    changeTheme,
    hideTab,
    restoreTab,
    clearAuthState,
  } = useOverlaySettings({ url, canonical });
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
  const {
    orphanIds,
    getRange,
    hasRange,
    clearRanges,
    removeLens,
    restoreLensAnchor,
    restoreLensAnchorWithFallback,
    restoreLensBatch,
  } = useAnchorRegistry();
  const [activeLens, setActiveLens] = useState<ActiveLensStack | null>(null);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reanchorTargetId, setReanchorTargetId] = useState<string | null>(null);
  const [reanchorBusy, setReanchorBusy] = useState(false);
  const [reanchorError, setReanchorError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsRetryTick, setWsRetryTick] = useState(0);
  const [companionActive, setCompanionActive] = useState(false);
  const [companionUsers, setCompanionUsers] = useState<string[]>([]);
  const [emojiBursts, setEmojiBursts] = useState<CompanionEmojiBurst[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [companionMessages, setCompanionMessages] = useState<CompanionChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const wsRef = useRef<chrome.runtime.Port | null>(null);
  const companionActiveRef = useRef(false);

  // --- Geometric shape blooms ---
  // Small SVG primitives that emerge from behind a card (or beside a new
  // marker). See shapes.tsx + the `lumen-bloom` keyframe in styles.css.
  const [blooms, setBlooms] = useState<Array<{ id: string; spec: BloomSpec }>>([]);
  const triggerBloom = useCallback(
    (rect: DOMRect, intent: BloomIntent) => {
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBlooms((b) => [...b, { id, spec: makeBloomSpec(rect, intent, themeId) }]);
    },
    [themeId],
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

  useEffect(() => {
    companionActiveRef.current = companionActive;
  }, [companionActive]);

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
        restoreLensBatch(ls);
        setLenses((prev) => mergeLensLists(prev, ls));
      })
      .catch(async (err) => {
        if (err instanceof Error && err.message.includes("fetchLenses 401")) {
          console.warn("[Lumen] token was rejected by the server; logging out:", err);
          await logout();
          if (!cancelled) {
            clearAuthState();
          }
          return;
        }
        console.warn("[Lumen] fetchLenses failed:", err);
      });
    return () => {
      cancelled = true;
      clearRanges();
      clearAllHighlights();
    };
  }, [token, roomId, lumenHidden, clearAuthState, clearRanges, restoreLensBatch]);

  // WebSocket
  useEffect(() => {
    if (!token || lumenHidden) return;
    const port = chrome.runtime.connect({ name: "lumen.ws" });
    let disposed = false;
    let reconnectTimer: number | null = null;
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
        if (!hasRange(lens.id)) {
          const range = restoreLensAnchor(lens);
          if (range) {
            // Pop a small bloom near the new marker once highlight has rendered.
            window.setTimeout(() => {
              const r = range.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                triggerBloom(r, "marker");
              }
            }, 80);
          }
        }
        setLenses((prev) => (prev.some((l) => l.id === lens.id) ? prev : [...prev, lens]));
      } else if (msg.type === "lens_anchor_updated") {
        const lens = msg.lens as Lens;
        restoreLensAnchor(lens);
        setLenses((prev) => (
          prev.some((l) => l.id === lens.id)
            ? prev.map((l) => (l.id === lens.id ? { ...lens, myReactions: l.myReactions } : l))
            : [...prev, lens]
        ));
      } else if (msg.type === "lens_deleted" && typeof msg.lensId === "string") {
        const lensId = msg.lensId;
        removeLens(lensId);
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
      if (!disposed) {
        reconnectTimer = window.setTimeout(() => {
          setWsRetryTick((n) => n + 1);
        }, 1000);
      }
    });

    port.postMessage({ namespace: "lumen.ws", type: "connect", token, roomId });

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
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
  }, [
    token,
    roomId,
    lumenHidden,
    wsRetryTick,
    addEmojiBurst,
    addCompanionMessage,
    mergeCompanionHistory,
    hasRange,
    restoreLensAnchor,
    removeLens,
    triggerBloom,
  ]);

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
      const range = getRange(lens.id);
      return range ? rangesOverlap(draft.range, range) : false;
    });
  }, [draft, lenses, orphanIds, getRange]);

  const clusterHeatSegments = useMemo(
    () => buildClusterHeatSegments(clusterableLenses, visibleLensIds),
    [clusterableLenses, visibleLensIds, getRange],
  );

  const clusterHeatRects = useMemo(
    () => buildClusterHeatRects(clusterHeatSegments, layoutTick),
    [clusterHeatSegments, layoutTick],
  );

  // Apply highlights for visible lenses, clear hidden ones
  useEffect(() => {
    clearAllHighlights();
    for (const lens of visibleLenses) {
      const range = getRange(lens.id);
      if (range) applyHighlight(lens.id, range);
    }
    return () => clearAllHighlights();
  }, [visibleLenses, getRange]);

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
      const id = preferredLensIdAtPoint(pointIds, lenses, getRange);
      if (id) {
        setActiveLens(activeStackForLens(id, lenses, clusterableLenses, getRange));
        setDraft(null);
      } else {
        setActiveLens(null);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [lumenHidden, lenses, clusterableLenses, getRange]);

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
        clearAuthState();
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
      restoreLensAnchorWithFallback(lens.id, lens.anchor, draft.range);
      setLenses((prev) => prev.map((l) => (l.id === lens.id ? lens : l)));
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
  if (tabHidden) return <RestoreTabButton onClick={restoreTab} />;
  if (lumenHidden) return null;
  if (!token) return <NoTokenHint />;

  const activeLensStack = activeLens
    ? lensesForActiveStack(activeLens, lenses)
    : [];
  const activeLensRange = activeLens ? getRange(activeLens.rootId) : null;
  const activeLensClusterCount = activeLens ? activeLens.clusterIds.length + 1 : 0;
  const companionCount = companionUsers.length;
  const hiddenCount = lenses.length - visibleLenses.length - orphanIds.size;

  function buildClusterHeatSegments(pool: Lens[], visibleIds: Set<string>): ClusterHeatSegment[] {
    const index = buildTextIndex(document.body);
    const spans = pool
      .map((lens) => {
        const range = getRange(lens.id);
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
    const range = getRange(id);
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
    setActiveLens(activeStackForLens(id, lenses, clusterableLenses, getRange));
  }

  function openReferencedLens(id: string) {
    setActiveLens((current) => openReferencedLensStack(
      current,
      id,
      lenses,
      clusterableLenses,
      getRange,
    ));
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
          theme={themeId}
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
          onThemeChange={(theme) => void changeTheme(theme)}
          onClose={() => setPanelOpen(false)}
          onHideTab={hideTab}
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
        <ComposerPanel
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
          hasAnchor={hasRange}
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

void bootContentRuntime(({ url, roomId, canonical }) => (
  <Overlay key={roomId} url={url} roomId={roomId} canonical={canonical} />
));
