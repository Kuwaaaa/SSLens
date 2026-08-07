import type { ClusterHeatRect } from "../types";

export function ClusterHeatOverlay({ rects }: { rects: ClusterHeatRect[] }) {
  return (
    <div className="cluster-heat-layer" data-lumen-overlay="" aria-hidden="true">
      {rects.map((rect) => (
        <span
          key={rect.key}
          className={`cluster-heat depth-${Math.min(rect.depth, 4)}`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: rect.radius,
            transform: `rotate(${rect.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
