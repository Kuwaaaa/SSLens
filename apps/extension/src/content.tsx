// Content script entry. Injected into whitelisted pages by the manifest.
//
// Responsibilities:
//   - render existing Lens as CSS Highlight markers (filtered by reading mode)
//   - capture user text selection -> show "Create Lens" button -> composer
//   - WebSocket subscription to the page's room (lens_created, presence_*)
//   - mount React overlay inside Shadow DOM so page CSS doesn't leak in
//   - track anchor recovery; surface orphan Lens through info panel
//
// MVP NOTE: WebSocket is owned here, not the service worker. See README.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { WebSocket as ReconnectingWS } from "partysocket";
import type { Lens, LensType, ReadingMode } from "@lumen/schema";

import { canonicalizeUrl, roomIdFor } from "./shared/canonicalize";
import { getReadingMode, getToken, KEY_READING_MODE } from "./shared/storage";
import { fetchLensesForRoom, createLens } from "./shared/api";
import { WS_BASE } from "./shared/config";
import { createAnchor, restoreAnchor } from "@lumen/anchoring";
import {
  applyHighlight,
  clearAllHighlights,
  getRangeForLens,
  injectMarkerStyles,
  lensAtPoint,
} from "./marker";
import { RenderBody } from "./refs";
import { BloomLayer, makeBloomSpec, type BloomIntent, type BloomSpec } from "./shapes";

import overlayCss from "./styles.css?inline";

const LENS_TYPES: LensType[] = ["quick", "fun", "question", "knowledge"];

interface SelectionDraft {
  range: Range;
  text: string;
  rect: DOMRect;
}

// Reading-mode filter. Quiet keeps the page nearly clean; Thinking adds
// questions; Full shows everything. Featured Lens always show.
//
// TODO: when featured/saved/friends signals exist, Quiet should restrict
// to those instead of relying on type alone.
function shouldShowInMode(lens: Lens, mode: ReadingMode): boolean {
  if (mode === "full") return true;
  if (lens.featured) return true;
  if (mode === "thinking") {
    return ["question", "knowledge", "challenge"].includes(lens.type);
  }
  // quiet
  return ["knowledge", "challenge"].includes(lens.type);
}

