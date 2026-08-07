import type { CompanionEmojiBurst } from "../types";

export function CompanionEmojiLayer({ bursts }: { bursts: CompanionEmojiBurst[] }) {
  if (bursts.length === 0) return null;
  return (
    <div className="companion-emoji-layer" data-lumen-overlay="" aria-hidden="true">
      {bursts.map((burst) => (
        <span
          key={burst.id}
          className={`companion-emoji-burst ${burst.edge}`}
          style={{ top: `${burst.y * 100}%` }}
        >
          {burst.emoji}
        </span>
      ))}
    </div>
  );
}
