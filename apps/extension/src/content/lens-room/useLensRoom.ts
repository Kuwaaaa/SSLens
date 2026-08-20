import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lens, LensType, ReactionKind, ReadingMode } from "@lumen/schema";

import { fetchLensesForRoom } from "../../shared/api-proxy";
import type { SelectionDraft } from "../types";
import { mergeLensLists, shouldShowInMode } from "../lens-model";
import { rangesOverlap } from "./active-stack";
import {
  appendCreatedLens,
  applyReactionResult,
  applyReactionUpdate,
  removeDeletedLens,
  upsertAnchorUpdatedLens,
} from "./lens-events";
import {
  publishLens,
  reanchorLens,
  reportLensById as reportLensCommand,
  toggleLensReaction,
} from "./lens-commands";

interface AnchorRegistryApi {
  orphanIds: Set<string>;
  getRange: (lensId: string) => Range | null;
  hasRange: (lensId: string) => boolean;
  clearRanges: () => void;
  removeLens: (lensId: string) => void;
  restoreLensAnchor: (lens: Lens) => Range | null;
  restoreLensAnchorWithFallback: (lensId: string, anchor: Lens["anchor"], fallbackRange: Range) => Range;
  restoreLensBatch: (lenses: Lens[]) => Set<string>;
}

interface UseLensRoomInput {
  token: string | null;
  roomId: string;
  canonical: string;
  lumenHidden: boolean;
  readingMode: ReadingMode;
  draft: SelectionDraft | null;
  anchorRegistry: AnchorRegistryApi;
  onAuthRejected: () => void | Promise<void>;
}

interface PublishInput {
  type: LensType;
  body: string;
  tags: string[];
  anonymous: boolean;
}

export function useLensRoom({
  token,
  roomId,
  canonical,
  lumenHidden,
  readingMode,
  draft,
  anchorRegistry,
  onAuthRejected,
}: UseLensRoomInput) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const {
    orphanIds,
    getRange,
    hasRange,
    clearRanges,
    removeLens,
    restoreLensAnchor,
    restoreLensAnchorWithFallback,
    restoreLensBatch,
  } = anchorRegistry;

  useEffect(() => {
    if (!token || lumenHidden) return;
    let cancelled = false;
    fetchLensesForRoom(roomId, token)
      .then((nextLenses) => {
        if (cancelled) return;
        restoreLensBatch(nextLenses);
        setLenses((prev) => mergeLensLists(prev, nextLenses));
      })
      .catch(async (err) => {
        if (err instanceof Error && err.message.includes("fetchLenses 401")) {
          console.warn("[lumen] token was rejected by the server; logging out:", err);
          if (!cancelled) {
            await onAuthRejected();
          }
          return;
        }
        console.warn("[lumen] fetchLenses failed:", err);
      });
    return () => {
      cancelled = true;
      clearRanges();
    };
  }, [token, roomId, lumenHidden, onAuthRejected, clearRanges, restoreLensBatch]);

  const visibleLenses = useMemo(
    () => lumenHidden ? [] : lenses.filter((lens) => !orphanIds.has(lens.id) && shouldShowInMode(lens, readingMode)),
    [lenses, lumenHidden, orphanIds, readingMode],
  );

  const clusterableLenses = useMemo(
    () => lumenHidden ? [] : lenses.filter((lens) => !orphanIds.has(lens.id)),
    [lenses, lumenHidden, orphanIds],
  );

  const draftOverlapLenses = useMemo(() => {
    if (!draft) return [];
    return lenses.filter((lens) => {
      if (orphanIds.has(lens.id)) return false;
      const range = getRange(lens.id);
      return range ? rangesOverlap(draft.range, range) : false;
    });
  }, [draft, lenses, orphanIds, getRange]);

  const handleLensCreated = useCallback((lens: Lens): Range | null => {
    let restoredRange: Range | null = null;
    if (!hasRange(lens.id)) {
      restoredRange = restoreLensAnchor(lens);
    }
    setLenses((prev) => appendCreatedLens(prev, lens));
    return restoredRange;
  }, [hasRange, restoreLensAnchor]);

  const handleLensAnchorUpdated = useCallback((lens: Lens) => {
    restoreLensAnchor(lens);
    setLenses((prev) => upsertAnchorUpdatedLens(prev, lens));
  }, [restoreLensAnchor]);

  const handleLensDeleted = useCallback((lensId: string) => {
    removeLens(lensId);
    setLenses((prev) => removeDeletedLens(prev, lensId));
  }, [removeLens]);

  const handleReactionUpdated = useCallback((
    lensId: string,
    reactions: Partial<Record<ReactionKind, number>>,
  ) => {
    setLenses((prev) => applyReactionUpdate(prev, lensId, reactions));
  }, []);

  const publish = useCallback(async (input: PublishInput, range: Range) => {
    if (!token) return;
    try {
      await publishLens({
        token,
        roomId,
        canonical,
        range,
        type: input.type,
        body: input.body,
        tags: input.tags,
        anonymous: input.anonymous,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes("createLens 401")) {
        await onAuthRejected();
      }
      throw err;
    }
  }, [token, roomId, canonical, onAuthRejected]);

  const reanchor = useCallback(async (lensId: string, range: Range): Promise<Lens | null> => {
    if (!token) return null;
    const lens = await reanchorLens(lensId, range, token);
    restoreLensAnchorWithFallback(lens.id, lens.anchor, range);
    setLenses((prev) => prev.map((item) => (item.id === lens.id ? lens : item)));
    return lens;
  }, [token, restoreLensAnchorWithFallback]);

  const react = useCallback(async (id: string, kind: ReactionKind) => {
    if (!token) return;
    const result = await toggleLensReaction(id, kind, token);
    setLenses((prev) => applyReactionResult(prev, result));
  }, [token]);

  const report = useCallback(async (id: string) => {
    if (!token) return;
    await reportLensCommand(id, token);
  }, [token]);

  return {
    lenses,
    visibleLenses,
    clusterableLenses,
    draftOverlapLenses,
    handleLensCreated,
    handleLensAnchorUpdated,
    handleLensDeleted,
    handleReactionUpdated,
    publish,
    reanchor,
    react,
    report,
  };
}
