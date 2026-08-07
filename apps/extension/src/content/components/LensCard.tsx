import { useEffect, useRef, useState } from "react";
import type { Lens, ReactionKind } from "@lumen/schema";

import type { CardPosition } from "../types";
import { LensPanel } from "./LensPanel";

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 280;
const DEFAULT_CLUSTER_SIBLINGS = 2;
const VIEWPORT_GUTTER = 8;

interface LensCardProps {
  lenses: Lens[];
  clusterCount: number;
  rootAnchorRange: Range | null;
  hasAnchor: (id: string) => boolean;
  onJumpToAnchor: (id: string) => void;
  knownLenses?: Lens[];
  onLensClick?: (id: string) => void;
  onReact: (id: string, kind: ReactionKind) => void | Promise<void>;
  onMount?: (rect: DOMRect) => void;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function positionCardNear(
  anchorRect: DOMRect | null | undefined,
  cardRect?: DOMRect | null,
): CardPosition {
  if (!anchorRect) return { top: 96, left: 24 };

  const cardWidth = Math.min(CARD_WIDTH, Math.max(160, window.innerWidth - 32));
  const cardHeight = Math.min(
    cardRect?.height ?? CARD_HEIGHT_ESTIMATE,
    Math.max(80, window.innerHeight - VIEWPORT_GUTTER * 2),
  );
  const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - cardWidth - VIEWPORT_GUTTER);
  const below = anchorRect.bottom + 8;
  const above = anchorRect.top - cardHeight - 8;
  const hasRoomBelow = below + cardHeight <= window.innerHeight - VIEWPORT_GUTTER;
  const preferredTop = hasRoomBelow || above < VIEWPORT_GUTTER ? below : above;
  const maxTop = Math.max(VIEWPORT_GUTTER, window.innerHeight - cardHeight - VIEWPORT_GUTTER);

  return {
    top: clamp(preferredTop, VIEWPORT_GUTTER, maxTop),
    left: clamp(anchorRect.left, VIEWPORT_GUTTER, maxLeft),
  };
}

export function LensCard({
  lenses,
  clusterCount,
  rootAnchorRange,
  hasAnchor,
  onJumpToAnchor,
  knownLenses,
  onLensClick,
  onReact,
  onMount,
}: LensCardProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const expandableRef = useRef<HTMLDivElement>(null);
  const [clusterExpanded, setClusterExpanded] = useState(false);
  const [expandableHeight, setExpandableHeight] = useState(0);
  const [position, setPosition] = useState<CardPosition>(() =>
    positionCardNear(rootAnchorRange?.getBoundingClientRect()),
  );
  const rootLens = lenses[0] ?? null;
  const clusterSiblings = lenses.slice(1, clusterCount);
  const referencedLenses = lenses.slice(clusterCount);
  const visibleClusterSiblings = clusterSiblings.slice(0, DEFAULT_CLUSTER_SIBLINGS);
  const expandableClusterSiblings = clusterSiblings.slice(DEFAULT_CLUSTER_SIBLINGS);
  const primaryLenses = [
    ...(rootLens ? [rootLens] : []),
    ...visibleClusterSiblings,
  ];

  useEffect(() => {
    if (sectionRef.current && onMount) {
      onMount(sectionRef.current.getBoundingClientRect());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = expandableRef.current;
    if (!el) {
      setExpandableHeight(0);
      return;
    }
    const measure = () => setExpandableHeight(el.scrollHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expandableClusterSiblings.length, clusterExpanded]);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const next = positionCardNear(
        rootAnchorRange?.getBoundingClientRect(),
        sectionRef.current?.getBoundingClientRect(),
      );
      setPosition((prev) => (
        prev.top === next.top && prev.left === next.left ? prev : next
      ));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [rootAnchorRange, lenses.length, clusterCount, clusterExpanded]);

  return (
    <section ref={sectionRef} className="card card-stack" style={position} data-lumen-overlay="">
      {clusterCount > 1 && (
        <div className="cluster-note">{clusterCount} Lens on this passage</div>
      )}
      {primaryLenses.map((lens, index) => (
        <LensPanel
          key={lens.id}
          lens={lens}
          depth={index}
          stackLabel={index > 0 && index <= visibleClusterSiblings.length ? "Same passage" : "Referenced lens"}
          hasAnchor={hasAnchor(lens.id)}
          knownLenses={knownLenses}
          onLensClick={onLensClick}
          onReact={onReact}
          onJumpToAnchor={() => onJumpToAnchor(lens.id)}
        />
      ))}
      {expandableClusterSiblings.length > 0 && (
        <div className={`collapsed-cluster ${clusterExpanded ? "hidden" : ""}`}>
          <div className="stack-label">Same passage</div>
          {expandableClusterSiblings.slice(0, 3).map((lens) => (
            <button
              key={lens.id}
              type="button"
              className="collapsed-lens"
              onClick={() => setClusterExpanded(true)}
            >
              <span className="pill">{lens.type}</span>
              <span>@{lens.author?.handle ?? "unknown"}</span>
              <span className="collapsed-body">{lens.body.slice(0, 72)}</span>
            </button>
          ))}
          <button className="show-more-lens" onClick={() => setClusterExpanded(true)}>
            Show {expandableClusterSiblings.length} more
          </button>
        </div>
      )}
      {expandableClusterSiblings.length > 0 && (
        <div
          className={`expandable-cluster ${clusterExpanded ? "expanded" : ""}`}
          style={{ maxHeight: clusterExpanded ? expandableHeight : 0 }}
          aria-hidden={!clusterExpanded}
        >
          <div ref={expandableRef} className="expandable-cluster-inner">
            {expandableClusterSiblings.map((lens, index) => (
              <LensPanel
                key={lens.id}
                lens={lens}
                depth={visibleClusterSiblings.length + index + 1}
                stackLabel="Same passage"
                hasAnchor={hasAnchor(lens.id)}
                knownLenses={knownLenses}
                onLensClick={onLensClick}
                onReact={onReact}
                onJumpToAnchor={() => onJumpToAnchor(lens.id)}
              />
            ))}
          </div>
        </div>
      )}
      {clusterExpanded && expandableClusterSiblings.length > 0 && (
        <button className="show-more-lens collapse" onClick={() => setClusterExpanded(false)}>
          Collapse same-passage Lens
        </button>
      )}
      {referencedLenses.map((lens, index) => (
        <LensPanel
          key={lens.id}
          lens={lens}
          depth={primaryLenses.length + expandableClusterSiblings.length + index}
          stackLabel="Referenced lens"
          hasAnchor={hasAnchor(lens.id)}
          knownLenses={knownLenses}
          onLensClick={onLensClick}
          onReact={onReact}
          onJumpToAnchor={() => onJumpToAnchor(lens.id)}
        />
      ))}
    </section>
  );
}
