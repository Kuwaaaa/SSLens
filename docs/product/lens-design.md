# Lumen Lens Product Design

Date: 2026-04-26
Status: Draft v0.2

## 1. Core Positioning

Lumen is first an entertainment and social discussion layer for webpages.

It is not primarily a knowledge graph, AI reader, annotation tool, or serious learning app. Those can become higher-level capabilities, but the foundation is simpler:

> Users leave playful, contextual Lens cards on real webpages, and other users react, reply, remix, and discuss them.

Short positioning:

> Lumen = webpage comments + danmaku energy + contextual cards.

Expanded positioning:

> Lumen turns webpages into shared social spaces where people can leave funny comments, questions, polls, reactions, hot takes, and occasional knowledge cards directly beside the content they are reacting to.

Knowledge is still important, but it should emerge from user discussion. A knowledge Lens is a refined form of social participation, not the default starting point.

## 2. Product Priorities

The priority order is:

1. Entertainment and social presence
2. User-generated Lens discussions
3. Low-friction creation
4. Contextual anchoring on real webpage content
5. Lightweight knowledge emergence
6. Skill tree and personal growth as background systems
7. AI assistance as creation acceleration

This means Lumen should optimize first for:

- “This webpage feels alive.”
- “I want to see what people said here.”
- “I want to leave a quick reaction.”
- “This comment is funny/useful enough to share.”
- “This discussion made me notice something I missed.”

It should not initially optimize for:

- Complete concept coverage
- Perfect knowledge graph structure
- Formal learning paths
- AI auto-explanation of every paragraph
- Serious note-taking workflows

## 3. Product Principles

### 3.1 UGC First

Most Lens content should come from users:

- Comments
- Jokes
- Questions
- Polls
- Reactions
- Replies
- Hot takes
- Explanations
- Local context from people who know the topic

Official or AI-generated Lens should be used for cold start and quality examples, but they should not dominate the product.

### 3.2 Entertainment Before Education

Users should feel they are joining a lively page discussion, not entering a course.

Good Lens content can be:

- Funny
- Sharp
- Casual
- Personal
- Opinionated
- Confused
- Helpful
- Educational

Educational content should retain a playful tone. Knowledge Lens should feel like “a great comment that unlocked the page,” not like a textbook excerpt.

### 3.3 Context Is the Unit

A Lens must be anchored to context:

- Text selection
- Paragraph
- Heading
- Image
- Code block
- Formula
- Page-level room
- Video timestamp, later

A Lens without context is just a generic comment. Lumen’s advantage is that comments live exactly where they matter.

### 3.4 Default Quiet, Summoned Social Energy

Lumen must not ruin reading.

Default state:

- Low-density markers
- Small page Lens orb
- No full-screen danmaku on text pages
- No aggressive popups

Active state:

- Click marker to open card
- Select text to create Lens
- Open side panel to see discussion
- Join Live room when user wants presence

### 3.5 The Page Is a Room

Every supported URL can become a lightweight room:

- Who is reading now?
- Which paragraphs are hot?
- What are people reacting to?
- What are the best comments here?
- What questions are unresolved?

The room should support both asynchronous Lens cards and realtime chat.

### 3.6 Knowledge Emerges from Discussion

Knowledge should be promoted from social activity:

```text
quick comment -> popular discussion -> refined explanation -> knowledge Lens -> skill signal
```

Examples:

- A joke about “founder folklore” can become a product Lens.
- A question about “why this code works” can become a technical explanation.
- A poll about “rewrite vs refactor” can become a software engineering concept card.

### 3.7 User Control Is Mandatory

Users must be able to:

- Hide Lens on this page
- Hide Lens on this site
- Reduce marker density
- Only see friends / following / highlights
- Mute users
- Report content
- Turn off Live
- Keep private Lens

Entertainment must not become page pollution.

## 4. Lens Content Types

### 4.1 Quick Lens

The default creation mode.

Purpose:

- Fast comment
- Casual reaction
- Lightweight danmaku-style expression

Examples:

- “This is exactly my last sprint review.”
- “Dangerously familiar.”
- “This paragraph has manager energy.”
- “Someone explain this like I am sleep deprived.”

Traits:

- One short body
- Fast to create
- No skill binding required
- Reaction-first
- Often funny or emotional

### 4.2 Fun Lens

A more polished joke, meme, satire, or cultural read.

Example:

```text
Title: Founder Side Quest
Body: This advice starts practical, then suddenly asks you to become a one-person customer support cult.
Reactions: lol / true / aha / nope
```

Traits:

- Shareable
- Opinionated
- Often high-retention
- Can later become a knowledge Lens if it reveals a pattern

### 4.3 Question Lens

Used when the user does not understand or wants discussion.

Examples:

