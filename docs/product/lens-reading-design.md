# Lens Reading Design

Date: 2026-05-05
Status: P0 implementation plan

This document defines the next Lens reading direction. It does not replace
`docs/product/lens-design.md`; it narrows one issue: Lens must stay lightweight
as social cards while becoming capable of carrying longer reusable knowledge.

## 1. Role Split

Lens has two roles:

- **Social card**: quick comments, jokes, questions, reactions, and small notes.
- **Node candidate**: explanations, summaries, examples, project prompts, and
  references that may later feed Atlas.

The UI must serve both without making every Lens feel like a document editor.

Principle:

> A Lens can be long, but it should read lightly by default.

## 2. Reading States

### Preview

Default state for long Lens.

- Shows metadata, quote, and a limited body preview.
- Uses a fade at the bottom when content is clipped.
- Offers `Read more`.
- Keeps card stacks scannable.

### Expanded

In-place expanded state.

- Shows the full rendered body up to a comfortable max height.
- If still long, the body scrolls internally.
- Offers `Show less`.
- Keeps the user near the anchored page context.

### Reader

Future state, not P0.

- A wider, calmer reader panel for very long reusable Lens.
- Useful for knowledge Lens that are effectively mini essays.
- Should not become the default page experience.

## 3. Markdown Direction

Lens body should be Markdown-first.

P0 rendering should support:

- paragraphs,
- soft line breaks,
- headings with restrained scale,
- unordered and ordered lists,
- blockquotes,
- fenced code blocks,
- inline code,
- normal links,
- existing `[[lens:id]]` and `[[url:...]]` refs.

P1 can add:

- tables,
- task lists,
- image policy,
- markdown preview in composer.

Do not add a full rich-text editor yet.

## 4. Long Content Rules

P0 card behavior:

- Short Lens render normally.
- Long Lens body is clipped in preview.
- Expanded body has an internal scroll boundary.
- Code blocks scroll horizontally and never widen the card.
- Text wraps safely inside the card.
- Reduced-motion users should not get animated height transitions.

Recommended initial numbers:

- Preview body max height: about 180px.
- Expanded body max height: about `min(62vh, 560px)`.
- Card stack keeps its viewport clamp.

These are tuning knobs, not product law.

## 5. Type Guidance

The Lens type should influence expected length:

- `quick`: short by default; long content should feel unusual.
- `fun`: short or medium.
- `question`: short question, optional longer context.
- `knowledge`: may be long and should benefit most from Markdown rendering.
- `challenge` / future `project`: may include steps, constraints, and outcome.
- `spoiler`: should keep body hidden by default in a future pass.

P0 does not enforce these rules. It only makes long content readable.

## 6. Atlas Hooks

Richer Lens reading is not only cosmetic. It prepares Lens to become Atlas node
candidates later.

Future metadata may include:

- summary,
- concept hints,
- prerequisite hints,
- project seed,
- reusable flag,
- source Lens / URL / anchor context.

Do not expose this as heavy metadata UI yet. Keep the visible Lens composer and
card experience human and social.

## 7. P0 Implementation Scope

Build now:

- lightweight Markdown rendering in Lens cards,
- preserve existing Lens and URL ref chips,
- long Lens preview with `Read more`,
- expanded in-place body with internal scroll,
- code block and inline code styling,
- reduced-motion-safe transitions.

Defer:

- full reader panel,
- composer Markdown preview,
- templates,
- explicit Atlas metadata editing,
- tables and images unless real Lens usage asks for them.

