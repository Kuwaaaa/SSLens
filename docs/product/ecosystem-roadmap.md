# Ecosystem Roadmap

Date: 2026-05-05
Status: System-level planning note

This document defines how Lumen, Lens, Atlas, learning paths, and toy projects
fit together. It does not replace the MVP plan or the current project status.
It exists to keep future feature work pointed at the same larger system without
prematurely building that system.

## 1. Purpose

The larger idea from `docs/Chat.md` is that knowledge can be open-sourced beyond
software. People should be able to use other people's observations, explanations,
projects, and paths as lenses for seeing more interesting things in the world.

Lumen v2 is the first narrow test of that idea:

> Can a real webpage become a place where people leave useful, playful,
> contextual Lens cards for each other?

If Lumen validates participation, the next system layer is Atlas: a place where
people weave learning paths toward toy projects, using Lens cards and other
materials as raw nodes.

## 2. System Layers

### Lumen

Lumen is the perception layer.

- It lives on real webpages.
- It captures contextual Lens cards.
- It makes a page feel inhabited over time.
- It keeps reading solo by default and social presence opt-in.

Lumen should stay light. It should not become a full knowledge graph UI, project
management app, or learning platform inside the page.

### Lens

Lens is the bridge object.

In the near term, a Lens is a durable page-bound card. In the larger system, a
Lens can also become a candidate knowledge node because it has:

- a human author,
- a page URL,
- an anchor or quote,
- body content,
- references to other Lens or URLs,
- creation context.

Lens should remain readable and social first. Structure should support future
reuse without making ordinary posting feel like filling a school worksheet.

### Lounge

Lounge is a lightweight social side channel.

It can help a small group wander across pages together, but it should not become
the durable memory of the system. Durable insights should return to Lens.

Detailed Lounge design lives in `docs/product/persistent-lounge-design.md`.

### Atlas

Atlas is the path-weaving and project layer.

It is not the v2 MVP. It should start only after Lumen shows that people create
and return to Lens cards. Atlas should use Lumen's activity as one source of
material, not replace Lumen's page-bound experience.

## 3. Lens As Node Candidate

The future hook from Lumen to Atlas should be:

```text
Lens -> Node Candidate -> Atlas Node / Path
```

A Lens should not automatically become a canonical knowledge node. Lens content
is contextual, messy, personal, and often playful. That is good. Atlas can later
promote, group, cite, remix, or summarize Lens into reusable path material.

Possible node-candidate fields:

- `sourceLensId`
- `sourceUrl`
- `anchorQuote`
- `authorId`
- `body`
- `refs`
- `conceptHints`
- `prerequisiteHints`
- `projectHints`
- `createdFromReadingContext`

The current implementation does not need all of these fields now. The important
decision is to preserve enough context that a future Atlas node can say where it
came from and who made it useful.

## 4. Lens Format Direction

Lens should become richer, but not heavy.

Preferred direction:

- Markdown-first body.
- GitHub-flavored Markdown support for code, lists, quotes, and tables.
- Existing `[[lens:id]]` and `[[url:...]]` references remain first-class.
- Future references may include `[[concept:...]]`, `[[project:...]]`, or
  `[[path:...]]`.
- Structured metadata stays mostly hidden behind simple UI affordances.

Avoid:

- forcing every Lens into a rigid schema,
- turning the composer into a knowledge-base editor too early,
- exposing a graph interface in Lumen,
- letting AI generate visible Lens by default.

The product should feel like a social card layer. The system can quietly keep
hooks that make some cards reusable later.

## 5. Atlas As Path Weaving

Atlas should not be a single official skill tree.

The central unit should be a user-woven learning path:

```text
Learning Path = a route through prerequisite nodes toward a toy project
```

Different users can weave different paths through the same domain because they
start with different backgrounds, goals, tastes, and missing prerequisites.

A path can be:

- private, for the user's own planning,
- shared, for people with similar backgrounds,
- forked or remixed,
- attached to Lens, URLs, notes, repos, and toy projects.

This keeps Atlas closer to open-source branching than to a school syllabus.

## 6. Toy Project As Path Outcome

Every serious learning path should ideally end in a toy project.

The toy project is the path's proof and reward:

- It shows what the learner can now make.
- It keeps learning grounded in creation.
- It gives the path a concrete finish line.
- It can live in the user's room/profile as a visible artifact.

This matters because the goal is not only to consume knowledge. The goal is to
help people notice that they already know enough to build something small,
personal, and exciting.

For Atlas, a path without an outcome risks becoming another reading list. A toy
project turns it into a route toward making.

## 7. Recommendation Philosophy

Atlas recommendations should not assume one best path for everyone.

The most useful path for a learner may come from someone with a similar starting
point:

- similar existing knowledge,
- similar missing prerequisites,
- similar project taste,
- similar preferred explanation style,
- similar domain background.

Future recommendation may use:

- Lens authored or saved,
- paths completed or forked,
- toy projects built,
- declared skills or missing prerequisites,
- similarity between the learner and path author,
- explicit search and social discovery.

Early Atlas should start with manual discovery, sharing, forking, and remixing
before complex recommendation algorithms.

## 8. Community Loop

The intended system loop is:

```text
read a webpage
-> leave or find Lens
-> discuss lightly in Companion or Lounge
-> turn durable insight back into Lens
-> weave Lens and URLs into an Atlas path
-> finish a toy project
-> share the project and path
-> create more Lens from what was learned
```

Salon-style sharing can sit on top of this loop later. A salon should be a small
group sharing projects and paths, not a formal class.

## 9. Current Boundaries

Build now:

- Lumen beta stability.
- Richer Lens rendering where it directly improves cards.
- References that preserve future node hooks.
- Room/canonical debugging and server reliability.

Plan now, but do not build yet:

- Atlas data model.
- Path weaving model.
- Toy project outcome model.
- Lens-to-node promotion workflow.

Do not build yet:

- visible knowledge graph UI,
- official global skill tree,
- algorithmic path recommendation,
- public reputation or leaderboards,
- AI-authored public knowledge nodes,
- durable Lounge chat as a knowledge archive.

The current discipline remains: validate Lumen participation first. Atlas becomes
worth building only if people actually create Lens that others want to read,
reference, and build from.
