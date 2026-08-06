# Lumen Roadmap Studio Design

Date: 2026-07-27
Status: local-first P0 implementation plan

This document describes the larger Roadmap system direction. The roadmap should
not remain only a static HTML page. It should become a lightweight product
operations surface for public communication, internal maintenance, and agent
progress feedback.

For the reusable, cross-project product direction, read
`docs/technical/agent-roadmap-design.md`.

## 1. Goal

Roadmap should answer three different needs:

```text
Public Roadmap
  A readable public view for beta users, contributors, and friends of the
  project.

Local Operator Studio
  A local-only management surface for feature, stage, update, link, priority,
  and status maintenance.

Agent Feedback Workflow
  A stable file-based workflow that implementation agents use at feature-stage
  boundaries.
```

Roadmap is not Jira. It should stay small, product-shaped, and easy to read.

## 2. Source Of Truth And Service Boundary

Roadmap is intentionally not part of the Lumen cloud service. Lumen may run on a
VPS, but the roadmap is a local/project-management notebook and should not add
cloud runtime, database, authentication, or maintenance load to Lumen.

Current P0 source of truth:

```text
docs/roadmap.json
```

Generated and presentation artifacts:

- `docs/roadmap.html` for human card-board viewing,
- `docs/roadmap.md` for fresh-context agents,
- `docs/features/*.md` for deeper feature resume notes.

The current flow is:

```text
docs/roadmap.json -> docs/roadmap.html
                  -> scripts/export-roadmap.ts -> docs/roadmap.md
                  -> docs/features/*.md
```

`bun run dev:roadmap` starts a local-only preview server. It may expose a local
`/api/roadmap` compatibility endpoint for the HTML page, but this endpoint is
not part of the Lumen server and should not be deployed with Lumen.

## 3. Data Model

P0 JSON feature fields:

```text
feature.id
feature.title
feature.status
feature.phase
feature.progress
feature.currentStage
feature.summary
feature.why
feature.notePath
feature.resumePoint
feature.nextActions
feature.lastWorkedAt
feature.scope
feature.outOfScope
feature.stages[]
feature.updates[]
feature.links[]
feature.updatedAt
```

SQLite may return later, but only as a separate local roadmap service or
standalone tool. It should not share Lumen's server process or production
database.

## 4. Local Tooling Plan

Current:

```text
bun run dev:roadmap
bun scripts/export-roadmap.ts
bun run mcp:roadmap
```

`bun run mcp:roadmap` starts a local stdio MCP server. It reads and writes
`docs/roadmap.json`, regenerates `docs/roadmap.md` after write tools, and does
not bind a network port.

Local-only future:

```text
GET    /api/roadmap
GET    /api/roadmap/agent
PATCH  /api/roadmap/features/:id
POST   /api/roadmap/features/:id/updates
```

These routes are for a local roadmap server only. Do not add them to
`apps/server`.

Current MCP resources:

```text
roadmap://roadmap
roadmap://roadmap/agent
roadmap://features/{id}
roadmap://features/{id}/agent-brief
```

Current MCP tools:

```text
list_features
get_feature
append_update
set_stage_status
update_feature
export_agent_markdown
```

## 5. UI Plan

P0 public page:

- show lanes by status,
- show feature progress,
- show stage timeline,
- show recent updates,
- link related docs,
- fetch `./roadmap.json` for static viewing,
- optionally fetch local `/api/roadmap` only when served by `dev:roadmap`.

P1 operator page:

- create feature,
- edit feature fields,
- edit stage list,
- append update,
- edit links,
- archive/delete feature,
- export `docs/roadmap.json`.

Keep the operator page functional before making it polished.

## 6. Agent Feedback Contract

Agents should update roadmap at feature-stage boundaries:

- stage starts,
- stage completes,
- stage is blocked,
- stage is cut,
- shipped state changes.

Agents should not update roadmap for every small code edit.

For theme switching, the `theme-system` feature entry is the canonical place to
report progress. For Roadmap Studio itself, the `roadmap-page` feature entry is
used to verify that the roadmap can describe its own development.

### 6.1 Agent Operating Procedure

When an implementation agent needs to inspect or update roadmap:

1. Read `AGENTS.md`.
2. Read `docs/project-status.md` for current implementation truth.
3. Read this document for Roadmap Studio behavior.
4. Identify the feature entry by `id` before changing anything.
5. Read current roadmap from `docs/roadmap.json`.
6. Update only at a feature-stage boundary.
7. Update only the feature entry relevant to the current work unless the user
   explicitly asks for roadmap structure changes.
8. Verify the roadmap shape after editing.

Stage-boundary updates usually modify:

- `status`,
- `progress`,
- `currentStage`,
- `resumePoint`,
- `nextActions`,
- `lastWorkedAt`,
- `notePath`,
- `stages`,
- `updates`,
- `updatedAt`.

Do not update roadmap for:

- every small CSS/code edit,
- speculative ideas that have not become accepted roadmap entries,
- deferred features unless the user explicitly reopens them,
- implementation verification details that belong in `docs/project-status.md`.

### 6.2 Current P0 Write Paths

The source of truth is `docs/roadmap.json`.

Use this order:

```text
Edit docs/roadmap.json directly.
Keep the edit scoped to the relevant feature entry.
Update feature notes in docs/features/ when resume context changes.

Run scripts/export-roadmap.ts to regenerate docs/roadmap.md.
Use bun run dev:roadmap for local preview.
```

### 6.3 Verification For Agents

After roadmap updates:

- parse `docs/roadmap.json` when the snapshot was touched,
- run `bun scripts/export-roadmap.ts`,
- optionally verify MCP startup with `bun run mcp:roadmap` through an MCP
  client,
- optionally preview with `bun run dev:roadmap`,
- keep `docs/roadmap.html` compatible with static JSON,
- note any skipped verification in the final response.

Once `docs/roadmap.md` exists, treat it as a generated agent-readable artifact.
Do not edit it by hand unless it is explicitly promoted to a manual source
document.

## 7. Implementation Order

1. Add Roadmap Studio plan document.
2. Add generated `docs/roadmap.md`.
3. Add feature notes under `docs/features/`.
4. Add local `bun run dev:roadmap` preview server.
5. Remove Roadmap from the Lumen server and production SQLite schema.
6. Add a local operator studio page.
7. Add dedicated local stage/update/link edit flows.

## 8. Guardrails

- Roadmap must not add runtime load to the Lumen VPS.
- Do not add Roadmap routes, tables, auth, or scheduled jobs to `apps/server`.
- Roadmap does not replace `docs/project-status.md`.
- `docs/project-status.md` remains the current implementation source of truth
  for assistants and maintainers.
- Roadmap entries should be product-readable and should include out-of-scope
  boundaries.
- Atlas, Lounge, reputation, AI-authored Lens, and default danmaku must stay
  visibly deferred unless the v2 product center changes through review.
