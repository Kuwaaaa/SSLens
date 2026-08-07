import { useEffect, useRef, useState } from "react";
import type { Lens, ReadingMode } from "@lumen/schema";

import { LUMEN_THEME_IDS, LUMEN_THEMES, type LumenThemeId } from "../../theme";
import { writeClipboardText } from "../browser/clipboard";
import type { CompanionChatMessage } from "../types";
import { CompanionChat } from "./CompanionChat";

const READING_MODES: ReadingMode[] = ["quiet", "thinking", "full"];

interface InfoPanelProps {
  mode: ReadingMode;
  theme: LumenThemeId;
  visible: number;
  hidden: number;
  orphanLenses: Lens[];
  currentLens: Lens | null;
  canonical: string;
  roomId: string;
  reanchorTargetId: string | null;
  companionActive: boolean;
  companionCount: number;
  companionConnected: boolean;
  companionEmojiChoices: readonly string[];
  chatOpen: boolean;
  companionMessages: CompanionChatMessage[];
  currentUserId: string | null;
  onModeChange: (mode: ReadingMode) => void;
  onThemeChange: (theme: LumenThemeId) => void;
  onClose: () => void;
  onHideTab: () => void;
  onFindCompanion: () => void;
  onLeaveCompanion: () => void;
  onTossCompanionEmoji: (emoji: string) => void;
  onToggleChat: () => void;
  onSendCompanionChat: (body: string) => void;
  onReport: (id: string) => void | Promise<void>;
  onReanchor: (id: string) => void;
  onCancelReanchor: () => void;
}

