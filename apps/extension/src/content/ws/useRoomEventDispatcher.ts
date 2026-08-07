import { useCallback } from "react";
import type { Lens, ReactionKind } from "@lumen/schema";

import type { WsRoomEvent } from "./useWsBridge";

interface RoomEventHandlers {
  onCompanionEvent: (event: WsRoomEvent) => void;
  onLensCreated: (lens: Lens) => Range | null;
  onLensAnchorUpdated: (lens: Lens) => void;
  onLensDeleted: (lensId: string) => void;
  onReactionUpdated: (lensId: string, reactions: Partial<Record<ReactionKind, number>>) => void;
  onRestoredMarker: (range: Range) => void;
}

export function dispatchRoomEvent(message: WsRoomEvent, handlers: RoomEventHandlers): void {
  if (message.type === "subscribed") {
    return;
  }
  if (message.type.startsWith("companion_")) {
    handlers.onCompanionEvent(message);
    return;
  }
  if (message.type === "lens_created") {
    const range = handlers.onLensCreated(message.lens as Lens);
    if (range) handlers.onRestoredMarker(range);
    return;
  }
  if (message.type === "lens_anchor_updated") {
    handlers.onLensAnchorUpdated(message.lens as Lens);
    return;
  }
  if (message.type === "lens_deleted" && typeof message.lensId === "string") {
    handlers.onLensDeleted(message.lensId);
    return;
  }
  if (message.type === "reaction_updated" && typeof message.lensId === "string") {
    handlers.onReactionUpdated(
      message.lensId,
      message.reactions as Partial<Record<ReactionKind, number>>,
    );
  }
}

export function useRoomEventDispatcher({
  onCompanionEvent,
  onLensCreated,
  onLensAnchorUpdated,
  onLensDeleted,
  onReactionUpdated,
  onRestoredMarker,
}: RoomEventHandlers) {
  return useCallback((message: WsRoomEvent) => {
    dispatchRoomEvent(message, {
      onCompanionEvent,
      onLensCreated,
      onLensAnchorUpdated,
      onLensDeleted,
      onReactionUpdated,
      onRestoredMarker,
    });
  }, [
    onCompanionEvent,
    onLensCreated,
    onLensAnchorUpdated,
    onLensDeleted,
    onReactionUpdated,
    onRestoredMarker,
  ]);
}
