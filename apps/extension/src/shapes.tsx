// Geometric shape blooms — small SVG primitives that emit from along a Lens
// card's outline (or from the top edge of a marker), then fade. Part of
// lumen's visual identity: "something just happened here." Kept restrained
// per docs hard lines (cards are the primary form, never floating UI that
// grabs attention from the article body itself).
//
// Trigger points wired in content.tsx:
//   - card-open: when a LensCard mounts, ~12 shapes emit from random points
//                along all four edges of the card. Each shape travels
//                perpendicular to its edge with ±20° angular jitter and a
//                staggered delay so the burst "flows" around the outline.
//   - marker:    when a Lens arrives via WS and successfully anchors, 4
//                small shapes pop along the top edge of the marker.
//
// Each shape uses CSS keyframe `lumen-bloom` (see styles.css). All shape
// properties (kind, color, outlined, size, rotation) are randomized per
// emission so no two card-opens look identical.

import { useEffect } from "react";
import { LUMEN_THEMES, type LumenThemeId, type LumenThemeProfile } from "./theme";

type ShapeKind = "circle" | "triangle" | "square" | "plus" | "arc";

interface BloomShape {
  id: string;
  kind: ShapeKind;
  color: string;
  outlined: boolean;
  size: number;
  startX: number;       // viewport x where the shape begins
  startY: number;       // viewport y where the shape begins
  dx: number;           // travel vector
  dy: number;
  rotate: number;       // final rotation in degrees
  delay: number;        // ms before this shape's animation begins
}

export interface BloomSpec {
  shapes: BloomShape[];
}

export type BloomIntent = "card-open" | "marker";

// --- random helpers ---

const ALL_SHAPES: ShapeKind[] = ["circle", "triangle", "square", "plus", "arc"];
const r = () => Math.random();
const pickShape = (): ShapeKind => ALL_SHAPES[Math.floor(r() * ALL_SHAPES.length)];

function pickColor(colors: string[]): string {
  return colors[Math.floor(r() * colors.length)] ?? LUMEN_THEMES.classic.bloom.colors[0];
}
const pickOutlined = (): boolean => r() > 0.4;

// Emit a shape at viewport (startX, startY), traveling roughly (baseDx, baseDy)
// with angular jitter so identical-edge shapes don't fly in lockstep.
function emit(
  id: string,
  startX: number,
  startY: number,
  baseDx: number,
  baseDy: number,
  delay: number,
  size: number,
  colors: string[],
): BloomShape {
  const jitter = (r() - 0.5) * 0.7; // ±20°
  const cos = Math.cos(jitter);
  const sin = Math.sin(jitter);
  return {
    id,
    kind: pickShape(),
    color: pickColor(colors),
    outlined: pickOutlined(),
    size,
    startX,
    startY,
    dx: baseDx * cos - baseDy * sin,
    dy: baseDx * sin + baseDy * cos,
    rotate: (r() - 0.5) * 80,
    delay,
  };
}