export function InfoPanel({
  mode,
  theme,
  visible,
  hidden,
  orphanLenses,
  currentLens,
  canonical,
  roomId,
  reanchorTargetId,
  companionActive,
  companionCount,
  companionConnected,
  companionEmojiChoices,
  chatOpen,
  companionMessages,
  currentUserId,
  onModeChange,
  onThemeChange,
  onClose,
  onHideTab,
  onFindCompanion,
  onLeaveCompanion,
  onTossCompanionEmoji,
  onToggleChat,
  onSendCompanionChat,
  onReport,
  onReanchor,
  onCancelReanchor,
}: InfoPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [reportState, setReportState] = useState<"idle" | "reported" | "failed">("idle");
  const [debugOpen, setDebugOpen] = useState(false);
  const copyResetTimer = useRef<number | null>(null);
  const reportResetTimer = useRef<number | null>(null);

  useEffect(() => {
    setCopyState("idle");
    setReportState("idle");
  }, [currentLens?.id]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      if (reportResetTimer.current !== null) window.clearTimeout(reportResetTimer.current);
    };
  }, []);

  async function copyRef() {
    if (!currentLens) return;
    try {
      await writeClipboardText(`[[lens:${currentLens.id}]]`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), 1400);
  }

  async function report() {
    if (!currentLens) return;
    try {
      await onReport(currentLens.id);
      setReportState("reported");
    } catch {
      setReportState("failed");
    }
    if (reportResetTimer.current !== null) window.clearTimeout(reportResetTimer.current);
    reportResetTimer.current = window.setTimeout(() => setReportState("idle"), 1800);
  }

  const copyLabel = copyState === "copied"
    ? "Copied"
    : copyState === "failed"
      ? "Copy failed"
      : "Copy reference";
  const reportLabel = reportState === "reported"
    ? "Reported"
    : reportState === "failed"
      ? "Report failed"
      : "Report";
  const chatFocused = companionActive && chatOpen;

  return (
    <section className={`info-panel ${chatFocused ? "chat-focus" : ""}`} data-lumen-overlay="">
      <div className="ip-header">
        <div>
          <strong>Lumen</strong>
          <div className="ip-header-meta">{visible} visible</div>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">x</button>
      </div>

      {chatFocused && (
        <div className="ip-chat-summary">
          <span>{mode}</span>
          <span>{LUMEN_THEMES[theme].label}</span>
          <span>{visible} visible</span>
          <span>{companionConnected ? "Companion live" : "Companion offline"}</span>
        </div>
      )}

      <div className={`ip-section ip-control-section ${chatFocused ? "soft-collapsed" : ""}`}>
        <div className="ip-section-head">
          <span className="ip-label">Reading mode</span>
          <span className="pill">{mode}</span>
        </div>
        <div className="ip-mode-switch" role="group" aria-label="Reading mode">
          {READING_MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={`ip-section ip-control-section ${chatFocused ? "soft-collapsed" : ""}`}>
        <div className="ip-section-head">
          <span className="ip-label">UI skin</span>
          <span className="pill">{LUMEN_THEMES[theme].label}</span>
        </div>
        <div className="ip-theme-switch" role="group" aria-label="UI skin">
          {LUMEN_THEME_IDS.map((id) => (
            <button
              key={id}
              className={theme === id ? "active" : ""}
              onClick={() => onThemeChange(id)}
              aria-pressed={theme === id}
            >
              <span>{LUMEN_THEMES[id].label}</span>
            </button>
          ))}
        </div>
        <div className="ip-theme-desc">{LUMEN_THEMES[theme].description}</div>
      </div>

      <div className={`ip-section ip-lens-status ${chatFocused ? "soft-collapsed" : ""}`}>
        <div className="ip-section-head">
          <span className="ip-label">Page lens</span>
          <button className="ip-link-action" onClick={onHideTab}>Hide this tab</button>
        </div>
        <div className="ip-stat-grid">
          <div className="ip-stat">
            <strong>{visible}</strong>
            <span>visible</span>
          </div>
          <div className="ip-stat">
            <strong>{hidden}</strong>
            <span>filtered</span>
          </div>
          <div className="ip-stat">
            <strong>{orphanLenses.length}</strong>
            <span>orphan</span>
          </div>
        </div>
        {hidden > 0 && <div className="ip-hint">{hidden} hidden by {mode} mode.</div>}
        {orphanLenses.length > 0 && <div className="ip-hint">{orphanLenses.length} Lens lost their anchor.</div>}
      </div>

      <div className="ip-section companion-dock">
        <div className="ip-section-head">
          <span className="ip-label">Companion</span>
          {companionActive && (
            <span className={`pill ${companionConnected ? "" : "muted"}`}>
              {companionConnected ? "live" : "offline"}
            </span>
          )}
        </div>
        {companionActive ? (
          <>
            <div className="ip-row">
              <span>{companionCount <= 1 ? "Only you here now" : `${companionCount} here now`}</span>
              <button className="ip-link-action" onClick={onLeaveCompanion}>Leave</button>
            </div>
            <div className="companion-toss-row" aria-label="Toss emoji">
              {companionEmojiChoices.map((emoji) => (
                <button
                  key={emoji}
                  className="companion-emoji-button"
                  onClick={() => onTossCompanionEmoji(emoji)}
                  disabled={!companionConnected}
                  aria-label="Toss emoji"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button className="ip-action companion-chat-toggle" onClick={onToggleChat} aria-expanded={chatOpen}>
              {chatOpen ? "Hide tiny chat" : companionMessages.length > 0 ? `Open tiny chat (${companionMessages.length})` : "Open tiny chat"}
            </button>
            <CompanionChat
              open={chatOpen}
              messages={companionMessages}
              currentUserId={currentUserId}
              disabled={!companionConnected || !chatOpen}
              onSend={onSendCompanionChat}
            />
          </>
        ) : (
          <>
            <div className="ip-hint">Opt in for live presence, emoji toss, and tiny chat on this page.</div>
            <button className="ip-action companion" onClick={onFindCompanion} disabled={!companionConnected}>
              {companionConnected ? "Find companion" : "Connecting..."}
            </button>
          </>
        )}
      </div>

      {currentLens && (
        <div className={`ip-section ${chatFocused ? "soft-collapsed" : ""}`}>
            <div className="ip-section-head">
              <span className="ip-label">Current lens</span>
            </div>
            <div className="ip-row">
              <span className="ip-current-meta">
                <span className="pill">{currentLens.type}</span>
                <span>@{currentLens.author?.handle ?? "unknown"}</span>
              </span>
            </div>
            <div className="ip-actions">
              <button
                className={copyState === "copied" ? "success" : copyState === "failed" ? "danger" : ""}
                onClick={() => void copyRef()}
              >
                {copyLabel}
              </button>
              <button
                className={`report ${reportState === "reported" ? "success" : reportState === "failed" ? "danger" : ""}`}
                onClick={() => void report()}
              >
                {reportLabel}
              </button>
            </div>
        </div>
      )}

      {orphanLenses.length > 0 && (
        <div className={`ip-section ${chatFocused ? "soft-collapsed" : ""}`}>
            <div className="ip-section-head">
              <span className="ip-label">Orphan lens</span>
            </div>
            {reanchorTargetId && (
              <div className="ip-hint reanchor-hint">
                <span>Select the new text anchor on the page.</span>
                <button onClick={onCancelReanchor}>Cancel</button>
              </div>
            )}
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
                  {l.body.slice(0, 100)}{l.body.length > 100 ? "..." : ""}
                </div>
                {l.canEditAnchor ? (
                  <button
                    className="orphan-action"
                    onClick={() => onReanchor(l.id)}
                    disabled={reanchorTargetId === l.id}
                  >
                    {reanchorTargetId === l.id ? "Selecting..." : "Re-anchor"}
                  </button>
                ) : (
                  <div className="orphan-note">Only the author or an operator can re-anchor this Lens.</div>
                )}
              </div>
            ))}
        </div>
      )}

      <div className={`ip-section ip-debug-section ${chatFocused ? "soft-collapsed" : ""}`}>
        <button className="ip-debug-toggle" onClick={() => setDebugOpen((open) => !open)} aria-expanded={debugOpen}>
          Room debug
        </button>
        {debugOpen && (
          <div className="ip-debug-body">
            <div>
              <span>canonical</span>
              <code title={canonical}>{canonical}</code>
            </div>
            <div>
              <span>room</span>
              <code title={roomId}>{roomId}</code>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
