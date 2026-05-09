# Lumen v2 Project Overview

Date: 2026-05-06
Status: Stable product overview

This document explains what Lumen v2 is and why it exists. It is not the current
implementation checklist. For current status, read `docs/project-status.md`. For
AI assistant routing, read `AGENTS.md`.

## 1. What Lumen Is

Lumen is a browser extension that lets a small group leave contextual, playful
Lens cards on real webpages. A Lens is anchored to a page or passage, signed by
a handle, and persists over time. As pages accumulate Lens cards, they start to
feel inhabited.

When a reader wants live company, they can explicitly enter companion mode for
the current page. Companion is ephemeral and opt-in; durable memory belongs in
Lens cards.

The simplest description:

> Lumen turns a webpage into a place that has been read, and occasionally a
> place where someone else is reading right now.

## 2. The Bet

The larger idea behind Lumen is that knowledge can be open-sourced beyond
software: explanations, paths, observations, and small projects can become
reusable lenses for other people.

v2 deliberately narrows that idea to one testable claim:

> People will participate on a webpage when it feels like other people have
> been there. Knowledge emerges from participation; it does not seed it.

If this is true, a wider ecosystem can grow later. If not, building a knowledge
graph first will not save the product.

The v2 chain is:

```text
entertainment substrate -> participation -> UGC -> emergent knowledge
```

Reverse the arrows and the project falls back into the v1 trap: build knowledge
infrastructure first, hope people arrive later, and discover that they do not.

## 3. Product Shape

Lumen has three main layers in v2:

- **Async Lens accumulation.** Cards persist on real pages and become the page's
  durable social memory.
- **Reading modes.** Quiet, Thinking, and Full let each reader control how much
  social signal they see.
- **Page companion.** A reader can opt into short-lived same-page presence,
  emoji tosses, and tiny chat.

All three layers must respect the original page. Lumen is a quiet overlay, not a
replacement reading surface.

## 4. Scope Boundaries

In v2, do not build:

- visible AI-authored Lens,
- default floating danmaku,
- scheduled co-reading as the core loop,
- visible knowledge graph UI,
- skill tree UI,
- public reputation, karma, or leaderboards,
- durable Lounge chat as page memory,
- Atlas UI inside Lumen.

These ideas may return later if the Lens participation loop works. They are not
the first thing to validate.

## 5. Identity Model

The current identity model is intentionally small:

- **Handle:** required display identity.
- **Bearer token:** stored by the extension and used for API/WS calls.
- **Invite mode:** optional server setting for tighter cohorts.
- **Anonymous Lens flag:** hides the author in UI, but the server records the
  real author for moderation.

This is not a zero-knowledge anonymity system.

## 6. Relationship To Atlas

The original conception in `docs/Chat.md` frames a larger ecosystem: Lumen as a
perception layer and Atlas as a future path-weaving / project layer.

Atlas is real as a direction, but out of scope for Lumen v2. Lumen should keep
enough context that some Lens cards can later become node candidates, without
turning the v2 UI into a knowledge management tool.

For current ecosystem planning, read `docs/product/ecosystem-roadmap.md`.

## 7. Success Shape

The success criterion is qualitative and accumulative:

- invited users keep creating Lens after the novelty wears off,
- at least some pages accumulate multi-author Lens layers,
- references between Lens appear naturally,
- users say they want to keep the extension on,
- companion mode creates occasional lightweight moments without becoming the
  product center.

Total Lens count is not the north-star metric.

## 8. Documentation Responsibilities

- AI assistant entry and routing: `AGENTS.md`.
- Current implementation status and near-term plan: `docs/project-status.md`.
- Technical architecture and rationale: `docs/ARCHITECTURE.md`.
- Lens product details: `docs/product/lens-design.md`.
- Original Chinese conception: `docs/Chat.md`.

Older planning docs may contain stale checklists. Treat `docs/project-status.md`
as the current snapshot.

## 9. North Star

> Lumen exists to make a webpage feel inhabited through cards that persist, not
> chrome that interrupts. Knowledge, skill growth, and a wider ecosystem are
> downstream effects of solving that one problem first.
