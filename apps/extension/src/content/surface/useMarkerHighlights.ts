import { useEffect } from "react";
import type { Lens } from "@lumen/schema";

import {
  applyClusterHighlight,
  applyHighlight,
  clearAllClusterHighlights,
  clearAllHighlights,
} from "../../marker";
import type { ClusterHeatSegment } from "../types";

interface UseMarkerHighlightsOptions {
  visibleLenses: Lens[];
  clusterHeatSegments: ClusterHeatSegment[];
  getRange: (lensId: string) => Range | null;
}

export function useMarkerHighlights({
  visibleLenses,
  clusterHeatSegments,
  getRange,
}: UseMarkerHighlightsOptions): void {
  useEffect(() => {
    clearAllHighlights();
    for (const lens of visibleLenses) {
      const range = getRange(lens.id);
      if (range) applyHighlight(lens.id, range);
    }
    return () => clearAllHighlights();
  }, [visibleLenses, getRange]);

  useEffect(() => {
    clearAllClusterHighlights();
    for (const segment of clusterHeatSegments) {
      if (segment.depth >= 2) {
        applyClusterHighlight(segment.key, segment.range, segment.depth);
      }
    }
    return () => clearAllClusterHighlights();
  }, [clusterHeatSegments]);
}
