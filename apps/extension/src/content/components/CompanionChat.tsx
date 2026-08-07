import { useEffect, useRef, useState, type FormEvent } from "react";

import type { CompanionChatMessage } from "../types";

interface CompanionChatProps {
  open: boolean;
  messages: CompanionChatMessage[];
  currentUserId: string | null;
  disabled: boolean;
  onSend: (body: string) => void;
}

export function CompanionChat({
  open,
  messages,
  currentUserId,
  disabled,
  onSend,
}: CompanionChatProps) {
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!open || !trimmed || disabled) return;
    onSend(trimmed);
    setBody("");
  }

  return (
    <div className={`companion-chat ${open ? "expanded" : "collapsed"}`} aria-hidden={!open}>
      <div ref={listRef} className="companion-chat-messages">
        {messages.length === 0 ? (
          <div className="companion-chat-empty">Tiny chat starts here.</div>
        ) : messages.map((message) => {
          const mine = currentUserId !== null && message.userId === currentUserId;
          return (
            <div key={message.id} className={`companion-chat-message ${mine ? "mine" : ""}`}>
              <div className="companion-chat-meta">{mine ? "You" : `@${message.handle}`}</div>
              <div className="companion-chat-body">{message.body}</div>
            </div>
          );
        })}
      </div>
      <form className="companion-chat-form" onSubmit={submit}>
        <input
          value={body}
          onChange={(e) => setBody(e.currentTarget.value.slice(0, 280))}
          placeholder={disabled ? "Reconnecting..." : "Say something small"}
          disabled={disabled}
          maxLength={280}
        />
        <button disabled={disabled || !body.trim()}>Send</button>
      </form>
    </div>
  );
}
