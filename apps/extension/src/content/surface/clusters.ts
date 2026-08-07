import type { Lens } from "@lumen/schema";
import { buildTextIndex, flatOffsetsToRange, rangeToFlatOffsets } from "@lumen/anchoring";

import type { ClusterHeatRect, ClusterHeatSegment } from "../types";

type RangeLookup = (lensId: string) => Range | null;

function stableJitter(input: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

export function buildClusterHeatSegments(
  pool: Lens[],
  visibleIds: Set<string>,
  getRange: RangeLookup,
): ClusterHeatSegment[] {
  const index = buildTextIndex(document.body);
  const spans = pool
    .map((lens) => {
      const range = getRange(lens.id);
      const offsets = range ? rangeToFlatOffsets(range, index) : null;
      if (!offsets || offsets.end <= offsets.start) return null;
      return {
        id: lens.id,
        start: offsets.start,
        end: offsets.end,
        visible: visibleIds.has(lens.id),
      };
    })
    .filter((span): span is { id: string; start: number; end: number; visible: boolean } => !!span);

  if (spans.length === 0) return [];

  const boundaries = [...new Set(spans.flatMap((span) => [span.start, span.end]))]
    .sort((a, b) => a - b);
  const segments: ClusterHeatSegment[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;

    const covering = spans.filter((span) => span.start < end && span.end > start);
    if (covering.length === 0 || !covering.some((span) => span.visible)) continue;

    const range = flatOffsetsToRange(start, end, index);
    if (!range) continue;
    segments.push({
      key: `${start}:${end}`,
      range,
      depth: covering.length,
    });
  }

  return segments;
}

export function buildClusterHeatRects(segments: ClusterHeatSegment[], tick: number): ClusterHeatRect[] {
  void tick;
  return segments.flatMap((segment) => (
    Array.from(segment.range.getClientRects())
      .filter((rect) => (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight &&
        rect.right >= 0 &&
        rect.left <= window.innerWidth
      ))
      .map((rect, index) => {
        const key = `${segment.key}:${index}`;
        return {
          key,
          depth: segment.depth,
          top: rect.top + 1 + stableJitter(key, 1) * 0.8,
          left: rect.left - 1 + stableJitter(key, 2) * 0.9,
          width: rect.width + 2 + stableJitter(key, 3) * 1.8,
          height: Math.max(4, rect.height - 1 + stableJitter(key, 4) * 1.4),
          rotate: stableJitter(key, 5) * 0.45,
          radius: 4.5 + stableJitter(key, 6) * 1.4,
        };
      })
  ));
}
