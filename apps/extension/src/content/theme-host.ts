import type { ReadingMode } from "@lumen/schema";

import { injectMarkerStyles, setMarkerTheme } from "../marker";
import type { LumenThemeId } from "../theme";

let lumenHost: HTMLElement | null = null;

export function setThemeHostElement(host: HTMLElement): void {
  lumenHost = host;
}

export function initializeMarkerTheme(themeId: LumenThemeId): void {
  injectMarkerStyles(themeId);
}

export function applyThemeAttributes(themeId: LumenThemeId, mode?: ReadingMode): void {
  if (!lumenHost) return;
  lumenHost.dataset.lumenTheme = themeId;
  if (mode) lumenHost.dataset.lumenMode = mode;
}

export function applyRuntimeTheme(themeId: LumenThemeId, mode?: ReadingMode): void {
  applyThemeAttributes(themeId, mode);
  setMarkerTheme(themeId);
}
