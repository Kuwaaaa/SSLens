import { useRef, useState } from "react";
import type { Lens, LensType } from "@lumen/schema";

import type { SelectionDraft } from "../types";

const LENS_TYPES: LensType[] = ["quick", "fun", "question", "knowledge"];

interface ComposerProps {
  draft: SelectionDraft;
  referenceLenses: Lens[];
  overlapLenses: Lens[];
  onCancel: () => void;
  onSubmit: (input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) => void | Promise<void>;
}

export function Composer({
  draft,
  referenceLenses,
  overlapLenses,
  onCancel,
  onSubmit,
}: ComposerProps) {
  const [type, setType] = useState<LensType>("quick");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const top = Math.min(window.innerHeight - 320, draft.rect.bottom + 12);
  const left = Math.max(8, Math.min(window.innerWidth - 380, draft.rect.left));

  async function submit() {
    if (!body.trim()) {
      setError("Body required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      await onSubmit({ type, body: body.trim(), tags, anonymous });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function insertLensRef(lensId: string) {
    const snippet = `[[lens:${lensId}]]`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const prefix = body.slice(0, start);
    const suffix = body.slice(end);
    const spacerBefore = prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
    const spacerAfter = suffix.length > 0 && !/^\s/.test(suffix) ? " " : "";
    const inserted = `${spacerBefore}${snippet}${spacerAfter}`;
    const next = `${prefix}${inserted}${suffix}`;
    setBody(next);
    setRefPickerOpen(false);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      const pos = start + inserted.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <div className="composer" style={{ top, left }} data-lumen-overlay="">
      <div className="quote-preview">"{draft.text.slice(0, 200)}"</div>
      {overlapLenses.length > 0 && (
        <div className="overlap-hint">
          <span>{overlapLenses.length} Lens already here</span>
          <button type="button" onClick={() => setRefPickerOpen(true)}>Reference one</button>
        </div>
      )}
      <div>
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as LensType)}>
          {LENS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label>Body</label>
        <textarea ref={textareaRef} value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </div>
      {referenceLenses.length > 0 && (
        <div className="ref-insert">
          <button type="button" className="ref-insert-toggle" onClick={() => setRefPickerOpen((v) => !v)}>
            Insert reference
          </button>
          {refPickerOpen && (
            <div className="ref-insert-list">
              {referenceLenses.map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  className="ref-insert-item"
                  onClick={() => insertLensRef(lens.id)}
                >
                  <span className="ref-insert-meta">
                    <span className="pill">{lens.type}</span>
                    <span>@{lens.author?.handle ?? "unknown"}</span>
                  </span>
                  <span className="ref-insert-body">{lens.body.slice(0, 72)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <label>Tags (comma-separated)</label>
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.currentTarget.checked)}
        />
        <span>Post as Anonymous</span>
      </label>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy}>{busy ? "Posting..." : "Publish"}</button>
      </div>
    </div>
  );
}
