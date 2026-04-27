// Render a Lens body that may contain inline references:
//   [[lens:01HXABCD...]]                  -> chip; click opens that Lens
//   [[lens:01HXABCD...|My title]]         -> chip with custom label
//   [[url:https://example.com]]           -> link with prettified host
//   [[url:https://example.com|click me]]  -> link with custom label
//
// Unrecognized syntax stays as plain text. Cross-page lens lookup (resolving
// a lens ID that's not on the current page) is P1; for now those render as
// disabled "unknown" chips.

import type { Lens } from "@lumen/schema";

export interface RefToken {
  kind: "text" | "lens" | "url";
  value: string;
  label?: string;
}

const REF_RE = /\[\[(lens|url):([^\]|]+)(?:\|([^\]]+))?\]\]/g;

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
  const tokens = parseBody(body);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "text") {
          return <span key={i}>{t.value}</span>;
        }
        if (t.kind === "url") {
          const display = t.label ?? prettyUrl(t.value);
          return (
            <a
              key={i}
              className="ref-url"
              href={t.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {display} ↗
            </a>
          );
        }
        // lens
        const lens = knownLenses?.find((l) => l.id === t.value);
        const known = !!lens;
        const display =
          t.label ?? (lens ? truncate(lens.body, 32) : `lens:${t.value.slice(0, 8)}…`);
        return (
          <button
            key={i}
            type="button"
            className={`ref-lens${known ? "" : " unknown"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (known && onLensClick) onLensClick(t.value);
            }}
            disabled={!known}
            title={
              known
                ? "Open referenced Lens"
                : "Referenced Lens isn't on this page (cross-page lookup is P1)"
            }
          >
            ◇ {display}
          </button>
        );
      })}
    </>
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
  return s.slice(0, max).trimEnd() + "…";
}
