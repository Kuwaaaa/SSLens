import type { CompanionChatMessage } from "./types";

export function isCompanionChatMessage(input: unknown): input is CompanionChatMessage {
  if (!input || typeof input !== "object") return false;
  const message = input as Partial<CompanionChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.userId === "string" &&
    typeof message.handle === "string" &&
    typeof message.body === "string" &&
    typeof message.at === "number"
  );
}

export function mergeCompanionMessages(
  current: CompanionChatMessage[],
  incoming: CompanionChatMessage[],
): CompanionChatMessage[] {
  const byId = new Map<string, CompanionChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-40);
}
