import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReadingMode } from "@lumen/schema";

import { redeem } from "./shared/api";
import { API_BASE } from "./shared/config";
import {
  getSiteHidden,
  getReadingMode,
  getTheme,
  getToken,
  getUser,
  logout,
  normalizeHost,
  setReadingMode as saveReadingMode,
  setSiteHidden,
  setTheme as saveTheme,
  setToken,
  setUser,
  type StoredUser,
} from "./shared/storage";
import { DEFAULT_THEME_ID, LUMEN_THEME_IDS, LUMEN_THEMES, type LumenThemeId } from "./theme";

const MODES: ReadingMode[] = ["quiet", "thinking", "full"];

const MODE_DESCRIPTIONS: Record<ReadingMode, string> = {
  quiet: "Minimal markers for calmer reading.",
  thinking: "Questions and knowledge stay visible.",
  full: "Everything on the page is visible.",
};

function hostForTabUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function Popup() {
  const [token, setTok] = useState<string | null>(null);
  const [user, setU] = useState<StoredUser | null>(null);
  const [mode, setMode] = useState<ReadingMode>("quiet");
  const [theme, setTheme] = useState<LumenThemeId>(DEFAULT_THEME_ID);
  const [currentHost, setCurrentHost] = useState<string | null>(null);
  const [siteHidden, setSiteHiddenState] = useState(false);
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [nextToken, nextUser, nextMode, nextTheme, tabs] = await Promise.all([
        getToken(),
        getUser(),
        getReadingMode(),
        getTheme(),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      const host = hostForTabUrl(tabs[0]?.url);
      setTok(nextToken);
      setU(nextUser);
      setMode(nextMode);
      setTheme(nextTheme);
      document.documentElement.dataset.lumenTheme = nextTheme;
      setCurrentHost(host);
      if (host) setSiteHiddenState(await getSiteHidden(host));
    }
    void load();
  }, []);

  async function onRedeem() {
    if (!handle.trim()) {
      setError("handle required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await redeem(handle.trim(), code.trim() || undefined);
      await setToken(r.token);
      await setUser({ userId: r.userId, handle: r.handle });
      setTok(r.token);
      setU({ userId: r.userId, handle: r.handle });
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    setTok(null);
    setU(null);
  }

  async function onModeChange(m: ReadingMode) {
    await saveReadingMode(m);
    setMode(m);
  }

  async function onThemeChange(nextTheme: LumenThemeId) {
    await saveTheme(nextTheme);
    setTheme(nextTheme);
    document.documentElement.dataset.lumenTheme = nextTheme;
  }

  async function onSiteHiddenChange(value: boolean) {
    if (!currentHost) return;
    await setSiteHidden(currentHost, value);
    setSiteHiddenState(value);
  }

  if (token && user) {
    return (
      <div className="popup">
        <h1>Lumen</h1>
        <p>
          Logged in as <strong>{user.handle}</strong>
        </p>

        <div className="mode-section">
          <label>Default reading mode</label>
          <div className="mode-buttons">
            {MODES.map((m) => (
              <button
                key={m}
                className={`mode-btn ${mode === m ? "active" : ""}`}
                onClick={() => onModeChange(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="mode-desc">{MODE_DESCRIPTIONS[mode]} You can also switch this from the page panel.</p>
        </div>

        <div className="theme-section">
          <label>UI skin</label>
          <div className="theme-buttons">
            {LUMEN_THEME_IDS.map((id) => (
              <button
                key={id}
                className={`theme-btn ${theme === id ? "active" : ""}`}
                onClick={() => onThemeChange(id)}
              >
                <span>{LUMEN_THEMES[id].label}</span>
              </button>
            ))}
          </div>
          <p className="mode-desc">{LUMEN_THEMES[theme].description}</p>
        </div>

        {currentHost && (
          <label className="site-toggle">
            <input
              type="checkbox"
              checked={siteHidden}
              onChange={(e) => void onSiteHiddenChange(e.currentTarget.checked)}
            />
            <span>Disable Lumen on {currentHost}</span>
          </label>
        )}

        <p className="hint">
          Page controls live in the Lumen panel on each webpage.
        </p>
        <a className="privacy-link" href={`${API_BASE}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </div>
    );
  }

  return (
    <div className="popup">
      <h1>Lumen</h1>
      <p className="hint">Choose a handle to start.</p>
      <label>Handle</label>
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. alice" />
      <label>Invite code <span className="optional">optional</span></label>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="leave blank" />
      <button onClick={onRedeem} disabled={busy}>{busy ? "Starting..." : "Start"}</button>
      <a className="privacy-link" href={`${API_BASE}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
