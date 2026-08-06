import {
  assertFeatureStatus,
  assertStageStatus,
  exportRoadmapMarkdown,
  findFeature,
  readRoadmap,
  readRoadmapMarkdown,
  todayIsoDate,
  writeRoadmap,
  type RoadmapDocument,
  type RoadmapFeature,
} from "./roadmap-data.ts";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();
let buffer: Uint8Array = new Uint8Array(0);
let responseFraming: "content-length" | "ndjson" = "ndjson";

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.byteLength + right.byteLength);
  out.set(left);
  out.set(right, left.byteLength);
  return out;
}

function indexOfHeaderEnd(bytes: Uint8Array): number {
  for (let index = 0; index <= bytes.byteLength - 4; index += 1) {
    if (
      bytes[index] === 13
      && bytes[index + 1] === 10
      && bytes[index + 2] === 13
      && bytes[index + 3] === 10
    ) {
      return index;
    }
  }
  return -1;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object" && !Array.isArray(input);
}

function text(input: unknown, field: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error(`${field} required`);
  return input.trim();
}

function optionalText(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function textArray(input: unknown): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new Error("expected string array");
  return input.map((item) => text(item, "array item"));
}

function jsonText(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function plainText(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function writeMessage(message: unknown): void {
  const body = JSON.stringify(message);
  if (responseFraming === "ndjson") {
    process.stdout.write(`${body}\n`);
    return;
  }

  const bytes = encoder.encode(body);
  process.stdout.write(`Content-Length: ${bytes.byteLength}\r\n\r\n${body}`);
}

function respond(id: JsonRpcRequest["id"], result: unknown): void {
  if (id === undefined) return;
  writeMessage({ jsonrpc: "2.0", id, result });
}

function fail(id: JsonRpcRequest["id"], error: unknown): void {
  if (id === undefined) return;
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32603,
      message: error instanceof Error ? error.message : "internal error",
    },
  });
}

function summarizeFeature(feature: RoadmapFeature): Record<string, unknown> {
  return {
    id: feature.id,
    title: feature.title,
    status: feature.status,
    phase: feature.phase,
    progress: feature.progress,
    currentStage: feature.currentStage,
    resumePoint: feature.resumePoint,
    nextActions: feature.nextActions,
    lastWorkedAt: feature.lastWorkedAt,
    updatedAt: feature.updatedAt,
  };
}

function agentBrief(feature: RoadmapFeature): string {
  return `# ${feature.title}

Feature ID: ${feature.id}
Status: ${feature.status}
Phase: ${feature.phase ?? "Unphased"}
Progress: ${feature.progress ?? 0}
Current stage: ${feature.currentStage ?? "Not started"}
Last worked: ${feature.lastWorkedAt ?? "Unknown"}

## Resume Point

${feature.resumePoint ?? "None recorded."}

## Next Actions

${(feature.nextActions ?? ["None listed."]).map((item) => `- ${item}`).join("\n")}

## Scope

${(feature.scope ?? ["None listed."]).map((item) => `- ${item}`).join("\n")}

## Out Of Scope

${(feature.outOfScope ?? ["None listed."]).map((item) => `- ${item}`).join("\n")}
`;
}

function saveAndExport(roadmap: RoadmapDocument): void {
  writeRoadmap(roadmap);
  exportRoadmapMarkdown(roadmap);
}

function listFeatures(params: unknown): ToolResult {
  const roadmap = readRoadmap();
  const status = isRecord(params) ? optionalText(params.status) : undefined;
  const features = status
    ? roadmap.features.filter((feature) => feature.status === status)
    : roadmap.features;
  return jsonText({
    updatedAt: roadmap.updatedAt,
    features: features.map(summarizeFeature),
  });
}

function getFeature(params: unknown): ToolResult {
  if (!isRecord(params)) throw new Error("params object required");
  const roadmap = readRoadmap();
  return jsonText(findFeature(roadmap, text(params.featureId, "featureId")));
}

function appendUpdate(params: unknown): ToolResult {
  if (!isRecord(params)) throw new Error("params object required");
  const roadmap = readRoadmap();
  const feature = findFeature(roadmap, text(params.featureId, "featureId"));
  const update = {
    date: optionalText(params.date) ?? todayIsoDate(),
    kind: optionalText(params.kind) ?? "update",
    text: text(params.text, "text"),
  };
  feature.updates = [...(feature.updates ?? []), update];
  feature.lastWorkedAt = update.date;
  feature.updatedAt = update.date;
  saveAndExport(roadmap);
  return jsonText({ featureId: feature.id, update });
}

