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

import {
  clearAllClusterHighlights,
  clearAllHighlights,
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
import {
  activeStackForLens,
  lensesForActiveStack,
  openReferencedLensStack,
  preferredLensIdAtPoint,
} from "./content/lens-room/active-stack";
import { useAnchorRegistry } from "./content/lens-room/anchor-registry";
import { useLensRoom } from "./content/lens-room/useLensRoom";
import { buildClusterHeatRects, buildClusterHeatSegments } from "./content/surface/clusters";
import { scrollRangeIntoView } from "./content/surface/anchors";
import { useLayoutTick } from "./content/surface/useLayoutTick";
import { useMarkerClicks } from "./content/surface/useMarkerClicks";
import { useMarkerHighlights } from "./content/surface/useMarkerHighlights";
import { usePageSelection } from "./content/surface/usePageSelection";
import type {
  ActiveLensStack,
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
  const {
    lenses,
    visibleLenses,
    clusterableLenses,
    draftOverlapLenses,
    handleLensCreated,
    handleLensAnchorUpdated,
    handleLensDeleted,
    handleReactionUpdated,
    publish: publishLensDraft,
    reanchor: reanchorLensDraft,
    react: reactToLens,
    report: reportLensById,
  } = useLensRoom({
    token,
    roomId,
    canonical,
    lumenHidden,
    readingMode,
    draft,
    anchorRegistry: {
      orphanIds,
      getRange,
      hasRange,
      clearRanges,
      removeLens,
      restoreLensAnchor,
      restoreLensAnchorWithFallback,
      restoreLensBatch,
    },
    clearAuthState,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [wsRetryTick, setWsRetryTick] = useState(0);
  const [companionActive, setCompanionActive] = useState(false);
  const [companionUsers, setCompanionUsers] = useState<string[]>([]);
  const [emojiBursts, setEmojiBursts] = useState<CompanionEmojiBurst[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [companionMessages, setCompanionMessages] = useState<CompanionChatMessage[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const layoutTick = useLayoutTick(lumenHidden);

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
        const range = handleLensCreated(lens);
        if (range) {
          // Pop a small bloom near the new marker once highlight has rendered.
          window.setTimeout(() => {
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              triggerBloom(r, "marker");
            }
          }, 80);
        }
      } else if (msg.type === "lens_anchor_updated") {
        const lens = msg.lens as Lens;
        handleLensAnchorUpdated(lens);
      } else if (msg.type === "lens_deleted" && typeof msg.lensId === "string") {
        const lensId = msg.lensId;
        handleLensDeleted(lensId);
        setActiveLens((prev) => prev && (prev.rootId === lensId || prev.clusterIds.includes(lensId) || prev.childIds.includes(lensId))
          ? null
          : prev);
      } else if (msg.type === "reaction_updated") {
        const lensId = msg.lensId as string;
        const reactions = msg.reactions as Partial<Record<ReactionKind, number>>;
        handleReactionUpdated(lensId, reactions);
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
    handleLensCreated,
    handleLensAnchorUpdated,
    handleLensDeleted,
    handleReactionUpdated,
    triggerBloom,
  ]);

  const visibleLensIds = useMemo(
    () => new Set(visibleLenses.map((lens) => lens.id)),
    [visibleLenses],
  );

  const clusterHeatSegments = useMemo(
    () => buildClusterHeatSegments(clusterableLenses, visibleLensIds, getRange),
    [clusterableLenses, visibleLensIds, getRange],
  );

  const clusterHeatRects = useMemo(
    () => buildClusterHeatRects(clusterHeatSegments, layoutTick),
    [clusterHeatSegments, layoutTick],
  );

  useMarkerHighlights({
    visibleLenses,
    clusterHeatSegments,
    getRange,
  });
  useEffect(() => {
    if (!token || lumenHidden) return;
    return () => clearAllHighlights();
  }, [token, roomId, lumenHidden]);

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

  const handleSelectionDraft = useCallback((nextDraft: SelectionDraft) => {
    setDraft(nextDraft);
  }, []);
  const clearDraft = useCallback(() => {
    setDraft(null);
  }, []);
  const openMarkerLensIds = useCallback((pointIds: string[]) => {
    const id = preferredLensIdAtPoint(pointIds, lenses, getRange);
    if (id) {
      setActiveLens(activeStackForLens(id, lenses, clusterableLenses, getRange));
      setDraft(null);
    }
  }, [lenses, clusterableLenses, getRange]);
  const clearActiveLens = useCallback(() => {
    setActiveLens(null);
  }, []);

  usePageSelection({
    disabled: lumenHidden,
    onDraft: handleSelectionDraft,
    onClearDraft: clearDraft,
  });
  useMarkerClicks({
    disabled: lumenHidden,
    onMarkerLensIds: openMarkerLensIds,
    onEmptyClick: clearActiveLens,
  });

  async function publish(input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) {
    if (!token || !draft) return;
    try {
      await publishLensDraft(input, draft.range);
    } catch (err) {
      if (err instanceof Error && err.message.includes("createLens 401")) {
        console.warn("[Lumen] token was rejected while creating a Lens; logging out:", err);
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
      await reanchorLensDraft(reanchorTargetId, draft.range);
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

  function jumpToLensAnchor(id: string) {
    const range = getRange(id);
    if (!range) return;
    scrollRangeIntoView(range);
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
