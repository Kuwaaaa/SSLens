export interface SelectionDraft {
  range: Range;
  text: string;
  rect: DOMRect;
}

export interface ActiveLensStack {
  rootId: string;
  clusterIds: string[];
  childIds: string[];
}

export interface CardPosition {
  top: number;
  left: number;
}

export interface ClusterHeatSegment {
  key: string;
  range: Range;
  depth: number;
}

export interface ClusterHeatRect {
  key: string;
  depth: number;
  top: number;
  left: number;
  width: number;
  height: number;
  rotate: number;
  radius: number;
}

export interface CompanionEmojiBurst {
  id: string;
  emoji: string;
  edge: "left" | "right";
  y: number;
}

export interface CompanionChatMessage {
  id: string;
  userId: string;
  handle: string;
  body: string;
  at: number;
}

export type WsBridgeEvent =
  | { namespace: "lumen.ws"; type: "open" }
  | { namespace: "lumen.ws"; type: "close"; code?: number; reason?: string; wasClean?: boolean }
  | { namespace: "lumen.ws"; type: "error"; error?: string }
  | { namespace: "lumen.ws"; type: "message"; data: string };
