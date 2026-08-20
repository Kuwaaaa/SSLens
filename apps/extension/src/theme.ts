export const LUMEN_THEME_IDS = ["classic", "signal"] as const;

export type LumenThemeId = (typeof LUMEN_THEME_IDS)[number];

export interface LumenThemeProfile {
  id: LumenThemeId;
  label: string;
  description: string;
  marker: {
    primary: string;
    cluster2: string;
    cluster3: string;
    cluster4: string;
  };
  bloom: {
    colors: string[];
    spread: number;
    cardOpenCount: {
      top: number;
      bottom: number;
      side: number;
    };
    markerCount: number;
  };
}

export const DEFAULT_THEME_ID: LumenThemeId = "classic";

export const LUMEN_THEMES: Record<LumenThemeId, LumenThemeProfile> = {
  classic: {
    id: "classic",
    label: "Classic",
    description: "Soft purple and amber, matching lumen's current card-and-bloom language.",
    marker: {
      primary: "#6b21a8",
      cluster2: "#b45309",
      cluster3: "#b45309",
      cluster4: "#92400e",
    },
    bloom: {
      colors: ["#8b5cf6", "#7c3aed", "#f59e0b"],
      spread: 55,
      cardOpenCount: { top: 4, bottom: 4, side: 2 },
      markerCount: 4,
    },
  },
  signal: {
    id: "signal",
    label: "Signal",
    description: "A sharper night-reading skin with cyan signal lines and ember accents.",
    marker: {
      primary: "#0891b2",
      cluster2: "#d97706",
      cluster3: "#ea580c",
      cluster4: "#c2410c",
    },
    bloom: {
      colors: ["#22d3ee", "#38bdf8", "#f97316", "#facc15"],
      spread: 64,
      cardOpenCount: { top: 3, bottom: 3, side: 2 },
      markerCount: 3,
    },
  },
};

export function normalizeThemeId(value: unknown): LumenThemeId {
  return LUMEN_THEME_IDS.includes(value as LumenThemeId)
    ? (value as LumenThemeId)
    : DEFAULT_THEME_ID;
}