- “What does this mean in practice?”
- “Is the author assuming too much here?”
- “Can someone give a real-world example?”

Traits:

- Invites replies
- Good for Live rooms
- High-quality answers can be promoted

### 4.4 Poll Lens

Turns a claim into a social decision.

Examples:

- “Rewrite or refactor?”
- “Is this good startup advice or survivorship bias?”
- “Does this help creators or platforms more?”

Traits:

- Lightweight participation
- Good for controversial claims
- Creates visible page energy

### 4.5 Knowledge Lens

A concise explanation that emerged from or supports discussion.

Knowledge Lens should be short, contextual, and lively.

Example:

```text
Title: Sunk Cost Is Glowing Here
Body: The more a team has already invested, the harder it becomes to judge whether continuing still makes sense.
Question: If you joined today, would you choose this project again?
```

Traits:

- Optional skill link
- Can be official, user-created, or AI-assisted
- Should not dominate the feed
- Best when connected to a specific page moment

### 4.6 Challenge Lens

Small activity connected to the page.

Examples:

- “Rewrite this jargon sentence in plain English.”
- “Find the hidden assumption in this paragraph.”
- “Name one counterexample.”

Traits:

- Game-like
- Can produce skill signals
- Useful for learning without making Lumen feel like school

### 4.7 Live Message

Realtime page-room chat.

Traits:

- Short-lived by default
- Good messages can be promoted into persistent Lens
- Should not automatically flood the page

## 5. Core Interaction Loops

### 5.1 Reader Loop

```text
Open webpage -> notice subtle Lens marker -> click -> read funny/useful card -> react/reply/save
```

Goal: make the page feel alive.

### 5.2 Creator Loop

```text
Select text -> create Lens -> choose quick/fun/question/poll/knowledge -> publish -> receive reactions/replies
```

Goal: make user contribution effortless.

### 5.3 Discussion Loop

```text
Question or hot take -> replies -> better explanation -> promoted Lens -> highlighted in page
```

Goal: make discussion produce durable value.

### 5.4 Knowledge Emergence Loop

```text
UGC comment -> AI/user refinement -> knowledge Lens -> optional skill signal -> personal memory
```

Goal: let learning emerge naturally from social play.

## 6. Lens On Ebooks And PDFs

Ebook support extends the Lens anchoring model beyond normal webpages. It should
not change the product center: a Lens is still a lightweight social card
attached to context, not a formal note, a study database, or a book knowledge
graph.

The first ebook target should be PDF because many real reading workflows happen
in PDFs: papers, manuals, textbooks, reports, and exported books. EPUB and other
formats can come later.

### 6.1 Product Goal

The desired loop is:

```text
Open a PDF in Lumen -> select text -> create Lens -> later readers see cards on
the same passage or a confidently matched copy of the same book
```

PDF Lens should preserve the same tone as webpage Lens:

- quick comments,
- questions,
- explanations,
- small references,
- challenges,
- reusable knowledge cards when they naturally emerge.

It should not become:

- a full PDF editor,
- a citation manager,
- a serious note-taking app,
- an AI-generated study guide,
- a visible Atlas or book graph UI.

### 6.2 Identity Problem

The hard problem is not OCR first. The hard problem is deciding what "the same
book" means when users may have different PDF files.

Use three identity layers:

```text
Work      -> the abstract book or paper
Edition   -> a specific language/version/publisher/revision/ISBN
Document  -> one concrete PDF file or source
```

P0 should bind Lens to a `Document`. Later versions may infer `Edition` and
`Work`, but cross-document reuse must be confidence-based and visible to the
user. Do not automatically merge Lens from different PDFs just because titles
look similar.

Recommended document signals:

- file hash,
- source URL when available,
- PDF metadata title and author,
- page count,
- ISBN / DOI candidates,
- normalized text fingerprint from stable pages,
- chapter or heading fingerprints.

### 6.3 Target And Anchor Shape

The code model should move from webpage-only anchors:

```text
canonical URL + DOM text anchor
```

to media-specific Lens targets:

```text
target kind + canonical object identity + target-specific anchor
```

For PDF, the target should include enough information to restore both the text
selection and the visual marker:

```ts
interface PdfDocumentTarget {
  kind: "pdf-document";
  documentId: string;
  workId?: string;
  editionId?: string;
  sourceUrl?: string;
  fileHash?: string;
  fingerprint?: string;
  metadata?: {
    title?: string;
    authors?: string[];
    isbn?: string[];
    doi?: string;
    pageCount?: number;
  };
  anchor: PdfTextAnchor;
}

interface PdfTextAnchor {
  quote: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  pageIndex: number;
  pageLabel?: string;
  textPositionOnPage?: { start: number; end: number };
  textPositionInDocument?: { start: number; end: number };
  rects?: Array<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}
```

