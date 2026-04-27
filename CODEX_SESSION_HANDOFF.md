# Codex Session Handoff

Date: 2026-04-27
Branch: `codex`

## Read First

Before changing code, read `AGENTS.md`, then the core docs listed there. The most important product constraint remains: Lumen v2 is a quiet, card-based UGC layer that makes webpages feel inhabited. Do not add AI-authored visible content, knowledge-graph UI, reputation, or default floating/danmaku UI.

Respond to the user in Chinese unless they switch language. Code and repo docs should stay English.

## Current Working Tree

This session modified:

- `apps/extension/src/content.tsx`
- `apps/extension/src/shared/api.ts`
- `apps/extension/src/styles.css`
- `apps/server/src/index.ts`
- `apps/server/src/routes.ts`
- `packages/schema/src/index.ts`

No commit has been made.

## Features Implemented In This Session

### Composer anonymous toggle

Composer now has a `Post as Anonymous` checkbox. It sends `anonymous` in the create Lens payload. Server support already existed.

### Lens copy ref

Lens cards now expose copy-ref behavior for `[[lens:id]]`. The UI later changed from text button to icon button with custom tooltip.

### Reference card stack

Previous behavior: clicking `[[lens:A]]` reused the anchor-based LensCard position, so if A was offscreen the user had to scroll manually.

Current behavior:

- Marker click opens a root Lens card anchored near the highlighted text.
- Clicking an inline Lens reference expands a `Referenced lens` child panel inside the same card stack.
- Child Lens panels do not use mouse position as their spatial anchor.
- `View anchor` moves that Lens to root and scrolls the page to its original anchor.
- The stack no longer remounts when child refs are added, preventing the "card disappears then reappears" flicker.

Important implementation notes:

- `activeLens` is now a stack shape: `{ rootId, childIds }`.
- `LensCard` receives `lenses`, `rootAnchorRange`, `hasAnchor`, `onJumpToAnchor`, `onLensClick`, and `onReact`.
- `RenderBody` lens ref callback is back to `(lensId) => void`, not `(lensId, rect) => void`.

### Icon actions and tooltips

`View anchor` and `Copy ref` are now icon-only actions.

- Do not use native `title`, because it caused duplicate tooltips.
- Custom tooltip uses `data-tooltip`.
- Tooltip is positioned below the icon to avoid clipping at the top of the card.

### Emoji reactions

A Telegram-like reaction MVP has been implemented.

Backend:

- `POST /api/reactions` toggles a user's reaction for a Lens.
- `GET /api/lenses` now includes:
  - `reactions: Record<string, number>`
  - `myReactions: string[]`
  - placeholder `replyCount: 0`, `saveCount: 0`
- Server broadcasts `reaction_updated` over the room topic with `{ lensId, reactions }`.
- Reaction allowlist lives in `apps/server/src/routes.ts` as `EMOJI_REACTIONS`.

Frontend:

- `toggleReaction()` was added in `apps/extension/src/shared/api.ts`.
- Content script listens for `reaction_updated` and updates local Lens counts.
- Each Lens panel shows existing or self-selected reactions plus a `+` button.
- `+` opens a fixed emoji picker.
- The user manually adjusted picker width so all emoji can be viewed without horizontal scrolling. Preserve that if editing `styles.css`.
- Reaction choices live in `apps/extension/src/content.tsx` as `REACTION_CHOICES`. Keep server and extension lists in sync.

## Known Verification State

The user is manually running builds locally. Do not spend time fighting the Codex shell unless needed.

Codex-side issues observed:

- `bun run build:extension` is blocked because Codex's background Windows PowerShell still reports `CurrentUser Undefined` and effective policy `Restricted`, even after the user set `RemoteSigned` in their own shell.
- Direct `bun.exe` invocation bypasses PowerShell policy but Vite/esbuild child process spawn may hit `EPERM` in the sandbox.
- `tsc -p apps/extension/tsconfig.json --noEmit` is not clean due to existing repo issues:
  - package files outside `rootDir`
  - `LensAuthor` schema missing `handle` while server payload and extension use `author.handle`

Do not interpret those existing typecheck failures as necessarily caused by the current session's feature work.

## Current Product State

Most small P0 items are now done or in progress:

- Done: anonymous toggle
- Done: copy ref
- Done: improved inter-Lens reference UX
- Done: emoji reactions MVP
- Still needed: hide controls
- Still needed: report button stub
- Still needed: privacy policy
- Still needed: orphan re-anchor flow
- Still needed: composer insert-reference picker
- Still needed: companion mode

## Recommended Next Step

Return to the P0 plan and implement hide controls:

1. Per-tab hide in InfoPanel:
   - Hide markers, card stack, composer/create button, and orb for the current tab/session.
   - This should be a local content-script state first.

2. Per-site hide in popup:
   - Store host-level preference in `chrome.storage.local`.
   - Content script should listen for storage changes and hide/show without requiring full extension reload where possible.

After hide controls, do report button stub, then privacy policy, then companion mode.

## Caution For Next Session

- Preserve the card-stack model for references. Do not go back to mouse-position ref previews.
- Preserve icon-only actions for dense Lens panels.
- If editing reaction choices, keep `REACTION_CHOICES` and `EMOJI_REACTIONS` synchronized.
- Avoid adding broad docs unless explicitly asked. This handoff file exists because the user explicitly requested a session archive.
- Do not commit unless the user asks.
