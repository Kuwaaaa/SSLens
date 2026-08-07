import type { SelectionDraft } from "../types";

export function CreateButton({ draft, onClick }: { draft: SelectionDraft; onClick: () => void }) {
  const top = Math.min(window.innerHeight - 50, draft.rect.bottom + 6);
  const left = Math.max(8, Math.min(window.innerWidth - 130, draft.rect.left));
  return (
    <button
      className="create-button"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      Create Lens
    </button>
  );
}
