# Roadmap Page

Status: now
Progress: 100
Current stage: Local MCP available
Last worked: 2026-07-29

## Resume Point

Continue by configuring `bun run mcp:roadmap` in the MCP client that should
read and update Roadmap.

## Goal

Make the roadmap useful as both a human-readable card board and an agent-aware
project notebook.

## Scope

- Keep `docs/roadmap.html` as the primary overview.
- Keep `docs/roadmap.json` as the local/static source of truth.
- Add feature notes under `docs/features/`.
- Generate `docs/roadmap.md` for fresh-context agents.
- Keep Roadmap out of the lumen cloud server.
- Provide a local-only preview server.
- Provide a local stdio MCP server.

## Out Of Scope

- Full project-management replacement.
- External feedback voting.
- Real-time agent event dashboard in this phase.
- Dedicated stage/update/link CRUD until the local notebook loop is useful.
- lumen server routes, migrations, or cloud runtime for Roadmap.

## Current State

Roadmap has a static HTML view, JSON snapshot, generated agent Markdown,
feature notebook notes, a local-only preview server, and a local stdio MCP
server. It has been removed from the lumen server boundary.

## Next Actions

- Review roadmap wording in the browser.
- Configure `bun run mcp:roadmap` in the MCP client that should read Roadmap.
- Keep lumen deployment free of Roadmap runtime.

## Decisions

- Keep the HTML card board as the center because it is useful for scanning
  multiple feature tracks at once.
- Use Markdown feature notes for deeper handoff and resume context.
- Defer live agent events until the notebook/export loop works.

## Verification

- Parse `docs/roadmap.json`.
- Run the roadmap export script.
- Smoke-test MCP initialize and `tools/list`.
- Verify generated `docs/roadmap.md` exists and includes active features.
- Run `bun run dev:roadmap` for local preview.

## Agent Update Protocol

Update `roadmap-page` at feature-stage boundaries only. Preserve the distinction
between roadmap display, feature notebook memory, and project implementation
truth in `docs/project-status.md`.

## Links

- `docs/roadmap.html`
- `docs/roadmap.json`
- `docs/roadmap.md`
- `docs/features/`
- `docs/technical/agent-roadmap-design.md`
- `docs/technical/roadmap-studio-design.md`
