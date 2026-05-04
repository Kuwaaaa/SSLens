# Persistent Lounge Product Design

Date: 2026-05-04
Status: Draft v0.1

## 1. Why This Exists

Current companion mode is page-bound: a user opts into live presence on the current webpage, then leaves when the page changes or the tab closes. This is the right default for Lumen because the product center is still the webpage and its accumulated Lens layer.

However, there is a second social need that page companion does not cover:

> I want to stay with this small group while we wander across the web.

This is not the same as page companion. It is a persistent room, provisionally called **Lounge**. A Lounge lets a small group remain connected across page changes, while Lens cards remain attached to webpages.

The product risk is real: if Lounge becomes too strong, Lumen turns into a generic chat app and the page/Lens layer becomes secondary. The design must make Lounge supportive, not central.

## 2. Product Boundary

Lumen has three social layers, ordered by importance:

1. **Lens layer**: durable, page-bound, contextual, user-created cards. This is the product center.
2. **Page companion**: ephemeral, page-bound, opt-in live presence for people reading the same page right now.
3. **Lounge**: ephemeral or lightly retained, user-chosen persistent room for a small group across pages.

Lounge should never replace Lens as the durable memory of a page. If a conversation produces something worth keeping, the user should turn it into a Lens deliberately.

## 3. Core Principles

### 3.1 Lens Remains Primary

The main surface on a webpage is still the Lens layer. Lounge should not become the first thing a user sees, the biggest thing on the screen, or the default mode of using Lumen.

### 3.2 Explicit Entry

Users do not auto-join a Lounge. They enter by selecting or typing a room code, accepting an invite link, or choosing a recent Lounge. No user should appear in a persistent room by merely browsing.

### 3.3 No Automatic Browsing Broadcast

Lounge must not automatically broadcast every page a user visits. A user may manually share the current page to the Lounge, but the product should not feel like surveillance.

### 3.4 Lightweight By Default

The first version should feel closer to a quiet side channel than a full chat client. Short messages, presence, and manual page drops are enough.

### 3.5 Durable Memory Is Lens-Shaped

Lounge chat should not become the canonical memory of a webpage. A message can include a page link, and a later feature may allow "make this a Lens", but persistence should require an explicit action.

## 4. Naming

Recommended name: **Lounge**.

Why:

- It implies a small place to hang out, not a formal meeting or workspace.
- It is distinct from page companion.
- It avoids making the feature sound like a full group chat product.

Names to avoid:

- **Group chat**: too generic and too central.
- **Room** alone: ambiguous with page room / URL room.
- **Party**: pushes toward synchronous event behavior.
- **Workspace**: pulls toward Atlas / productivity framing.

UI copy can say:

- Page companion: "People on this page"
- Lounge: "Stay with a small room across pages"

## 5. Relationship To Page Companion

### Page Companion

Use when the user wants to find people on the same page right now.

Properties:

- Bound to canonical page room.
- Opt-in per page.
- Ends on leave, page change, tab close, or socket close.
- Emoji toss and tiny chat are contextual to the current page.
- Best for "this page feels alive right now".

### Lounge

Use when the user wants to stay connected to the same group across pages.

Properties:

- Bound to `loungeId`, not page room.
- Explicit join and leave.
- Survives page navigation while the extension/browser session remains active.
- Can manually share the current page.
- Best for "we are browsing together, not necessarily reading the same thing".

### When Both Are Active

Both can exist at the same time, but the UI must not stack two full chats.

Recommended behavior:

- Page companion controls stay in the InfoPanel because they are page-local.
- Lounge lives in the popup or a small secondary sheet opened from the orb.
- If both are active, the orb shows two quiet status marks: page live and Lounge live.
- Page companion chat and Lounge chat are separate. No automatic cross-posting.

## 6. UX Shape

### 6.1 Entry Points

Primary entry should be in the extension popup, not the page InfoPanel.

Reason: Lounge is not page-bound. Putting it primarily inside the page panel makes it feel like part of the current webpage, which is misleading.

Popup states:

- Signed out: no Lounge entry.
- Signed in, not in Lounge: `Join Lounge` input/button.
- In Lounge: show Lounge name/code, member count, `Open Lounge`, `Leave`.

Optional page entry:

- InfoPanel may show a small line when Lounge is active: `Lounge: friends live`.
- It may include `Share this page`.
- It should not show the full Lounge chat by default.

### 6.2 Orb Treatment

The orb should remain page-first.

Possible orb states:

- Default: `N lens`
- Page companion active: `N lens · Companion 2`
- Lounge active: `N lens · Lounge`
- Both active: `N lens · Companion 2 · Lounge`

