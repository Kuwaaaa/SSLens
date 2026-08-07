import type { Lens, LensType, ReactionKind } from "@lumen/schema";
import { createAnchor } from "@lumen/anchoring";

import { createLens, reportLens, toggleReaction, updateLensAnchor } from "../../shared/api-proxy";
import { refsFromBody } from "../lens-model";

interface PublishLensInput {
  token: string;
  roomId: string;
  canonical: string;
  range: Range;
  type: LensType;
  body: string;
  tags: string[];
  anonymous: boolean;
}

export async function publishLens(input: PublishLensInput): Promise<void> {
  await createLens(
    {
      roomId: input.roomId,
      url: input.canonical,
      type: input.type,
      body: input.body,
      anchor: createAnchor(input.range),
      tags: input.tags,
      refs: refsFromBody(input.body),
      anonymous: input.anonymous,
    },
    input.token,
  );
}

export async function reanchorLens(
  lensId: string,
  range: Range,
  token: string,
): Promise<Lens> {
  return updateLensAnchor(lensId, createAnchor(range), token);
}

export async function toggleLensReaction(
  lensId: string,
  kind: ReactionKind,
  token: string,
): Promise<{
  lensId: string;
  reactions: Partial<Record<ReactionKind, number>>;
  myReactions: ReactionKind[];
}> {
  return toggleReaction(lensId, kind, token);
}

export async function reportLensById(lensId: string, token: string): Promise<void> {
  await reportLens(lensId, token);
}
