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

import { useCallback, useEffect, useMemo, useState } from "react";
import { type LensType } from "@lumen/schema";

import { clearAllHighlights } from "../marker";
import { BloomLayer } from "../shapes";
import { useBloomRuntime } from "./bloom/useBloomRuntime";
import { useCompanionRoom } from "./companion/useCompanionRoom";
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
} from "./components";
import {
  activeStackForLens,
  lensesForActiveStack,
  openReferencedLensStack,
  preferredLensIdAtPoint,
} from "./lens-room/active-stack";
import { useAnchorRegistry } from "./lens-room/anchor-registry";
import { useLensRoom } from "./lens-room/useLensRoom";
import { buildClusterHeatRects, buildClusterHeatSegments } from "./surface/clusters";
import { scrollRangeIntoView } from "./surface/anchors";
import { useLayoutTick } from "./surface/useLayoutTick";
import { useMarkerClicks } from "./surface/useMarkerClicks";
import { useMarkerHighlights } from "./surface/useMarkerHighlights";
import { usePageSelection } from "./surface/usePageSelection";
import { useRoomEventDispatcher } from "./ws/useRoomEventDispatcher";
import { useWsBridge } from "./ws/useWsBridge";
import { useHiddenRuntimeReset } from "./visibility/useHiddenRuntimeReset";
import type {
  ActiveLensStack,
  SelectionDraft,
} from "./types";
import { useOverlaySettings } from "./settings/useOverlaySettings";

const COMPANION_EMOJI_CHOICES = [
  "\u{1F44B}",
  "\u{1F440}",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F914}",
  "\u{1F4AF}",
] as const;

export function Overlay({ url, roomId, canonical }: { url: string; roomId: string; canonical: string }) {
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
    handleAuthRejected,
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
    active: companionActive,
    emojiBursts,
    chatOpen,
    messages: companionMessages,
    count: companionCount,
    reset: resetCompanion,
    handleBridgeOpen: handleCompanionBridgeOpen,
    handleBridgeClose: handleCompanionBridgeClose,
    handleBeforeBridgeDisconnect: handleBeforeCompanionBridgeDisconnect,
    handleEvent: handleCompanionEvent,
    join: joinCompanion,
    leave: leaveCompanion,
    tossEmoji: tossCompanionEmoji,
    sendChat: sendCompanionChat,
    toggleChat: toggleCompanionChat,
  } = useCompanionRoom();
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
    onAuthRejected: handleAuthRejected,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const layoutTick = useLayoutTick(lumenHidden);
  const { blooms, triggerBloom, removeBloom, resetBlooms } = useBloomRuntime(themeId);
  const bloomRestoredMarker = useCallback((range: Range) => {
    window.setTimeout(() => {
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        triggerBloom(rect, "marker");
      }
    }, 80);
  }, [triggerBloom]);
  const handleDeletedLensEvent = useCallback((lensId: string) => {
    handleLensDeleted(lensId);
    setActiveLens((prev) => prev && (prev.rootId === lensId || prev.clusterIds.includes(lensId) || prev.childIds.includes(lensId))
      ? null
      : prev);
  }, [handleLensDeleted]);
  const handleWsMessage = useRoomEventDispatcher({
    onCompanionEvent: handleCompanionEvent,
    onLensCreated: handleLensCreated,
    onLensAnchorUpdated: handleLensAnchorUpdated,
    onLensDeleted: handleDeletedLensEvent,
    onReactionUpdated: handleReactionUpdated,
    onRestoredMarker: bloomRestoredMarker,
  });
  const wsBridge = useWsBridge({
    token,
    roomId,
    disabled: lumenHidden,
    onOpen: handleCompanionBridgeOpen,
    onClose: handleCompanionBridgeClose,
    onBeforeDisconnect: handleBeforeCompanionBridgeDisconnect,
    onMessage: handleWsMessage,
  });

  const resetOverlayUi = useCallback(() => {
    setPanelOpen(false);
    setActiveLens(null);
    setDraft(null);
    setComposerOpen(false);
    setReanchorTargetId(null);
    setReanchorError(null);
  }, []);
  useHiddenRuntimeReset({
    hidden: lumenHidden,
    resetOverlayUi,
    resetCompanion,
    resetBlooms,
  });

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
    await publishLensDraft(input, draft.range);
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
  const companionConnected = wsBridge.connected;
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

  return (
    <>
      <Orb
        count={visibleLenses.length}
        live={companionConnected}
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
          companionConnected={companionConnected}
          companionEmojiChoices={COMPANION_EMOJI_CHOICES}
          chatOpen={chatOpen}
          companionMessages={companionMessages}
          currentUserId={currentUser?.userId ?? null}
          onModeChange={(mode) => void changeReadingMode(mode)}
          onThemeChange={(theme) => void changeTheme(theme)}
          onClose={() => setPanelOpen(false)}
          onHideTab={hideTab}
          onFindCompanion={() => joinCompanion(wsBridge.send)}
          onLeaveCompanion={() => leaveCompanion(wsBridge.send)}
          onTossCompanionEmoji={(emoji) => tossCompanionEmoji(wsBridge.send, companionConnected, emoji)}
          onToggleChat={toggleCompanionChat}
          onSendCompanionChat={(body) => sendCompanionChat(wsBridge.send, companionConnected, body)}
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