function Overlay({ url, roomId, canonical }: { url: string; roomId: string; canonical: string }) {
  const [lenses, setLenses] = useState<Lens[]>([]);
  // --- Orphan handling ---
  // When restoreAnchor() returns null (DOM has shifted too much for any of
  // TextPosition / TextQuote+context / fuzzy fallback to find the text),
  // we mark the Lens as orphan and surface it through InfoPanel.
  //
  // MANUAL VERIFICATION DEFERRED. The path is implemented but not yet
  // confirmed end-to-end on a live page. Test recipes (in priority order):
  //   1. /admin console: create a Lens with a `Quote` that doesn't appear
  //      on the page (e.g. "ZZZ_NOT_ON_PAGE"). Reload the extension page;
  //      it should land in InfoPanel's "Orphan lens" section.
  //   2. Chrome DevTools "Sources -> Overrides" to persist hand-edits that
  //      scramble previously-anchored quotes.
  //   3. Direct SQLite: UPDATE lenses SET anchor='{"quote":{"exact":"NX"}}'
  //      WHERE id='...';
  //
  // TODO: also build a re-anchor flow (user re-selects text -> rebind ->
  // PATCH server). Currently orphan Lens are visible but not repairable.
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [presence, setPresence] = useState<string[]>([]);
  const [activeLensId, setActiveLensId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("quiet");
  const [wsConnected, setWsConnected] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const anchorRanges = useRef<Map<string, Range>>(new Map());

  // --- Geometric shape blooms ---
  // Small SVG primitives that emerge from behind a card (or beside a new
  // marker). See shapes.tsx + the `lumen-bloom` keyframe in styles.css.
  const [blooms, setBlooms] = useState<Array<{ id: string; spec: BloomSpec }>>([]);
  const triggerBloom = useCallback(
    (rect: DOMRect, intent: BloomIntent) => {
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBlooms((b) => [...b, { id, spec: makeBloomSpec(rect, intent) }]);
    },
    [],
  );
  const removeBloom = useCallback((id: string) => {
    setBlooms((b) => b.filter((x) => x.id !== id));
  }, []);

  // Load token + reading mode
  useEffect(() => {
    getToken().then(setToken);
    getReadingMode().then(setReadingMode);
  }, []);

  // Listen for mode changes from popup (or another tab)
  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      const c = changes[KEY_READING_MODE];
      if (c) setReadingMode((c.newValue as ReadingMode | undefined) ?? "quiet");
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Initial fetch: hydrate ranges + orphan set
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchLensesForRoom(roomId, token)
      .then((ls) => {
        if (cancelled) return;
        anchorRanges.current.clear();
        const orphans = new Set<string>();
        for (const lens of ls) {
          const range = restoreAnchor(lens.anchor);
          if (range) anchorRanges.current.set(lens.id, range);
          else orphans.add(lens.id);
        }
        setOrphanIds(orphans);
        setLenses(ls);
      })
      .catch((err) => console.warn("[Lumen] fetchLenses failed:", err));
    return () => {
      cancelled = true;
      anchorRanges.current.clear();
      clearAllHighlights();
    };
  }, [token, roomId]);

  // WebSocket
  useEffect(() => {
    if (!token) return;
    const ws = new ReconnectingWS(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);

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
        // Dedup against the always-current ref Map
        if (!anchorRanges.current.has(lens.id)) {
          const range = restoreAnchor(lens.anchor);
          if (range) {
            anchorRanges.current.set(lens.id, range);
            // Pop a small bloom near the new marker once highlight has rendered.
            window.setTimeout(() => {
              const r = range.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                triggerBloom(r, "marker");
              }
            }, 80);
          } else {
            setOrphanIds((s) => {
              if (s.has(lens.id)) return s;
              const next = new Set(s);
              next.add(lens.id);
              return next;
            });
          }
        }
        setLenses((prev) => (prev.some((l) => l.id === lens.id) ? prev : [...prev, lens]));
      }
    });

    return () => {
      ws.close();
    };
  }, [token, roomId]);

  // Visible lenses = not orphan + passes mode filter
  const visibleLenses = useMemo(
    () => lenses.filter((l) => !orphanIds.has(l.id) && shouldShowInMode(l, readingMode)),
    [lenses, orphanIds, readingMode],
  );

  // Apply highlights for visible lenses, clear hidden ones
  useEffect(() => {
    clearAllHighlights();
    for (const lens of visibleLenses) {
      const range = anchorRanges.current.get(lens.id);
      if (range) applyHighlight(lens.id, range);
    }
  }, [visibleLenses]);

  // Auto-close active card if its lens got filtered out
  useEffect(() => {
    if (activeLensId && !visibleLenses.find((l) => l.id === activeLensId)) {
      setActiveLensId(null);
    }
  }, [activeLensId, visibleLenses]);

  // Capture text selection
  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
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

  async function publish(input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) {
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
        anonymous: input.anonymous,
      },
      token,
    );
    setComposerOpen(false);
    setDraft(null);
    window.getSelection()?.removeAllRanges();
  }

  if (!token) return <NoTokenHint />;

  const activeLens = activeLensId ? lenses.find((l) => l.id === activeLensId) ?? null : null;
  const others = presence.length;
  const hiddenCount = lenses.length - visibleLenses.length - orphanIds.size;

  return (
    <>
      <Orb
        count={visibleLenses.length}
        live={wsConnected}
        others={others}
        extraCount={hiddenCount + orphanIds.size}
        onToggle={() => setPanelOpen((v) => !v)}
      />
      {panelOpen && (
        <InfoPanel
          mode={readingMode}
          visible={visibleLenses.length}
          hidden={hiddenCount}
          orphanLenses={lenses.filter((l) => orphanIds.has(l.id))}
          onClose={() => setPanelOpen(false)}
        />
      )}
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
      {activeLens && (
        <LensCard
          lens={activeLens}
          onClose={() => setActiveLensId(null)}
          knownLenses={lenses}
          onLensClick={(id) => setActiveLensId(id)}
          onMount={(rect) => triggerBloom(rect, "card-open")}
        />
      )}
      {blooms.map((b) => (
        <BloomLayer key={b.id} spec={b.spec} onComplete={() => removeBloom(b.id)} />
      ))}
    </>
  );
}

function Orb({
  count,
  live,
  others = 0,
  extraCount = 0,
  onToggle,
}: {
  count: number;
  live: boolean;
  others?: number;
  extraCount?: number;
  onToggle: () => void;
}) {
  return (
    <button className="orb" onClick={onToggle}>
      <span className={`dot ${live ? "" : "idle"}`} />
      <span>{count} lens</span>
      {others > 0 && <span className="orb-meta">· {others} here</span>}
      {extraCount > 0 && <span className="orb-badge">+{extraCount}</span>}
    </button>
  );
}

