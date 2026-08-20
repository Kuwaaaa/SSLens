# lumen

Browser extension and backend for contextual social Lens cards on real webpages.

## Start Here

- AI assistants: read `AGENTS.md` first.
- Humans: read `docs/PROJECT_OVERVIEW.md` for the product shape.
- Current implementation status: read `docs/project-status.md`.

Deployment drafts are currently archived and are not part of the main project
plan.

## Local Setup

```bash
bun install
bun run keygen
bun run dev:server
bun run dev:extension
bun run dev:roadmap
bun run mcp:roadmap
```

## Workspaces

- `apps/server/` - Bun + SQLite + WebSocket backend.
- `apps/extension/` - MV3 browser extension.
- `packages/schema/` - shared TypeScript types.
- `packages/anchoring/` - text anchoring implementation.
- `scripts/` - CLI tools and shared utilities.

## Main Docs

- `AGENTS.md` - AI assistant rules and document routing.
- `docs/project-status.md` - current implementation snapshot and near-term plan.
- `docs/roadmap.html` + `docs/roadmap.json` - public feature roadmap and
  stage-level progress source.
- `docs/roadmap.md` + `docs/features/` - generated agent-readable roadmap and
  per-feature resume notes.
- `bun run mcp:roadmap` - local-only stdio MCP server for roadmap resources and
  feature-stage update tools.
- `docs/technical/agent-roadmap-design.md` - reusable Agent Roadmap product and
  architecture direction.
- `docs/technical/roadmap-studio-design.md` - Roadmap Studio architecture and
  API plan.
- `docs/PROJECT_OVERVIEW.md` - stable product overview.
- `docs/ARCHITECTURE.md` - stable technical architecture and rationale.
- `docs/Chat.md` - original Chinese conception.
