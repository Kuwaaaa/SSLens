import type { Lens, LensAnchor, LensType, ReactionKind } from "@lumen/schema";
import type {
  CreateLensInput,
  ReactionResult,
  ReportResult,
} from "./api";

type ApiResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

async function sendApiMessage<T>(message: Record<string, unknown>): Promise<T> {
  const response = await chrome.runtime.sendMessage({
    namespace: "lumen.api",
    ...message,
  }) as ApiResponse<T> | undefined;

  if (!response) throw new Error("extension API bridge did not respond");
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

export async function fetchLensesForRoom(roomId: string, token: string): Promise<Lens[]> {
  return sendApiMessage<Lens[]>({ action: "fetchLensesForRoom", roomId, token });
}

export async function createLens(input: CreateLensInput, token: string): Promise<Lens> {
  return sendApiMessage<Lens>({ action: "createLens", input, token });
}

export async function updateLensAnchor(
  lensId: string,
  anchor: LensAnchor,
  token: string,
): Promise<Lens> {
  return sendApiMessage<Lens>({ action: "updateLensAnchor", lensId, anchor, token });
}

export async function toggleReaction(
  lensId: string,
  kind: ReactionKind,
  token: string,
): Promise<ReactionResult> {
  return sendApiMessage<ReactionResult>({ action: "toggleReaction", lensId, kind, token });
}

export async function reportLens(lensId: string, token: string): Promise<ReportResult> {
  return sendApiMessage<ReportResult>({ action: "reportLens", lensId, token });
}

export type { CreateLensInput };