function InfoPanel({
  mode,
  visible,
  hidden,
  orphanLenses,
  onClose,
}: {
  mode: ReadingMode;
  visible: number;
  hidden: number;
  orphanLenses: Lens[];
  onClose: () => void;
}) {
  return (
    <section className="info-panel" data-lumen-overlay="">
      <div className="ip-header">
        <strong>Lumen</strong>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="ip-section">
        <div className="ip-row">
          <span>Reading mode</span>
          <span className="pill">{mode}</span>
        </div>
        <div className="ip-hint">Switch in the extension popup.</div>
      </div>

      <div className="ip-section">
        <div className="ip-row"><span>{visible} visible on this page</span></div>
        {hidden > 0 && (
          <div className="ip-row muted">{hidden} hidden by {mode} mode</div>
        )}
        {orphanLenses.length > 0 && (
          <div className="ip-row muted">{orphanLenses.length} lost their anchor</div>
        )}
      </div>

      {orphanLenses.length > 0 && (
        <div className="ip-section">
          <div className="ip-label">Orphan lens</div>
          {orphanLenses.map((l) => (
            <div key={l.id} className="orphan-row">
              <div className="orphan-meta">
                <span className="pill">{l.type}</span>
                <span>@{l.author?.handle ?? "unknown"}</span>
              </div>
              {l.anchor?.quote?.exact && (
                <div className="orphan-quote">"{l.anchor.quote.exact.slice(0, 80)}"</div>
              )}
              <div className="orphan-body">
                {l.body.slice(0, 100)}{l.body.length > 100 ? "…" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
  onSubmit: (input: { type: LensType; body: string; tags: string[]; anonymous: boolean }) => void | Promise<void>;
}) {
  const [type, setType] = useState<LensType>("quick");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [anonymous, setAnonymous] = useState(false);
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
      await onSubmit({ type, body: body.trim(), tags, anonymous });
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
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.currentTarget.checked)}
        />
        <span>Post as Anonymous</span>
      </label>
      {error && <div className="err">{error}</div>}
      <div className="row">
        <button className="cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button onClick={submit} disabled={busy}>{busy ? "Posting…" : "Publish"}</button>
      </div>
    </div>
  );
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some content-script contexts expose Clipboard API but reject writes.
    }
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position: fixed; left: -9999px; top: 0;";
  document.body.appendChild(el);
  el.select();
  const copied = document.execCommand("copy");
  el.remove();
  if (!copied) throw new Error("copy failed");
}

function LensCard({
  lens,
  onClose,
  knownLenses,
  onLensClick,
  onMount,
}: {
  lens: Lens;
  onClose: () => void;
  knownLenses?: Lens[];
  onLensClick?: (id: string) => void;
  onMount?: (rect: DOMRect) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyResetTimer = useRef<number | null>(null);
  const range = getRangeForLens(lens.id);
  const rect = range?.getBoundingClientRect();
  const top = rect ? Math.min(window.innerHeight - 280, rect.bottom + 8) : 96;
  const left = rect ? Math.max(8, Math.min(window.innerWidth - 360, rect.left)) : 24;
  const quote = lens.anchor?.quote?.exact ?? "";

  useEffect(() => {
    if (sectionRef.current && onMount) {
      onMount(sectionRef.current.getBoundingClientRect());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    };
  }, []);

  async function copyRef() {
    try {
      await writeClipboardText(`[[lens:${lens.id}]]`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), 1400);
  }

  return (
    <section ref={sectionRef} className="card" style={{ top, left }} data-lumen-overlay="">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <div className="meta">
        <span className="pill">{lens.type}</span>
        {(lens.tags ?? []).map((t) => (
          <span key={t} className="pill" style={{ background: "#f0f0f0", color: "#555" }}>{t}</span>
        ))}
        <span>@{lens.author?.handle ?? "unknown"}</span>
        <button className="copy-ref" onClick={copyRef}>
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy ref"}
        </button>
      </div>
      {quote && <div className="quote">"{quote.slice(0, 160)}"</div>}
      <div className="body">
        <RenderBody body={lens.body} knownLenses={knownLenses} onLensClick={onLensClick} />
      </div>
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

  const host = document.createElement("div");
  host.id = "lumen-root";
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
