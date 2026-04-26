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

## 6. Visual Direction

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

## 7. Relationship to Skill Tree

Skill Tree is not the primary user-facing product in the first phase.

It should work quietly in the background:

- Reacting to a knowledge Lens may count as exposure.
- Saving a Lens may count as interest.
- Writing a useful explanation may count as contribution.
- Answering questions may count as mentoring.
- Completing challenges may count as practice.

Users should first feel they are playing with the web, not studying a curriculum.

## 8. AI Role

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

## 9. MVP Product Shape

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

## 10. Product Risks

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

## 11. North Star

The north star is not “users learn concepts.”

The north star is:

> A webpage becomes more fun, social, and insightful because Lumen is on.

Knowledge, memory, and skill growth should be downstream effects of that experience.
