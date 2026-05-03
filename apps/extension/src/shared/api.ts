import type { Lens, LensAnchor, LensType, ReactionKind } from "@lumen/schema";
import { API_BASE } from "./config";

export interface RedeemResult {
  userId: string;
  handle: string;
  token: string;
}

export async function redeem(handle: string, code?: string): Promise<RedeemResult> {
  const res = await fetch(`${API_BASE}/api/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, ...(code?.trim() ? { code: code.trim() } : {}) }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`redeem ${res.status}: ${txt}`);
  }
  return (await res.json()) as RedeemResult;
}

export async function fetchLensesForRoom(roomId: string, token: string): Promise<Lens[]> {
  const res = await fetch(`${API_BASE}/api/lenses?room=${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`fetchLenses ${res.status}`);
  const data = (await res.json()) as { lenses: Lens[] };
  return data.lenses;
}

export interface CreateLensInput {
  roomId: string;
  url: string;
  type: LensType;
  body: string;
  anchor: LensAnchor;
  tags?: string[];
  refs?: unknown[];
  anonymous?: boolean;
}

export async function createLens(input: CreateLensInput, token: string): Promise<Lens> {
  const res = await fetch(`${API_BASE}/api/lenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`createLens ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as { lens: Lens };
  return data.lens;
}

export async function updateLensAnchor(
  lensId: string,
  anchor: LensAnchor,
  token: string,
): Promise<Lens> {
  const res = await fetch(`${API_BASE}/api/lenses/${encodeURIComponent(lensId)}/anchor`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ anchor }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`updateLensAnchor ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as { lens: Lens };
  return data.lens;
}

export interface ReactionResult {
  lensId: string;
  kind: ReactionKind;
  selected: boolean;
  reactions: Partial<Record<ReactionKind, number>>;
  myReactions: ReactionKind[];
}

export async function toggleReaction(
  lensId: string,
  kind: ReactionKind,
  token: string,
): Promise<ReactionResult> {
  const res = await fetch(`${API_BASE}/api/reactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lensId, kind }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`toggleReaction ${res.status}: ${txt}`);
  }
  return (await res.json()) as ReactionResult;
}

export interface ReportResult {
  reportId: string;
  lensId: string;
}

export async function reportLens(lensId: string, token: string): Promise<ReportResult> {
  const res = await fetch(`${API_BASE}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lensId, reason: "user_report" }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`reportLens ${res.status}: ${txt}`);
  }
  return (await res.json()) as ReportResult;
}
