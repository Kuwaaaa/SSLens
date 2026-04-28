export type LensType = "quick" | "fun" | "question" | "poll" | "knowledge" | "challenge" | "spoiler";

// Free-form tag. Conventional categories:
//   topic:   "training", "debugging", "startup", "math", ...
//   mood:    "serious", "joke", "hot-take", "confused"
//   quality: "featured" (set by curator)
// Reading modes filter against tag presence/absence client-side.
export type LensTag = string;

export const REACTION_KINDS = [
  "\u{1F44D}", "\u{1F44E}", "\u2764\uFE0F", "\u{1F525}", "\u{1F970}", "\u{1F44F}", "\u{1F602}", "\u{1F601}",
  "\u{1F914}", "\u{1F92F}", "\u{1F631}", "\u{1F92C}", "\u{1F622}", "\u{1F389}", "\u{1F929}", "\u{1F92E}",
  "\u{1F4A9}", "\u{1F64F}", "\u{1F44C}", "\u{1F54A}\uFE0F", "\u{1F921}", "\u{1F971}", "\u{1F974}", "\u{1F60D}",
  "\u{1F433}", "\u2764\uFE0F\u200D\u{1F525}", "\u{1F31A}", "\u{1F32D}", "\u{1F4AF}", "\u{1F923}", "\u26A1", "\u{1F34C}",
  "\u{1F3C6}", "\u{1F494}", "\u{1F928}", "\u{1F610}", "\u{1F353}", "\u{1F37E}", "\u{1F48B}", "\u{1F608}",
  "\u{1F634}", "\u{1F62D}", "\u{1F913}", "\u{1F47B}", "\u{1F468}\u200D\u{1F4BB}", "\u{1F440}", "\u{1F383}", "\u{1F648}",
  "\u{1F607}", "\u{1F628}", "\u{1F91D}", "\u270D\uFE0F", "\u{1F917}", "\u{1FAE1}", "\u{1F5FF}", "\u{1F192}",
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

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
  handle: string;
  name?: string;
  avatar?: string;
  githubLogin?: string | null;
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
  reactions: Partial<Record<ReactionKind, number>>;
  myReactions?: ReactionKind[];
  replyCount: number;
  saveCount: number;
  createdAt: number;
  featured?: boolean;
  viewerIsAuthor?: boolean;     // true for the current viewer, even when anonymous display is used
  canEditAnchor?: boolean;      // viewer may repair this Lens anchor
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