function setStageStatus(params: unknown): ToolResult {
  if (!isRecord(params)) throw new Error("params object required");
  const roadmap = readRoadmap();
  const feature = findFeature(roadmap, text(params.featureId, "featureId"));
  const stageId = text(params.stageId, "stageId");
  const status = text(params.status, "status");
  assertStageStatus(status);

  const updatedAt = optionalText(params.updatedAt) ?? todayIsoDate();
  const stages = feature.stages ?? [];
  const existing = stages.find((stage) => stage.id === stageId);
  if (existing) {
    existing.status = status;
    existing.updatedAt = updatedAt;
    if (params.title !== undefined) existing.title = text(params.title, "title");
  } else {
    stages.push({
      id: stageId,
      title: text(params.title, "title"),
      status,
      updatedAt,
    });
  }

  feature.stages = stages;
  feature.lastWorkedAt = updatedAt;
  feature.updatedAt = updatedAt;
  if (status === "now") {
    feature.currentStage = existing?.title ?? text(params.title, "title");
  }
  saveAndExport(roadmap);
  return jsonText({ featureId: feature.id, stageId, status, updatedAt });
}

function updateFeature(params: unknown): ToolResult {
  if (!isRecord(params) || !isRecord(params.patch)) throw new Error("featureId and patch required");
  const roadmap = readRoadmap();
  const feature = findFeature(roadmap, text(params.featureId, "featureId"));
  const patch = params.patch;

  if (patch.status !== undefined) {
    const status = text(patch.status, "status");
    assertFeatureStatus(status);
    feature.status = status;
  }
  if (patch.title !== undefined) feature.title = text(patch.title, "title");
  if (patch.phase !== undefined) feature.phase = text(patch.phase, "phase");
  if (patch.progress !== undefined) {
    if (typeof patch.progress !== "number") throw new Error("progress must be a number");
    feature.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  }
  if (patch.currentStage !== undefined) feature.currentStage = text(patch.currentStage, "currentStage");
  if (patch.summary !== undefined) feature.summary = text(patch.summary, "summary");
  if (patch.why !== undefined) feature.why = text(patch.why, "why");
  if (patch.notePath !== undefined) feature.notePath = text(patch.notePath, "notePath");
  if (patch.resumePoint !== undefined) feature.resumePoint = text(patch.resumePoint, "resumePoint");
  if (patch.nextActions !== undefined) feature.nextActions = textArray(patch.nextActions);
  if (patch.scope !== undefined) feature.scope = textArray(patch.scope);
  if (patch.outOfScope !== undefined) feature.outOfScope = textArray(patch.outOfScope);

  const updatedAt = optionalText(patch.updatedAt) ?? todayIsoDate();
  feature.lastWorkedAt = optionalText(patch.lastWorkedAt) ?? updatedAt;
  feature.updatedAt = updatedAt;
  saveAndExport(roadmap);
  return jsonText(feature);
}

function exportAgentMarkdown(): ToolResult {
  exportRoadmapMarkdown(readRoadmap());
  return plainText("Wrote docs/roadmap.md");
}

const tools = [
  {
    name: "list_features",
    description: "List roadmap features, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_feature",
    description: "Read one roadmap feature by id.",
    inputSchema: {
      type: "object",
      properties: { featureId: { type: "string" } },
      required: ["featureId"],
      additionalProperties: false,
    },
  },
  {
    name: "append_update",
    description: "Append a dated update to one feature and regenerate docs/roadmap.md.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string" },
        kind: { type: "string" },
        text: { type: "string" },
        date: { type: "string" },
      },
      required: ["featureId", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "set_stage_status",
    description: "Set or create a feature stage status and regenerate docs/roadmap.md.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string" },
        stageId: { type: "string" },
        title: { type: "string" },
        status: { type: "string" },
        updatedAt: { type: "string" },
      },
      required: ["featureId", "stageId", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "update_feature",
    description: "Patch safe top-level roadmap feature fields and regenerate docs/roadmap.md.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string" },
        patch: { type: "object" },
      },
      required: ["featureId", "patch"],
      additionalProperties: false,
    },
  },
  {
    name: "export_agent_markdown",
    description: "Regenerate docs/roadmap.md from docs/roadmap.json.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function callTool(name: string, args: unknown): ToolResult {
  if (name === "list_features") return listFeatures(args);
  if (name === "get_feature") return getFeature(args);
  if (name === "append_update") return appendUpdate(args);
  if (name === "set_stage_status") return setStageStatus(args);
  if (name === "update_feature") return updateFeature(args);
  if (name === "export_agent_markdown") return exportAgentMarkdown();
  throw new Error(`unknown tool: ${name}`);
}