`quote` and text offsets recover the anchor. `rects` repaint the marker. Page
numbers alone are not reliable enough.

### 6.4 Reader Strategy

Do not rely on the browser's built-in PDF viewer as the main implementation
surface. Browser PDF viewers may expose text selection to users, but extension
access to the PDF text layer, page geometry, and overlay behavior is not a
stable product foundation.

Prefer a Lumen-owned PDF reader, likely built on PDF.js:

```text
PDF.js render -> controlled text layer -> controlled selection -> Lens target
creation -> controlled marker and card overlay
```

The first version can be narrow:

- text-based PDFs only,
- same-document Lens create/restore,
- page quote and rect anchors,
- no OCR,
- no DRM formats,
- no global book graph UI.

### 6.5 Room Model

Webpage rooms can stay keyed by canonical URL. PDF rooms should be keyed by
target identity instead:

```text
web page room     = hash("web:" + canonicalUrl)
PDF document room = hash("pdf-document:" + documentId)
PDF edition room  = hash("pdf-edition:" + editionId)
PDF work room     = hash("pdf-work:" + workId)
```

P0 should use document rooms. Edition/work rooms should be introduced only after
the product has enough confidence in PDF identity and cross-document re-anchor.

### 6.6 Runtime Boundary

Ebook Lens should not be implemented by adding PDF-specific branches throughout
the current webpage content script. The Lens runtime needs a surface boundary:

```text
Lens UI and room state
-> surface adapter
-> webpage / PDF / future ebook implementation
```

A webpage surface can keep using DOM `Range`. A PDF surface should use
page-indexed rectangles and text offsets. This keeps Lens cards, composer,
reading modes, reactions, refs, and orphan handling reusable across surfaces.

Suggested surface responsibilities:

- read current selection,
- create target-specific anchor,
- restore a Lens target,
- apply and clear markers,
- hit-test marker clicks,
- return card positioning rects,
- jump to an anchor.

Implementation notes for this boundary are also tracked in
`apps/extension/README.md`.

### 6.7 Deferred Work

Defer until the PDF text-based loop proves useful:

- OCR for scanned PDFs,
- EPUB support,
- Kindle or DRM formats,
- automatic cross-PDF merging,
- persistent book library UI,
- visible Atlas/book graph UI,
- AI-generated public study notes.

## 7. Visual Direction

The current visual direction is:

- Light, soft, playful
- Low-interference markers
- Gradient text / subtle transparent fill / light outline
- Card beside the marked paragraph
- Card content minimal
- Reaction buttons preserved
- Knowledge metadata minimized

Markers should distinguish Lumen from native blog styles without overpowering the original page.

Preferred marker styles:

- Subtle gradient text
- Soft transparent gradient background
- Light outline / stroke
- Tiny dot only as secondary hint

Avoid:

- Heavy yellow highlights
- Large icons beside every mark
- Dark HUD overlays on normal reading pages
- Cards with too much metadata

## 8. Relationship to Skill Tree

Skill Tree is not the primary user-facing product in the first phase.

It should work quietly in the background:

- Reacting to a knowledge Lens may count as exposure.
- Saving a Lens may count as interest.
- Writing a useful explanation may count as contribution.
- Answering questions may count as mentoring.
- Completing challenges may count as practice.

Users should first feel they are playing with the web, not studying a curriculum.

## 9. AI Role

AI is an assistant, not the core product.

Good AI uses:

- Make my comment funnier
- Turn this into a poll
- Explain this like a sharp comment
- Suggest a title
- Summarize this thread
- Promote a good answer into a knowledge Lens
- Help cold-start a page with sample Lens

Bad AI uses for MVP:

- Auto-mark the whole web
- Replace user discussion
- Generate too many fake comments
- Make Lumen feel like an AI tutor

## 10. MVP Product Shape

The MVP should prove:

- Users enjoy seeing contextual comments on real webpages.
- Users are willing to create Lens quickly.
- Discussion around specific webpage moments is more engaging than a generic comment section.
- Some discussions naturally become useful knowledge.

The MVP does not need to prove:

- Full knowledge graph quality
- Complete skill tree progression
- Perfect AI matching
- Large-scale moderation automation

## 11. Product Risks

### Too Serious

If Lens feels like homework, users will not create content.

### Too Noisy

If markers and chat dominate the page, users will disable Lumen.

### Too Empty

If no one has commented, pages feel dead. Cold-start needs official/AI examples and seeded rooms.

### Too AI-Generated

If content feels fake, users will not trust the room.

### Too Open

If spam or harassment spreads, the page layer becomes hostile.

## 12. North Star

The north star is not “users learn concepts.”

The north star is:

> A webpage becomes more fun, social, and insightful because Lumen is on.

Knowledge, memory, and skill growth should be downstream effects of that experience.
