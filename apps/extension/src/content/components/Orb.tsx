interface OrbProps {
  count: number;
  live: boolean;
  companionActive: boolean;
  companionCount: number;
  extraCount?: number;
  onToggle: () => void;
}

export function Orb({
  count,
  live,
  companionActive,
  companionCount,
  extraCount = 0,
  onToggle,
}: OrbProps) {
  return (
    <button className="orb" onClick={onToggle}>
      <span className={`dot ${live ? "" : "idle"}`} />
      <span>{count} lens</span>
      {companionActive && (
        <span className="orb-meta">{companionCount > 0 ? `Companion ${companionCount}` : "Companion"}</span>
      )}
      {extraCount > 0 && <span className="orb-badge">+{extraCount}</span>}
    </button>
  );
}