Keep this compact. Do not show Lounge message previews in the orb.

### 6.3 Lounge Panel

The Lounge panel should feel like a small drawer, not a full chat app.

Suggested sections:

- Header: Lounge name/code, live count, close.
- Recent messages: short list, internal scroll.
- Composer: one-line input, 280 chars.
- Current page action: `Share page`.
- Leave action: quiet secondary button.

No large member list in MVP. No avatars required. Handles are enough.

### 6.4 Share Page To Lounge

Manual page sharing is the key bridge from Lounge back to Lumen.

Payload should include:

- Page title.
- Canonical URL.
- Room ID if available.
- Optional short note.

UI rendering:

- A compact link card in Lounge chat.
- Clicking opens the page.
- If Lumen has Lens on that page, future versions may show `N Lens here`.

This gives Lounge a reason to exist without turning it into automatic browsing telemetry.

## 7. Persistence Policy

MVP recommendation:

- Lounge presence is live only.
- Lounge chat has short in-memory history, similar to page companion.
- No SQLite persistence for chat in the first version.
- Manual page shares may be included in the same short history.

Rationale:

- Keeps the feature light.
- Avoids creating a competing durable chat archive.
- Reduces moderation/privacy scope.
- Forces durable thoughts back into Lens.

Possible later upgrade:

- Per-Lounge optional history, only after real use shows that users need it.
- Explicit `Save as Lens` / `Make Lens from message`, not automatic persistence.

## 8. Privacy Rules

Lounge has higher privacy risk than page companion because it persists across page changes.

Hard rules:

- Do not broadcast current URL automatically.
- Do not show "Alice is reading X" unless Alice explicitly shares X.
- Do not store browsing history as Lounge metadata.
- Lounge membership and messages should be described in the privacy policy before release.
- Anonymous Lens remains unrelated to Lounge identity; Lounge messages show handle.

## 9. MVP Scope

Build only:

- Join Lounge by code.
- Leave Lounge.
- Live member count.
- Short Lounge chat.
- Short in-memory chat history.
- Manual `Share page` action.
- Compact orb indicator.

Do not build yet:

- Public Lounge directory.
- Notifications.
- Voice/video.
- Durable room history.
- Rich member profiles.
- Permissions beyond obscurity-by-code.
- Automatic page broadcasting.
- Lounge-specific Lens feeds.
- Recommendations based on Lounge activity.

## 10. Technical Sketch

Client-to-server messages:

```ts
{ type: "lounge_join"; loungeId: string }
{ type: "lounge_leave" }
{ type: "lounge_chat"; body: string }
{ type: "lounge_share_page"; url: string; canonicalUrl: string; title: string; roomId?: string; note?: string }
```

Server-to-client messages:

```ts
{ type: "lounge_presence"; loungeId: string; users: string[] }
{ type: "lounge_joined"; loungeId: string; userId: string; users: string[] }
{ type: "lounge_left"; loungeId: string; userId: string; users: string[] }
{ type: "lounge_chat"; id: string; loungeId: string; userId: string; handle: string; body: string; at: number }
{ type: "lounge_page"; id: string; loungeId: string; userId: string; handle: string; url: string; canonicalUrl: string; title: string; roomId?: string; note?: string; at: number }
{ type: "lounge_history"; loungeId: string; messages: Array<LoungeHistoryItem> }
```

Service worker ownership:

- The service worker already owns the WebSocket bridge.
- Lounge should be managed there, not in a page content script.
- Content scripts can request Lounge state through ports/messages.
- Popup can be the primary Lounge control surface.

Storage:

- Store the active `loungeId` in extension storage if the user chooses to stay joined.
- Default can be session-only until the UX proves itself.

## 11. Open Questions

1. Should Lounge stay joined across browser restarts, or only across page navigation within the current browser session?
2. Should Lounge history be purely in-memory like page companion, or should page shares persist longer than chat?
3. Should `Share page` live in the InfoPanel, popup, or both?
4. Should Lounge be hidden entirely when the user is in Quiet reading mode, or does Quiet only control page Lens visibility?
5. What should the first room code model be: user-typed codes, generated invite links, or a single cohort Lounge configured by the operator?

## 12. Decision Recommendation

Build Lounge only after the current page-bound Lumen MVP is stable enough for small-cohort use.

When built, keep it small:

> Lounge is a persistent side channel for a small group wandering across pages. Lens remains the durable memory of each page.

This preserves the product center while giving close friends a way to stay together during real browsing.
