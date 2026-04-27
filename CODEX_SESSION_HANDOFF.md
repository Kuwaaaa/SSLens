# Codex Session Handoff

Date: 2026-04-27
Branch: `codex`
Last committed baseline: `6c88195 Stabilize Lens interactions and reactions`

## Read First

Before changing code, read `AGENTS.md`, then the core docs listed there. The product constraint remains: Lumen v2 is a quiet, card-based UGC layer that makes webpages feel inhabited. Do not add AI-authored visible content, knowledge-graph UI, reputation, or default floating/danmaku UI.

Respond to the user in Chinese unless they switch language. Code and repo docs should stay English.

## Current Working Tree

This handoff describes the uncommitted work after `6c88195`.

Modified files:

- `apps/extension/README.md`
- `apps/extension/src/content.tsx`
- `apps/extension/src/popup.css`
- `apps/extension/src/popup.tsx`
- `apps/extension/src/shared/api.ts`
- `apps/extension/src/shared/storage.ts`
- `apps/extension/src/styles.css`
- `apps/server/README.md`
- `apps/server/public/index.html`
- `apps/server/src/db.ts`
- `apps/server/src/index.ts`
- `apps/server/src/routes.ts`

New file:

- `apps/server/public/privacy.html`

No commit has been made for these changes yet.

## Implemented In This Uncommitted Work

### Hide controls

Per-tab hide:

- InfoPanel has `Hide on this tab`.
- This is local content-script state, not persisted.
- It hides markers, card stack, composer/create button, orb/panel, presence, WS state, and blooms.
- Because the popup cannot see tab-local state, tab hide now leaves a small `Show Lumen` restore pill in the page bottom-right.

Per-site hide:

- Popup has `Hide on <host>` checkbox.
- Stored in `chrome.storage.local` under `lumen.hiddenSites`.
- `normalizeHost()` strips `www.` and lowercases hosts.
- Content script listens to storage changes and hides/shows without full extension reload.

Important caveat:

- If the user says "popup says it is not hidden but page is blank", check tab-level hide first and look for the `Show Lumen` pill.

### Report button stub

Backend:

- `reports` table added in `apps/server/src/db.ts`.
- `POST /api/reports` added in `apps/server/src/routes.ts`.
- Request body: `{ lensId, reason? }`.
- Response: `{ reportId, lensId }`.
- Server verifies the Lens exists and records reporter id, Lens id, reason, timestamp.
- No moderation dashboard, automation, notification, or broadcast yet.

Frontend:

- `reportLens()` added in `apps/extension/src/shared/api.ts`.
- Report is no longer a top-level LensCard action. The user pushed back on tool-like card chrome.
- Current UX: InfoPanel shows a `Current lens` section when a Lens is open, with `Copy reference` and `Report`.

### LensCard interaction cleanup

The user strongly preferred reducing tool UI on cards. Current decisions:

- LensCard has no `X` close button.
- LensCard has no `...` menu.
- LensCard has no right-click menu.
- Clicking blank page area closes the active card.
- `Escape` closes the active card.
- `View anchor` only appears on child/reference cards (`depth > 0 && hasAnchor`), not on the root card.
- `Copy reference` and `Report` live in InfoPanel's `Current lens` section.

Important bug fixed:

- A `useEffect` for Escape handling was accidentally placed after early returns (`settingsReady`, `tabHidden`, `lumenHidden`, `token`).
- That changed React hook order between renders and made the whole overlay disappear.
- The fix was to move the hook before all early returns. If the overlay disappears again, first check for hooks after early returns in `Overlay`.

### Privacy policy

Added `apps/server/public/privacy.html` and served it from:

- `GET /privacy`

Added links:

- Admin console subtitle links to `/privacy`.
- Popup shows `Privacy` link before and after login.

Policy intentionally stays short and beta-focused. It covers:

- Stored Lens data.
- URL canonicalization and room ids.
- Anonymous Lens caveat: anonymous to other users, not to server operator.
- Reports.
- Operator access.
- Data retention.
- Removal/privacy questions through beta group channel.

## Verification State

Passing after the latest changes:

- `cmd /c node_modules\.bin\tsc -p apps\extension\tsconfig.json --noEmit`
- `cmd /c node_modules\.bin\tsc -p apps\server\tsconfig.json --noEmit`
- `cmd /c bun run build:extension`

Note:

- `bun run build:extension` may need escalation in Codex because Vite/esbuild child process spawn can hit sandbox `EPERM`.
- Git still prints warnings about being unable to access `C:\Users\l7867/.config/git/ignore`; this has not affected commits.

## Current Product State

Done or effectively done:

- Invite redemption and token flow.
- Lens creation and realtime broadcast.
- Anchoring and CSS Highlight markers.
- Reading modes.
- Anonymous composer toggle.
- Inter-Lens refs and card stack.
- Copy reference via InfoPanel current Lens actions.
- Emoji reactions MVP.
- Hide controls: per-tab and per-site.
- Report stub.
- Privacy policy.

Still needed:

- Orphan re-anchor flow.
- Composer insert-reference picker.
- Companion mode.
- Manual UX pass on the latest LensCard/InfoPanel behavior.

## Recommended Next Step

First, ask the user to test the latest overlay fix if they have not already:

- Refresh a whitelisted page.
- Confirm orb/markers return.
- Confirm tab hide shows the `Show Lumen` restore pill.
- Confirm clicking blank page closes LensCard.
- Confirm InfoPanel's `Current lens` actions appear when a Lens is open.

Then implement orphan re-anchor MVP:

1. Add a `PATCH /api/lenses/:id/anchor` or `PATCH /api/lenses` endpoint guarded by author/operator rules as appropriate for beta.
2. In InfoPanel orphan rows, add a low-key `Re-anchor` action.
3. User selects text, confirms re-anchor, client creates a new anchor and patches the Lens.
4. On success, remove Lens id from `orphanIds`, restore range, and apply highlight.

Keep it simple. Do not build a full review workflow yet.

## Cautions For Next Session

- Do not put `useEffect`, `useMemo`, `useState`, or other hooks after early returns in React components.
- Preserve the card-stack model for references. Do not return to mouse-position ref previews.
- Keep LensCard as content-first. Avoid reintroducing visible tool chrome (`X`, `...`, top-level copy/report).
- `Copy reference` and `Report` are intentionally in InfoPanel, not on the card.
- If editing reactions, `REACTION_KINDS` is shared from `@lumen/schema`; do not duplicate lists in server/extension.
- Avoid broad docs unless the user asks. This handoff exists because the user explicitly requested session archival.
- Do not commit unless the user asks.
