# Beta Stabilization

Status: now
Progress: 62
Current stage: Dogfood and verification
Last worked: 2026-05-06

## Resume Point

Continue with manual smoke testing and backup/observability review before
inviting more beta users.

## Goal

Keep the current page-bound Lens loop stable enough for small-cohort beta use.

## Scope

- Production API-base build guard.
- Canonicalization tests for query-heavy URLs.
- Companion mode retests after service-worker or WebSocket changes.
- Operator report queue review.
- Manual dogfooding of long Lens reading.
- Local/server data backup before broader use.

## Out Of Scope

- Durable companion or Lounge history.
- Atlas UI.
- Public reputation systems.
- Default floating danmaku.

## Current State

The implementation is in pre-release beta stabilization. Current status lives in
`docs/project-status.md`.

## Next Actions

- Run focused automated tests.
- Run manual smoke checklist from `docs/project-status.md`.
- Review open reports.
- Decide backup/observability minimum for broader beta use.

## Decisions

- Solo reading remains default.
- Companion mode remains opt-in.
- Lens cards are the durable unit.

## Verification

- `cmd /c bun run typecheck`
- `cmd /c bun run test`
- `cmd /c bun run build:extension`
- Manual smoke checklist in `docs/project-status.md`

## Agent Update Protocol

Use `docs/project-status.md` as implementation truth. Update this feature only
when beta stabilization status changes materially.

## Links

- `docs/project-status.md`
- `apps/extension/README.md`
- `apps/server/README.md`
