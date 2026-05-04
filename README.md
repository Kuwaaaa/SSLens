# Lumen Lens

Browser extension + backend for contextual social commenting on real webpages.

Read `AGENTS.md` first if you are an AI assistant, then read
`docs/project-status.md` for the current implementation and release state. Read
`docs/PROJECT_OVERVIEW.md` first if you are a human.

## Setup

```bash
bun install
bun run keygen                    # generate Ed25519 keys -> data/keys.json
bun run dev:server                # start backend on :3000
bun run issue-invite -- --by founder   # mint an invite code
```

## Workspaces

- `apps/server/` — Bun + ws + SQLite backend
- `apps/extension/` — MV3 browser extension (TBD)
- `packages/schema/` — shared TypeScript types
- `scripts/` — CLI tools and shared utilities

## Docs

- `AGENTS.md` - onboarding for AI assistants (also `AGENTS.zh.md`)
- `docs/project-status.md` - current beta status, release notes, and next plan
- `docs/PROJECT_OVERVIEW.md` — what v2 is and why
- `docs/ARCHITECTURE.md` — every technical decision
- `docs/mvp/lumen-mvp-plan.md` — 5-week build + 4-week soak plan
- `docs/Chat.md` — original conception (Chinese)
