// Render a Lens body that may contain Markdown plus inline references:
//   [[lens:01HXABCD...]]                  -> chip; click opens that Lens
//   [[lens:01HXABCD...|My title]]         -> chip with custom label
//   [[url:https://example.com]]           -> link with prettified host
//   [[url:https://example.com|click me]]  -> link with custom label
//
// This is intentionally a small renderer, not a full Markdown implementation.
// It covers the Lens reading P0: paragraphs, headings, lists, blockquotes,
// fenced code, inline code, links, and existing reference chips.

import { useMemo, type ReactNode } from "react";
import type { Lens } from "@lumen/schema";

export interface RefToken {
  kind: "text" | "lens" | "url";
  value: string;
  label?: string;
}

interface BlockToken {
  kind: "paragraph" | "heading" | "blockquote" | "ul" | "ol" | "code";
  text?: string;
  level?: number;
  items?: string[];
  language?: string;
}

const REF_RE = /\[\[(lens|url):([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const INLINE_RE = /(`([^`]+)`)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\[\[(lens|url):([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function parseBody(body: string): RefToken[] {
  const tokens: RefToken[] = [];
  let lastIndex = 0;
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(body)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ kind: "text", value: body.slice(lastIndex, m.index) });
    }
    const kind = m[1] as "lens" | "url";
    const target = m[2].trim();
    const label = m[3]?.trim();
    tokens.push({ kind, value: target, label });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < body.length) {
    tokens.push({ kind: "text", value: body.slice(lastIndex) });
  }
  return tokens;
}

export interface RenderBodyProps {
  body: string;
  knownLenses?: Lens[];
  onLensClick?: (lensId: string) => void;
}

export function RenderBody({ body, knownLenses, onLensClick }: RenderBodyProps) {
  const blocks = useMemo(() => parseBlocks(body), [body]);
  return (
    <div className="lens-markdown">
      {blocks.map((block, i) => renderBlock(block, i, knownLenses, onLensClick))}
    </div>
  );
}

function parseBlocks(body: string): BlockToken[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockToken[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];
  let inCode = false;
  let codeLanguage = "";
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ kind: list.kind, items: list.items });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    blocks.push({ kind: "blockquote", text: quote.join("\n") });
    quote = [];
  };
  const flushTextBlocks = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const fence = raw.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      if (inCode) {
        blocks.push({ kind: "code", text: codeLines.join("\n"), language: codeLanguage });
        inCode = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        flushTextBlocks();
        inCode = true;
        codeLanguage = fence[1] ?? "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    if (!raw.trim()) {
      flushTextBlocks();
      continue;
    }

    const heading = raw.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushTextBlocks();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    const quoteMatch = raw.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    const unordered = raw.match(/^\s*[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (!list || list.kind !== "ul") flushList();
      if (!list) list = { kind: "ul", items: [] };
      list.items.push(unordered[1]);
      continue;
    }

    const ordered = raw.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (!list || list.kind !== "ol") flushList();
      if (!list) list = { kind: "ol", items: [] };
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(raw);
  }

  if (inCode) {
    blocks.push({ kind: "code", text: codeLines.join("\n"), language: codeLanguage });
  }
  flushTextBlocks();

  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text: "" }];
}

function renderBlock(
  block: BlockToken,
  key: number,
  knownLenses?: Lens[],
  onLensClick?: (lensId: string) => void,
): ReactNode {
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
    return <Tag key={key}>{renderInline(block.text ?? "", knownLenses, onLensClick)}</Tag>;
  }
  if (block.kind === "blockquote") {
    return <blockquote key={key}>{renderInline(block.text ?? "", knownLenses, onLensClick)}</blockquote>;
  }
  if (block.kind === "ul" || block.kind === "ol") {
    const Tag = block.kind;
    return (
      <Tag key={key}>
        {(block.items ?? []).map((item, i) => (
          <li key={i}>{renderInline(item, knownLenses, onLensClick)}</li>
        ))}
      </Tag>
    );
  }
  if (block.kind === "code") {
    return (
      <pre key={key} className="md-code-block">
        {block.language && <span className="md-code-language">{block.language}</span>}
        <code>{block.text ?? ""}</code>
      </pre>
    );
  }
  return <p key={key}>{renderInline(block.text ?? "", knownLenses, onLensClick)}</p>;
}

function renderInline(text: string, knownLenses?: Lens[], onLensClick?: (lensId: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index));

    if (m[2] !== undefined) {
      nodes.push(<code key={nodes.length} className="md-inline-code">{m[2]}</code>);
    } else if (m[3] !== undefined && m[4] !== undefined) {
      nodes.push(
        <a
          key={nodes.length}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {m[3]}
        </a>,
      );
    } else if (m[5] !== undefined) {
      const kind = m[5] as "lens" | "url";
      nodes.push(renderRef({ kind, value: m[6].trim(), label: m[7]?.trim() }, nodes.length, knownLenses, onLensClick));
    }

    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderRef(token: RefToken, key: number, knownLenses?: Lens[], onLensClick?: (lensId: string) => void): ReactNode {
  if (token.kind === "url") {
    const display = token.label ?? prettyUrl(token.value);
    return (
      <a
        key={key}
        className="ref-url"
        href={token.value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {display} -&gt;
      </a>
    );
  }

  const lens = knownLenses?.find((l) => l.id === token.value);
  const known = !!lens;
  const display = token.label ?? (lens ? truncate(lens.body, 32) : `lens:${token.value.slice(0, 8)}...`);
  return (
    <button
      key={key}
      type="button"
      className={`ref-lens${known ? "" : " unknown"}`}
      onClick={(e) => {
        e.stopPropagation();
        if (known && onLensClick) onLensClick(token.value);
      }}
      disabled={!known}
      title={known ? "Open referenced Lens" : "Referenced Lens isn't on this page (cross-page lookup is P1)"}
    >
      {display}
    </button>
  );
}

function prettyUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname.length > 1 ? url.pathname : ""}`;
  } catch {
    return u;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "...";
}