export function makeBloomSpec(
  rect: DOMRect,
  intent: BloomIntent,
  themeId: LumenThemeId = "classic",
): BloomSpec {
  const shapes: BloomShape[] = [];
  const bloom: LumenThemeProfile["bloom"] = LUMEN_THEMES[themeId].bloom;

  if (intent === "card-open") {
    // 4 + 4 + 2 + 2 = 12 emission points along the card outline.
    // Stagger flows clockwise from top, so the burst "rolls" around.
    const TOP_N = bloom.cardOpenCount.top;
    const BOTTOM_N = bloom.cardOpenCount.bottom;
    const SIDE_N = bloom.cardOpenCount.side;
    const SPREAD = bloom.spread; // base px shapes travel from the edge

    for (let i = 0; i < TOP_N; i++) {
      const t = (i + 0.5) / TOP_N + (r() - 0.5) * 0.04;
      const x = rect.left + rect.width * t;
      const y = rect.top;
      const dist = SPREAD + r() * 30;
      const size = 9 + Math.floor(r() * 6);
      shapes.push(emit(`t${i}`, x, y, 0, -dist, Math.floor(i * 25 + r() * 15), size, bloom.colors));
    }
    for (let i = 0; i < SIDE_N; i++) {
      const t = (i + 0.5) / SIDE_N + (r() - 0.5) * 0.04;
      const x = rect.right;
      const y = rect.top + rect.height * t;
      const dist = SPREAD + r() * 30;
      const size = 9 + Math.floor(r() * 6);
      shapes.push(emit(`r${i}`, x, y, dist, 0, Math.floor(60 + i * 30), size, bloom.colors));
    }
    for (let i = 0; i < BOTTOM_N; i++) {
      const t = (i + 0.5) / BOTTOM_N + (r() - 0.5) * 0.04;
      const x = rect.right - rect.width * t; // reverse so flow continues clockwise
      const y = rect.bottom;
      const dist = SPREAD + r() * 30;
      const size = 9 + Math.floor(r() * 6);
      shapes.push(emit(`b${i}`, x, y, 0, dist, Math.floor(100 + i * 25 + r() * 15), size, bloom.colors));
    }
    for (let i = 0; i < SIDE_N; i++) {
      const t = (i + 0.5) / SIDE_N + (r() - 0.5) * 0.04;
      const x = rect.left;
      const y = rect.bottom - rect.height * t; // reverse, continuing the flow
      const dist = SPREAD + r() * 30;
      const size = 9 + Math.floor(r() * 6);
      shapes.push(emit(`l${i}`, x, y, -dist, 0, Math.floor(160 + i * 30), size, bloom.colors));
    }

    return { shapes };
  }

  // marker: smaller, fewer shapes, mostly upward (article line below)
  const COUNT = bloom.markerCount;
  for (let i = 0; i < COUNT; i++) {
    const t = (i + 0.5) / COUNT + (r() - 0.5) * 0.08;
    const x = rect.left + rect.width * t;
    const y = rect.top;
    const dist = 22 + r() * 18;
    const size = 6 + Math.floor(r() * 4);
    const sideways = (r() - 0.5) * 18;
    shapes.push(emit(`m${i}`, x, y, sideways, -dist, Math.floor(i * 35), size, bloom.colors));
  }
  return { shapes };
}

function ShapeSvg({
  kind, color, outlined, size,
}: {
  kind: ShapeKind; color: string; outlined: boolean; size: number;
}) {
  const fill = outlined ? "none" : color;
  const stroke = outlined ? color : "none";
  const sw = outlined ? 2 : 0;
  const common = { width: size, height: size, viewBox: "0 0 24 24" };
  switch (kind) {
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill={fill} stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="12,3 21,21 3,21" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" fill={fill} stroke={stroke} strokeWidth={sw} transform="rotate(15 12 12)" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 4 V20 M4 12 H20" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "arc":
      return (
        <svg {...common}>
          <path d="M3 18 Q12 4 21 18" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export interface BloomLayerProps {
  spec: BloomSpec;
  onComplete?: () => void;
}

export function BloomLayer({ spec, onComplete }: BloomLayerProps) {
  useEffect(() => {
    if (!onComplete) return;
    // Longest delay (~190ms) + animation (720ms). Pad to 1100ms.
    const t = window.setTimeout(onComplete, 1100);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div className="bloom-layer-root" data-lumen-overlay="" aria-hidden="true">
      {spec.shapes.map((s) => (
        <span
          key={s.id}
          className="bloom-shape"
          style={{
            left: `${s.startX}px`,
            top: `${s.startY}px`,
            "--dx": `${s.dx}px`,
            "--dy": `${s.dy}px`,
            "--rot": `${s.rotate}deg`,
            "--delay": `${s.delay}ms`,
          } as React.CSSProperties}
        >
          <ShapeSvg kind={s.kind} color={s.color} outlined={s.outlined} size={s.size} />
        </span>
      ))}
    </div>
  );
}
