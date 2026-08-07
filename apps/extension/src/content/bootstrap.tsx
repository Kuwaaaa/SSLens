import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { canonicalizeUrl, canonicalUrlFromDocument, roomIdFor } from "../shared/canonicalize";
import { getReadingMode, getTheme } from "../shared/storage";
import overlayCss from "../styles.css?inline";
import { installRouteRefreshHooks } from "./route-runtime";
import { initializeMarkerTheme, setThemeHostElement } from "./theme-host";

interface OverlayProps {
  url: string;
  roomId: string;
  canonical: string;
}

let lumenRoot: Root | null = null;
let lumenMount: HTMLElement | null = null;
let bootUrl: string | null = null;

async function renderForCurrentPage(renderOverlay: (props: OverlayProps) => ReactNode): Promise<void> {
  const mount = lumenMount;
  if (!mount) return;

  const url = window.location.href;
  let roomId: string;
  let canonical: string;
  try {
    const documentCanonical = canonicalUrlFromDocument();
    canonical = canonicalizeUrl(url, documentCanonical);
    roomId = await roomIdFor(url, documentCanonical);
  } catch (err) {
    console.warn("[Lumen] could not derive room from URL, aborting:", err);
    return;
  }

  bootUrl = url;
  if (!lumenRoot) lumenRoot = createRoot(mount);
  lumenRoot.render(renderOverlay({ url, roomId, canonical }));
}

export async function bootContentRuntime(renderOverlay: (props: OverlayProps) => ReactNode): Promise<void> {
  if (document.getElementById("lumen-root")) return;

  const [theme, readingMode] = await Promise.all([getTheme(), getReadingMode()]);
  initializeMarkerTheme(theme);

  const host = document.createElement("div");
  host.id = "lumen-root";
  host.dataset.lumenTheme = theme;
  host.dataset.lumenMode = readingMode;
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(host);
  setThemeHostElement(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = overlayCss;
  shadow.appendChild(styleEl);
  const mount = document.createElement("div");
  mount.setAttribute("data-lumen-overlay", "");
  shadow.appendChild(mount);
  lumenMount = mount;

  installRouteRefreshHooks({
    shouldRefresh: () => window.location.href !== bootUrl,
    onRefresh: () => void renderForCurrentPage(renderOverlay),
  });

  await renderForCurrentPage(renderOverlay);
}
