// Content script entry. Injected into whitelisted pages by the manifest.
//
// Responsibilities:
//   - render existing Lens as CSS Highlight markers
//   - capture user text selection -> show "Create Lens" button -> composer
//   - WebSocket subscription to the page's room (lens_created, presence_*)
//   - mount React overlay inside Shadow DOM so page CSS doesn't leak in
//
// MVP NOTE: WebSocket is owned here, not the service worker. See README.md.

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WebSocket as ReconnectingWS } from "partysocket";
import type { Lens, LensAnchor, LensType } from "@lumen/schema";

import { canonicalizeUrl, roomIdFor } from "./shared/canonicalize";
import { getToken, getUser } from "./shared/storage";
import { fetchLensesForRoom, createLens } from "./shared/api";
import { WS_BASE } from "./shared/config";
import { findAnchor, createAnchor } from "./anchoring";
import {
  applyHighlight,
  clearAllHighlights,
  getRangeForLens,
  injectMarkerStyles,
  lensAtPoint,
  removeHighlight,
} from "./marker";

import overlayCss from "./styles.css?inline";

const LENS_TYPES: LensType[] = ["quick", "fun", "question", "knowledge"];

interface SelectionDraft {
  range: Range;
  text: string;
  rect: DOMRect;
}

function Overlay({ url, roomId, canonical }: { url: string; roomId: string; canonical: string }) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [activeLensId, setActiveLensId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [hidden, setHidden] = useState(false);

  const wsRef = useRef<ReconnectingWS | null>(null);

  // Load token once
  useEffect(() => {
    getToken().then(setToken);
  }, []);

  // Initial fetch + render markers
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchLensesForRoom(roomId, token)
      .then((ls) => {
        if (cancelled) return;
        setLenses(ls);
        for (const lens of ls) {
          const range = findAnchor(lens.anchor);
          if (range) applyHighlight(lens.id, range);
        }
      })
      .catch((err) => console.warn("[Lumen] fetchLenses failed:", err));
    return () => {
      cancelled = true;
      clearAllHighlights();
    };
  }, [token, roomId]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    const ws = new ReconnectingWS(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", roomId }));
    });
    ws.addEventListener("close", () => setWsConnected(false));
    ws.addEventListener("message", (e: MessageEvent) => {
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "");
      } catch {
        return;
      }
      if (msg.type === "subscribed") {
        setPresence((msg.presence as string[]) ?? []);
      } else if (msg.type === "presence_join") {
        setPresence((p) => [...new Set([...p, msg.userId as string])]);
      } else if (msg.type === "presence_leave") {
        setPresence((p) => p.filter((u) => u !== (msg.userId as string)));
      } else if (msg.type === "lens_created") {
        const lens = msg.lens as Lens;
        setLenses((prev) => (prev.some((l) => l.id === lens.id) ? prev : [...prev, lens]));
        const range = findAnchor(lens.anchor);
        if (range) applyHighlight(lens.id, range);
      }
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, roomId]);

  // Capture text selection
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      // Don't fire if click landed inside our overlay
      const target = e.target as Node | null;
      if (target && (target as Element).closest?.("#lumen-root, [data-lumen-overlay]")) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setDraft(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const text = range.toString().trim();
      if (text.length < 3) {
        setDraft(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setDraft({ range: range.cloneRange(), text, rect });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  // Click handler for highlights
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (target && (target as Element).closest?.("#lumen-root, [data-lumen-overlay]")) return;
      const id = lensAtPoint(e.clientX, e.clientY);
      if (id) {
        setActiveLensId(id);
        setDraft(null);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function publish(input: { type: LensType; body: string; tags: string[] }) {
    if (!token || !draft) return;
    const anchor = createAnchor(draft.range);
    await createLens(
      {
        roomId,
        url: canonical,
        type: input.type,
        body: input.body,
        anchor,
        tags: input.tags,
      },
      token,
    );
    // The WS broadcast will populate the local list; nothing to do here.
    setComposerOpen(false);
    setDraft(null);
    window.getSelection()?.removeAllRanges();
  }

  if (!token) return <NoTokenHint />;
  if (hidden) return <Orb count={lenses.length} live={wsConnected} onToggle={() => setHidden(false)} />;

  const activeLens = activeLensId ? lenses.find((l) => l.id === activeLensId) ?? null : null;
  const others = presence.length;

  return (
    <>
      <Orb count={lenses.length} live={wsConnected} others={others} onToggle={() => setHidden(true)} />
      {draft && !composerOpen && (
        <CreateButton draft={draft} onClick={() => setComposerOpen(true)} />
      )}
      {composerOpen && draft && (
        <Composer
          draft={draft}
          onCancel={() => {
            setComposerOpen(false);
            setDraft(null);
          }}
          onSubmit={publish}
        />
      )}
      {activeLens && <LensCard lens={activeLens} onClose={() => setActiveLensId(null)} />}
    </>
  );
}

function Orb({ count, live, others = 0, onToggle }: { count: number; live: boolean; others?: number; onToggle: () => void }) {
  return (
    <button className="orb" onClick={onToggle}>
      <span className={`dot ${live ? "" : "idle"}`} />
      <span>{count} lens</span>
      {others > 0 && <span style={{ color: "#888", fontWeight: 500 }}>· {others} here</span>}
    </button>
  );
}

function NoTokenHint() {
  return (
    <div className="no-token-hint">
      <strong>Lumen</strong>
      <div style={{ marginTop: 4 }}>
        Click the extension icon to redeem an invite, then reload this page.
      </div>
    </div>
  );
}

function CreateButton({ draft, onClick }: { draft: SelectionDraft; onClick: () => void }) {
  const top = Math.min(window.innerHeight - 50, draft.rect.bottom + 6);
  const left = Math.max(8, Math.min(window.innerWidth - 130, draft.rect.left));
  return (
    <button
      className="create-button"
      style={{ top, left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      Create Lens
    </button>
  );
}

function Composer({
  draft,
  onCancel,
  onSubmit,
}: {
  draft: SelectionDraft;
  onCancel: () => void;
  onSubmit: (input: { type: LensType; body: string; tags: string[] }) => void | Promise<void>;
}) {
  const [type, setType] = useState<LensType>("quick");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const top = Math.min(window.innerHeight - 320, draft.rect.bottom + 12);
  const left = Math.max(8, Math.min(window.innerWidth - 380, draft.rect.left));

  async function submit() {
    if (!body.trim()) {
      setError("Body required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      await onSubmit({ type, body: body.trim(), tags });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer" style={{ top, left }} data-lumen-overlay="">
      <div className="quote-preview">"{draft.text.slice(0, 200)}"</div>
      <div>
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value as LensType)}>
          {LENS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label>Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
      </div>
      <div>
        <label>Tags (comma-separated)</label>
        <input type="text" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </div>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy}>{busy ? "Posting…" : "Publish"}</button>
      </div>
    </div>
  );
}

function LensCard({ lens, onClose }: { lens: Lens; onClose: () => void }) {
  const range = getRangeForLens(lens.id);
  const rect = range?.getBoundingClientRect();
  const top = rect ? Math.min(window.innerHeight - 280, rect.bottom + 8) : 96;
  const left = rect ? Math.max(8, Math.min(window.innerWidth - 360, rect.left)) : 24;
  const quote = lens.anchor?.quote?.exact ?? "";

  return (
    <section className="card" style={{ top, left }} data-lumen-overlay="">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <div className="meta">
        <span className="pill">{lens.type}</span>
        {(lens.tags ?? []).map((t) => <span key={t} className="pill" style={{ background: "#f0f0f0", color: "#555" }}>{t}</span>)}
        <span>@{lens.author?.handle ?? "unknown"}</span>
      </div>
      {quote && <div className="quote">"{quote.slice(0, 160)}"</div>}
      <div className="body">{lens.body}</div>
    </section>
  );
}

// --- bootstrap ---

async function boot() {
  if (document.getElementById("lumen-root")) return;

  const url = window.location.href;
  let roomId: string;
  let canonical: string;
  try {
    canonical = canonicalizeUrl(url);
    roomId = await roomIdFor(url);
  } catch (err) {
    console.warn("[Lumen] could not derive room from URL, aborting:", err);
    return;
  }

  injectMarkerStyles();

  // Shadow DOM host for the React overlay
  const host = document.createElement("div");
  host.id = "lumen-root";
  // Reset host element styles so the page's CSS can't bleed into us
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = overlayCss;
  shadow.appendChild(styleEl);
  const mount = document.createElement("div");
  mount.setAttribute("data-lumen-overlay", "");
  shadow.appendChild(mount);

  createRoot(mount).render(<Overlay url={url} roomId={roomId} canonical={canonical} />);
}

void boot();
