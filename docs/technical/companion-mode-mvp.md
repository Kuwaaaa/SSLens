# Companion Mode MVP

Date: 2026-04-29

This note records the current companion mode implementation after the first usable MVP pass.

## Product Intent

Companion mode is an explicit opt-in layer for "I want company right now" while reading the current page. Solo reading remains the default. Users who never click `Find companion` do not appear in companion presence, do not receive companion chat, and do not see "people are here" UI.

Companion exchanges are intentionally separate from persistent Lens cards:

- Edge emoji tosses are ephemeral WebSocket events.
- Tiny chat messages are ephemeral room events with a short server-memory backlog.
- Nothing from companion mode is written to SQLite.
- If a conversation should persist, a user must create a Lens explicitly.

This keeps Lens cards as the durable social layer and companion mode as a lightweight live layer.

## Current Behavior

### Opt-in Presence

The content script still subscribes to the page room for Lens broadcasts, but visible social presence is companion-only.

Flow:

1. User opens the InfoPanel.
2. User clicks `Find companion`.
3. Client sends `{ type: "companion_join" }` over the existing page WebSocket.
4. Server adds the user to a separate in-memory companion presence map for the subscribed room.
5. Client shows `N here now` only while companion mode is active.
6. `Leave companion`, tab close, hidden Lumen state, or socket close removes the user.

The server tracks per-user connection counts so one user with multiple active tabs is not removed from companion presence until their last companion connection leaves.

### Edge Emoji Toss

While companion mode is active, InfoPanel shows a small fixed emoji set:

```text
👋 👀 😂 🔥 🤔 💯
```

Clicking an emoji sends:

```ts
{ type: "companion_emoji", emoji, edge, y }
```

The server validates the emoji and edge, clamps `y`, then broadcasts:

```ts
{ type: "companion_emoji", userId, emoji, edge, y, at }
```

The extension renders a short edge animation on the left or right side of the viewport. The animation respects `prefers-reduced-motion`.

### Tiny Chat

Tiny chat is a togglable upgrade inside companion mode. It is closed by default. Opening chat puts the InfoPanel into chat focus mode:

- Reading mode, Lens counts, hide controls, current Lens actions, and orphan rows collapse with a soft transition.
- Companion status, emoji toss, `Close chat`, the chat panel, and `Leave companion` remain visible.
- The chat message area expands to take the main panel space and scrolls internally.

Messages are limited to 280 characters. The server trims and broadcasts:

```ts
{ type: "companion_chat", id, userId, handle, body, at }
```

The server also keeps a short in-memory backlog per room:

- latest 30 messages,
- at most 30 minutes old,
- lost on server restart,
- never written to SQLite.

On `companion_join`, the server sends:

```ts
{ type: "companion_chat_history", messages: [...] }
```

The extension merges history and live messages by stable message `id`, so late joins and reconnects do not duplicate visible chat rows.

## Files

Primary implementation:

- `apps/server/src/ws.ts`
- `apps/extension/src/content.tsx`
- `apps/extension/src/styles.css`
- `packages/schema/src/index.ts`

Status docs updated:

- `apps/server/README.md`
- `apps/extension/README.md`

## Protocol Summary

Client to server:

```ts
{ type: "companion_join" }
{ type: "companion_leave" }
{ type: "companion_emoji", emoji, edge: "left" | "right", y }
{ type: "companion_chat", body }
```

Server to client:

```ts
{ type: "companion_presence", users }
{ type: "companion_joined", userId, users }
{ type: "companion_left", userId, users }
{ type: "companion_emoji", userId, emoji, edge, y, at }
{ type: "companion_chat", id, userId, handle, body, at }
{ type: "companion_chat_history", messages }
```

## Verification

Passing after this implementation:

```text
cmd /c node_modules\.bin\tsc -p apps\extension\tsconfig.json --noEmit
cmd /c node_modules\.bin\tsc -p apps\server\tsconfig.json --noEmit
cmd /c bun run build:extension
```

`bun run build:extension` may need to run outside the Codex sandbox because Vite/esbuild can fail with `spawn EPERM` inside the sandbox.

Manual user verification so far:

- Two Chrome windows can communicate through companion mode.

## Manual Test Checklist

Use two Chrome windows on the same allowlisted URL:

1. Before either user clicks `Find companion`, the Orb should not show online-reader count.
2. User A clicks `Find companion`; A sees companion mode active.
3. User B clicks `Find companion`; both windows update `N here now`.
4. A tosses emoji; both windows see edge emoji animation.
5. A opens chat and sends a few messages.
6. B joins after messages exist and receives recent `companion_chat_history`.
7. Opening chat collapses non-chat InfoPanel sections smoothly.
8. Closing chat expands the collapsed sections smoothly.
9. `Leave companion` clears local chat and removes the user from companion presence.
10. Reduced-motion mode disables keyframe animations.

## Watch Items

- The chat focus animation should be checked for jank on smaller laptop viewports.
- The 30-message / 30-minute in-memory backlog is intentionally conservative; tune only after real use.
- Companion presence is still content-script-owned for MVP. Revisit service-worker-hosted WS if cross-tab aggregation becomes important.
- Do not make chat durable without a product review. Durable page memory should remain Lens-shaped.
