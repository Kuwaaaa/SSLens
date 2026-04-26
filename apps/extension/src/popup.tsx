import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { redeem } from "./shared/api";
import { getToken, getUser, logout, setToken, setUser, type StoredUser } from "./shared/storage";

function Popup() {
  const [token, setTok] = useState<string | null>(null);
  const [user, setU] = useState<StoredUser | null>(null);
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getToken().then(setTok);
    getUser().then(setU);
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

  if (token && user) {
    return (
      <div className="popup">
        <h1>Lumen</h1>
        <p>
          Logged in as <strong>{user.handle}</strong>
        </p>
        <p className="hint">
          Open one of the whitelisted pages (e.g. paulgraham.com) to use the overlay.
        </p>
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
      {error && <p className="err">{error}</p>}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
