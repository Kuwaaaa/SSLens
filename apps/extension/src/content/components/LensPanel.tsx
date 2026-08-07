import { useState } from "react";
import { REACTION_KINDS, type Lens, type ReactionKind } from "@lumen/schema";

import { RenderBody } from "../../refs";
import { TargetIcon } from "./TargetIcon";

const REACTION_CHOICES = REACTION_KINDS;
const LONG_LENS_PREVIEW_CHARS = 520;

interface LensPanelProps {
  lens: Lens;
  depth: number;
  stackLabel: string;
  hasAnchor: boolean;
  knownLenses?: Lens[];
  onLensClick?: (id: string) => void;
  onReact: (id: string, kind: ReactionKind) => void | Promise<void>;
  onJumpToAnchor: () => void;
}

export function LensPanel({
  lens,
  depth,
  stackLabel,
  hasAnchor,
  knownLenses,
  onLensClick,
  onReact,
  onJumpToAnchor,
}: LensPanelProps) {
  const quote = lens.anchor?.quote?.exact ?? "";
  const [reactionBusy, setReactionBusy] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const isLongBody = lens.body.length > LONG_LENS_PREVIEW_CHARS || lens.body.split(/\r?\n/).length > 10;

  async function toggleEmoji(kind: ReactionKind) {
    setReactionBusy(kind);
    try {
      await onReact(lens.id, kind);
      setPickerOpen(false);
    } finally {
      setReactionBusy(null);
    }
  }

  const visibleReactions = REACTION_CHOICES.filter((kind) => (
    (lens.reactions?.[kind] ?? 0) > 0 || (lens.myReactions?.includes(kind) ?? false)
  ));

  return (
    <div className={depth === 0 ? "lens-panel" : "lens-panel ref-panel"}>
      {depth > 0 && <div className="stack-label">{stackLabel}</div>}
      <div className="meta">
        <span className="pill">{lens.type}</span>
        {(lens.tags ?? []).map((t) => (
          <span key={t} className="pill" style={{ background: "#f0f0f0", color: "#555" }}>{t}</span>
        ))}
        <span>@{lens.author?.handle ?? "unknown"}</span>
        {depth > 0 && hasAnchor && (
          <span className="card-actions">
            <button
              className="icon-action jump-anchor"
              onClick={onJumpToAnchor}
              aria-label="View anchor"
              data-tooltip="View anchor"
            >
              <TargetIcon />
            </button>
          </span>
        )}
      </div>
      {quote && <div className="quote">"{quote.slice(0, 160)}"</div>}
      <div className={`body ${isLongBody ? "long" : ""} ${bodyExpanded ? "expanded" : ""}`}>
        <div className="body-scroll">
          <RenderBody body={lens.body} knownLenses={knownLenses} onLensClick={onLensClick} />
        </div>
        {isLongBody && !bodyExpanded && <div className="body-fade" aria-hidden="true" />}
      </div>
      {isLongBody && (
        <button className="body-read-more" onClick={() => setBodyExpanded((v) => !v)}>
          {bodyExpanded ? "Show less" : "Read more"}
        </button>
      )}
      <div className="reaction-bar" aria-label="Reactions">
        {visibleReactions.map((kind) => {
          const count = lens.reactions?.[kind] ?? 0;
          const selected = lens.myReactions?.includes(kind) ?? false;
          return (
            <button
              key={kind}
              className={`reaction-chip${selected ? " selected" : ""}`}
              onClick={() => void toggleEmoji(kind)}
              disabled={reactionBusy === kind}
              aria-label={`${selected ? "Remove" : "Add"} ${kind} reaction`}
            >
              <span>{kind}</span>
              {count > 0 && <span className="reaction-count">{count}</span>}
            </button>
          );
        })}
        <button
          className="reaction-add"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add reaction"
        >
          +
        </button>
        {pickerOpen && (
          <div className="reaction-picker">
            {REACTION_CHOICES.map((kind) => (
              <button
                key={kind}
                className="reaction-choice"
                onClick={() => void toggleEmoji(kind)}
                disabled={reactionBusy === kind}
                aria-label={`Add ${kind} reaction`}
              >
                {kind}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
