export function RestoreTabButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="restore-tab" onClick={onClick} data-lumen-overlay="">
      Show Lumen
    </button>
  );
}