function resourcesList() {
  const roadmap = readRoadmap();
  return {
    resources: [
      {
        uri: "roadmap://roadmap",
        name: "Roadmap JSON",
        mimeType: "application/json",
      },
      {
        uri: "roadmap://roadmap/agent",
        name: "Agent Roadmap Markdown",
        mimeType: "text/markdown",
      },
      ...roadmap.features.map((feature) => ({
        uri: `roadmap://features/${feature.id}`,
        name: feature.title,
        mimeType: "application/json",
      })),
      ...roadmap.features.map((feature) => ({
        uri: `roadmap://features/${feature.id}/agent-brief`,
        name: `${feature.title} Agent Brief`,
        mimeType: "text/markdown",
      })),
    ],
  };
}

function resourceRead(uri: string) {
  const roadmap = readRoadmap();
  if (uri === "roadmap://roadmap") {
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(roadmap, null, 2) }] };
  }
  if (uri === "roadmap://roadmap/agent") {
    return { contents: [{ uri, mimeType: "text/markdown", text: readRoadmapMarkdown() }] };
  }

  const featureMatch = uri.match(/^roadmap:\/\/features\/([^/]+)(\/agent-brief)?$/);
  if (!featureMatch) throw new Error(`unknown resource: ${uri}`);
  const feature = findFeature(roadmap, featureMatch[1]);
  if (featureMatch[2]) {
    return { contents: [{ uri, mimeType: "text/markdown", text: agentBrief(feature) }] };
  }
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(feature, null, 2) }] };
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  try {
    if (request.method === "initialize") {
      respond(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: { resources: {}, tools: {} },
        serverInfo: { name: "lumen-roadmap", version: "0.1.0" },
      });
      return;
    }
    if (request.method === "notifications/initialized") return;
    if (request.method === "tools/list") {
      respond(request.id, { tools });
      return;
    }
    if (request.method === "tools/call") {
      if (!isRecord(request.params)) throw new Error("params object required");
      respond(request.id, callTool(text(request.params.name, "name"), request.params.arguments ?? {}));
      return;
    }
    if (request.method === "resources/list") {
      respond(request.id, resourcesList());
      return;
    }
    if (request.method === "resources/read") {
      if (!isRecord(request.params)) throw new Error("params object required");
      respond(request.id, resourceRead(text(request.params.uri, "uri")));
      return;
    }
    respond(request.id, {});
  } catch (err) {
    fail(request.id, err);
  }
}

function parseContentLengthMessages(messages: JsonRpcRequest[]): boolean {
  const headerEnd = indexOfHeaderEnd(buffer);
  if (headerEnd === -1) return false;

  const header = decoder.decode(buffer.slice(0, headerEnd));
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) throw new Error("missing Content-Length header");

  const length = Number(match[1]);
  const bodyStart = headerEnd + 4;
  if (buffer.byteLength < bodyStart + length) return false;

  const body = decoder.decode(buffer.slice(bodyStart, bodyStart + length));
  buffer = buffer.slice(bodyStart + length);
  responseFraming = "content-length";
  messages.push(JSON.parse(body) as JsonRpcRequest);
  return true;
}

function parseNdjsonMessage(messages: JsonRpcRequest[]): boolean {
  const lineEnd = buffer.indexOf(10);
  if (lineEnd === -1) return false;

  const lineBytes = buffer.slice(0, lineEnd);
  buffer = buffer.slice(lineEnd + 1);
  const line = decoder.decode(lineBytes).trim();
  if (!line) return true;

  responseFraming = "ndjson";
  messages.push(JSON.parse(line) as JsonRpcRequest);
  return true;
}

function readMessages(): JsonRpcRequest[] {
  const messages: JsonRpcRequest[] = [];
  while (true) {
    if (buffer.length === 0) return messages;

    const prefix = decoder.decode(buffer.slice(0, Math.min(buffer.byteLength, 15)));
    const parsed = prefix.toLowerCase().startsWith("content-length:")
      ? parseContentLengthMessages(messages)
      : parseNdjsonMessage(messages);

    if (!parsed) return messages;
  }
}

const reader = Bun.stdin.stream().getReader();
while (true) {
  const chunk = await reader.read();
  if (chunk.done) break;
  buffer = appendBytes(buffer, chunk.value);
  for (const message of readMessages()) {
    await handleRequest(message);
  }
}
