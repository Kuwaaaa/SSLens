# Codex Session Handoff

Date: 2026-05-06

This is a temporary session note, not the project status source of truth. For
current implementation state, verification, and near-term planning, read
`docs/project-status.md`. For assistant rules and reading routes, read
`AGENTS.md`.

## Current Focus

The user is reorganizing documentation responsibilities:

- `AGENTS.md` should be the AI entry and document router.
- `docs/project-status.md` should be the current implementation snapshot.
- `CODEX_SESSION_HANDOFF.md` should stay short and temporary.
- Deployment drafts are intentionally archived and should not be folded into the
  main plan right now.

Additional current discussion:

- The user is exploring PDF/ebook Lens support, PDF first.
- `docs/product/lens-design.md` now includes a "Lens On Ebooks And PDFs"
  section covering PDF identity, target/anchor shape, room model, PDF.js reader
  direction, and deferred OCR/EPUB/graph work.
- `apps/extension/README.md` now includes an architecture watch note for
  extracting `src/content.tsx` boundaries before adding PDF/ebook/video or
  non-extension surfaces.
- Key implementation direction: do not branch PDF behavior throughout
  `content.tsx`; introduce a surface adapter so webpage Lens can keep using DOM
  `Range` while PDF Lens uses page rectangles and text offsets.

## Current Working Tree Notes

Recent in-progress areas include:

- Lens Markdown rendering and long Lens preview/expand behavior.
- Ecosystem roadmap and Lens reading design docs.
- PDF/ebook Lens product design notes.
- Extension content runtime boundary notes for future refactor.
- Documentation responsibility cleanup.
- Archived VPS deployment drafts under
  `deploy/_archive/2026-05-lumen-vps-draft/`.

Treat unrelated dirty files as user/session work. Do not revert them unless the
user explicitly asks.

## Reminders

- Respond to the user in Chinese unless they switch language.
- Keep code and repo docs in English unless asked otherwise.
- Do not commit unless the user explicitly asks.
- Do not revive deployment docs into the main documentation plan unless the user
  asks to revisit deployment.
- If a task touches an area-specific doc, read that doc before editing code.

## Verification

After code edits:

```bash
cmd /c bunx tsc -p apps/extension/tsconfig.json --noEmit
cmd /c bunx tsc -p apps/server/tsconfig.json --noEmit
```

For extension release builds:

```bash
cmd /c bun run build:extension
```

Vite/esbuild may fail inside the Codex sandbox with `spawn EPERM`; ask the user
to run it locally or request escalation only when build verification is needed.
