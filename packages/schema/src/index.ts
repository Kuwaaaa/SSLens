export type LensType = "quick" | "fun" | "question" | "poll" | "knowledge" | "challenge" | "spoiler";

// Free-form tag. Conventional categories:
//   topic:   "training", "debugging", "startup", "math", ...
//   mood:    "serious", "joke", "hot-take", "confused"
//   quality: "featured" (set by curator)
// Reading modes filter against tag presence/absence client-side.
export type LensTag = string;

export type ReactionKind = "lol" | "true" | "aha" | "disagree" | "confused";

// User's declaration of how much social signal they want right now.
//   quiet     - minimal markers; only featured + saved + author=friend show
//   thinking  - show types {question, knowledge, challenge}; hide pure jokes/reactions/polls
//   full      - show everything
export type ReadingMode = "quiet" | "thinking" | "full";

// A Lens body can cite other Lens or external URLs via [[lens:id]] / [[url:...]].
// LensRef is the parsed representation extracted from body at render time
// or stored alongside for fast lookup.
export interface LensRef {
  kind: "url" | "lens";
  target: string;       // URL string for kind=url; lens id for kind=lens
  label?: string;       // optional display override
}

export interface LensAnchor {
  quote: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  position?: {
    start: number;
    end: number;
  };
  domRange?: Record<string, unknown>;
}

export interface SkillLink {
  skillId: string;
  label: string;
  confidence: number;
  source: "official" | "ai_suggested" | "user";
}

// Lens body is Markdown. [[lens:id]] and [[url:...]] are the inline ref syntaxes.
export interface LensContent {
  title?: string;
  body: string;
  emoji?: string;
  question?: string;
  options?: string[];
  concept?: string;
  challenge?: string;
}

export interface LensAuthor {
  id: string;
  name: string;
  avatar: string;
  role?: "official" | "host" | "member" | "ai";
}

export interface Lens {
  id: string;
  type: LensType;
  tags: LensTag[];
  refs?: LensRef[];
  anchor: LensAnchor;
  body: string;                 // Markdown; supports [[lens:id]] / [[url:...]]
  content?: LensContent;        // Reserved for richer content types (poll options, challenge prompts); currently unused
  author: LensAuthor;
  anonymous?: boolean;          // when true, UI displays author as "Anonymous"
  skillLinks?: SkillLink[];
  reactions: Record<ReactionKind, number>;
  replyCount: number;
  saveCount: number;
  createdAt: string;
  featured?: boolean;
}

export interface UserPreferences {
  readingMode: ReadingMode;                          // default mode
  perSiteOverrides?: Record<string, ReadingMode>;    // host -> mode (P1)
  customTagFilters?: LensTag[];                      // P1 user-defined filter
}

// ---- Companion mode ----
// Opt-in real-time matching: a user clicks a "Find companion" button while
// reading; server matches them with anyone else on the same room (canonical
// URL) who has the button currently on. Sessions are ephemeral.

export type CompanionEventKind = "emoji" | "chat";

export interface CompanionEvent {
  id: string;
  kind: CompanionEventKind;
  authorId: string;
  body: string;             // single emoji for kind=emoji; text for kind=chat
  createdAt: string;
}

export interface CompanionSession {
  id: string;
  roomId: string;           // SHA256(canonical_url)
  participantIds: string[];
  startedAt: string;
  endedAt?: string;
}

export interface LiveMessage {
  id: string;
  author: LensAuthor;
  body: string;
  createdAt: string;
  promotedLensId?: string;
}

export interface SkillNode {
  id: string;
  name: string;
  domain: string;
  color: string;
  progress: number;
  state: "locked" | "seen" | "sparked" | "contributed" | "recognized";
}
