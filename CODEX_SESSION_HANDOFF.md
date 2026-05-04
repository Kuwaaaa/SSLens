# Codex Session Handoff

Date: 2026-05-04
Branch: `codex`

This is a short session handoff, not the project status source of truth. For the
current implementation snapshot, release notes, and project plan, read
`docs/project-status.md`.

## Start Here

1. Read `AGENTS.md`.
2. Read `docs/project-status.md`.
3. Read the area-specific doc before editing that area:
   - Companion: `docs/technical/companion-mode-mvp.md`
   - Lounge: `docs/product/persistent-lounge-design.md`
   - Overlap UX: `docs/technical/overlap-lens-ux-archive.md`

Respond to the user in Chinese unless they switch language. Keep code and repo
docs in English unless asked otherwise. Do not commit unless the user explicitly
asks.

## Current Working Tree

The repo has many uncommitted changes from recent sessions. Treat them as
in-progress work and do not revert unrelated files.

Recent areas to be aware of:

- Release/support docs: `docs/project-status.md`, `docs/index.html`,
  `docs/privacy.html`
- Lounge design: `docs/product/persistent-lounge-design.md`,
  `docs/product/persistent-lounge-design.zh.md`
- Extension release assets: `apps/extension/manifest.json`,
  `apps/extension/public/icons/`
- URL identity: `apps/extension/src/shared/canonicalize.ts`,
  `scripts/canonicalize-url.ts`
- Companion UI/bridge: `apps/extension/src/content.tsx`,
  `apps/extension/src/styles.css`, `apps/extension/src/service-worker.ts`

Git may warn about `C:\Users\l7867/.config/git/ignore` permission. This has not
blocked normal work.

## Recent Decisions

- Runtime page allowlist is removed. The extension supports normal HTTP(S)
  pages; old allowlisted pages are only recommended seed/test pages.
- No-domain/no-SSL beta support works by moving API/WS communication through the
  extension service worker to avoid page-level Mixed Content blocks.
- Production builds must set `VITE_LUMEN_API_BASE`; otherwise the extension
  falls back to `http://localhost:3000`.
- URL room identity uses document canonical candidates, tracking-param cleanup,
  sorted remaining query params, and a small declarative site-rule table.
- Bilibili video handling is one current site rule, not a general invitation to
  add ad hoc per-site hacks.
- Companion emoji toss should render above the panel with `pointer-events: none`.
- Persistent cross-page room design is called Lounge, documented, and not yet
  implemented. It must be explicit join/leave and must not auto-broadcast
  browsing activity.

## Next Likely Work

If the user asks for release work:

- Make release builds harder to accidentally point at localhost.
- Verify Edge zip contents come from inside `apps/extension/dist/`.
- Move server behind HTTPS/WSS when a domain is available.
- Add basic rate limiting and backup notes before wider exposure.

If the user asks for product work:

- Stabilize current page-bound companion first.
- Add a small canonical URL / room ID debug surface or log.
- Add canonicalization tests for common query-heavy URLs.
- Defer Lounge implementation until the current beta is stable in real use.

## Verification Reminders

After code edits:

```bash
cmd /c bunx tsc -p apps/extension/tsconfig.json --noEmit
cmd /c bunx tsc -p apps/server/tsconfig.json --noEmit
```

For extension release build:

```bash
cmd /c bun run build:extension
```

Vite/esbuild can fail in the Codex sandbox with `spawn EPERM`; ask the user to
run the build locally or request escalation if build verification is essential.

Manual checks that catch the recent failure modes:

- Fresh handle-only signup works.
- Lens created by user A appears for user B on the same canonical page.
- Query-heavy URLs for the same content share a room.
- Companion remains opt-in and hidden before activation.
- Companion emoji appears above the panel and does not block clicks.
- HTTPS pages do not show Mixed Content errors.
- Built extension does not point at `localhost:3000`.

## Cautions

- Do not reintroduce page allowlist gating.
- Do not make companion or Lounge chat durable without product review.
- Do not auto-share current URLs to Lounge.
- Do not put Lounge ahead of Lens in the page UI.
- Do not expose server IP in committed config if the user wants to hide
  infrastructure details later.
- Keep `apps/extension/src/shared/canonicalize.ts` and
  `scripts/canonicalize-url.ts` in sync.

