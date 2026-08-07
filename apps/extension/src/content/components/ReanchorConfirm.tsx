import type { SelectionDraft } from "../types";

interface ReanchorConfirmProps {
  draft: SelectionDraft;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReanchorConfirm({
  draft,
  busy,
  error,
  onCancel,
  onConfirm,
}: ReanchorConfirmProps) {
  const top = Math.min(window.innerHeight - 150, draft.rect.bottom + 8);
  const left = Math.max(8, Math.min(window.innerWidth - 300, draft.rect.left));

  return (
    <div className="reanchor-confirm" style={{ top, left }} data-lumen-overlay="">
      <div className="quote-preview">"{draft.text.slice(0, 140)}"</div>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={onConfirm} disabled={busy}>{busy ? "Saving..." : "Use as anchor"}</button>
      </div>
    </div>
  );
}
