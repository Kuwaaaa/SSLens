import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReadingMode } from "@lumen/schema";

import {
  getReadingMode,
  getSiteHidden,
  getTheme,
  getToken,
  getUser,
  KEY_HIDDEN_SITES,
  KEY_READING_MODE,
  KEY_THEME,
  KEY_TOKEN,
  KEY_USER,
  normalizeHost,
  logout,
  setReadingMode as saveReadingMode,
  setTheme as saveTheme,
  type StoredUser,
} from "../../shared/storage";
import { DEFAULT_THEME_ID, normalizeThemeId, type LumenThemeId } from "../../theme";
import { applyRuntimeTheme } from "../theme-host";

interface UseOverlaySettingsInput {
  url: string;
  canonical: string;
}

export function hostForUrl(input: string): string {
  try {
    return normalizeHost(new URL(input).hostname);
  } catch {
    return normalizeHost(window.location.hostname);
  }
}

export function useOverlaySettings({ url, canonical }: UseOverlaySettingsInput) {
  const siteHost = useMemo(() => hostForUrl(canonical || url), [canonical, url]);
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("quiet");
  const [themeId, setThemeId] = useState<LumenThemeId>(DEFAULT_THEME_ID);
  const [siteHidden, setSiteHiddenState] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const lumenHidden = siteHidden || tabHidden;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getToken(), getUser(), getReadingMode(), getTheme(), getSiteHidden(siteHost)])
      .then(([nextToken, nextUser, nextMode, nextTheme, hidden]) => {
        if (cancelled) return;
        setToken(nextToken);
        setCurrentUser(nextUser);
        setReadingMode(nextMode);
        setThemeId(nextTheme);
        setSiteHiddenState(hidden);
      })
      .catch((err) => {
        console.warn("[lumen] settings load failed:", err);
      })
      .finally(() => {
        if (!cancelled) setSettingsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [siteHost]);

  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      const tokenChange = changes[KEY_TOKEN];
      if (tokenChange) setToken((tokenChange.newValue as string | undefined) ?? null);
      const userChange = changes[KEY_USER];
      if (userChange) setCurrentUser((userChange.newValue as StoredUser | undefined) ?? null);
      const modeChange = changes[KEY_READING_MODE];
      if (modeChange) setReadingMode((modeChange.newValue as ReadingMode | undefined) ?? "quiet");
      const themeChange = changes[KEY_THEME];
      if (themeChange) setThemeId(normalizeThemeId(themeChange.newValue));
      const hiddenChange = changes[KEY_HIDDEN_SITES];
      if (hiddenChange) {
        const next = (hiddenChange.newValue as Record<string, boolean> | undefined) ?? {};
        setSiteHiddenState(next[siteHost] === true);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [siteHost]);

  useEffect(() => {
    applyRuntimeTheme(themeId, readingMode);
  }, [themeId, readingMode]);

  const changeReadingMode = useCallback(async (mode: ReadingMode) => {
    await saveReadingMode(mode);
    setReadingMode(mode);
  }, []);

  const changeTheme = useCallback(async (theme: LumenThemeId) => {
    await saveTheme(theme);
    setThemeId(theme);
  }, []);

  const hideTab = useCallback(() => {
    setTabHidden(true);
  }, []);

  const restoreTab = useCallback(() => {
    setTabHidden(false);
  }, []);

  const clearAuthState = useCallback(() => {
    setToken(null);
    setCurrentUser(null);
  }, []);

  const handleAuthRejected = useCallback(async () => {
    await logout();
    clearAuthState();
  }, [clearAuthState]);

  return {
    siteHost,
    token,
    currentUser,
    readingMode,
    themeId,
    siteHidden,
    tabHidden,
    settingsReady,
    lumenHidden,
    changeReadingMode,
    changeTheme,
    hideTab,
    restoreTab,
    handleAuthRejected,
  };
}
