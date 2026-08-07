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
  const currentHost = typeof document === "undefined"
    ? null
    : document.getElementById("lumen-root") as HTMLElement | null;
  const hosts = new Set([lumenHost, currentHost].filter((host): host is HTMLElement => !!host));
  for (const host of hosts) {
    host.dataset.lumenTheme = themeId;
    if (mode) host.dataset.lumenMode = mode;
  }
  if (currentHost) lumenHost = currentHost;
}

export function applyRuntimeTheme(themeId: LumenThemeId, mode?: ReadingMode): void {
  applyThemeAttributes(themeId, mode);
  setMarkerTheme(themeId);
}
