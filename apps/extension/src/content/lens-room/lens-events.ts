import type { Lens, ReactionKind } from "@lumen/schema";

export function appendCreatedLens(current: Lens[], lens: Lens): Lens[] {
  return current.some((item) => item.id === lens.id) ? current : [...current, lens];
}

export function upsertAnchorUpdatedLens(current: Lens[], lens: Lens): Lens[] {
  return current.some((item) => item.id === lens.id)
    ? current.map((item) => (item.id === lens.id ? { ...lens, myReactions: item.myReactions } : item))
    : [...current, lens];
}

export function removeDeletedLens(current: Lens[], lensId: string): Lens[] {
  return current.filter((lens) => lens.id !== lensId);
}

export function applyReactionUpdate(
  current: Lens[],
  lensId: string,
  reactions: Partial<Record<ReactionKind, number>>,
): Lens[] {
  return current.map((lens) => (
    lens.id === lensId ? { ...lens, reactions } : lens
  ));
}

export function applyReactionResult(
  current: Lens[],
  result: {
    lensId: string;
    reactions: Partial<Record<ReactionKind, number>>;
    myReactions: ReactionKind[];
  },
): Lens[] {
  return current.map((lens) => (
    lens.id === result.lensId
      ? { ...lens, reactions: result.reactions, myReactions: result.myReactions }
      : lens
  ));
}
