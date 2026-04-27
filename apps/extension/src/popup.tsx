import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReadingMode } from "@lumen/schema";

import { redeem } from "./shared/api";
import { API_BASE } from "./shared/config";
import {
  getSiteHidden,
  getReadingMode,
  getToken,
  getUser,
  logout,
  normalizeHost,
  setReadingMode as saveReadingMode,
  setSiteHidden,
  setToken,
  setUser,
  type StoredUser,
} from "./shared/storage";

const MODES: ReadingMode[] = ["quiet", "thinking", "full"];

const MODE_DESCRIPTIONS: Record<ReadingMode, string> = {
  quiet: "Minimal — knowledge & challenges only",
  thinking: "Show questions, knowledge, challenges",
  full: "Show everything — including jokes and polls",
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
  const [currentHost, setCurrentHost] = useState<string | null>(null);
  const [siteHidden, setSiteHiddenState] = useState(false);
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [nextToken, nextUser, nextMode, tabs] = await Promise.all([
        getToken(),
        getUser(),
        getReadingMode(),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      const host = hostForTabUrl(tabs[0]?.url);
      setTok(nextToken);
      setU(nextUser);
      setMode(nextMode);
      setCurrentHost(host);
      if (host) setSiteHiddenState(await getSiteHidden(host));
    }
    void load();
  }, []);

  async function onRedeem() {
    if (!code.trim() || !handle.trim()) {
      setError("code and handle required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await redeem(code.trim(), handle.trim());
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
          <label>Reading mode</label>
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
          <p className="mode-desc">{MODE_DESCRIPTIONS[mode]}</p>
        </div>

        {currentHost && (
          <label className="site-toggle">
            <input
              type="checkbox"
              checked={siteHidden}
              onChange={(e) => void onSiteHiddenChange(e.currentTarget.checked)}
            />
            <span>Hide on {currentHost}</span>
          </label>
        )}

        <p className="hint">
          Open one of the whitelisted pages to use the overlay.
        </p>
        <a className="privacy-link" href={`${API_BASE}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </div>
    );
  }

  return (
    <div className="popup">
      <h1>Lumen</h1>
      <p className="hint">Redeem an invite code to start.</p>
      <label>Invite code</label>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. UDC6PP6A" />
      <label>Handle</label>
      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. alice" />
      <button onClick={onRedeem} disabled={busy}>{busy ? "Redeeming…" : "Redeem"}</button>
      <a className="privacy-link" href={`${API_BASE}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
