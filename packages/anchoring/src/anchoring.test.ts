import { fuzzyFind } from "./match";
import { buildQuoteSelector, findByQuote } from "./quote";
import type { TextIndex } from "./text-index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function index(text: string): TextIndex {
  return { text, entries: [] };
}

function sameRange(actual: { start: number; end: number } | null, start: number, end: number, message: string) {
  assert(actual !== null, `${message}: expected range`);
  assert(actual.start === start && actual.end === end, `${message}: got ${actual.start}-${actual.end}`);
}

const text = "alpha beta gamma beta delta";
const quote = buildQuoteSelector(index(text), 6, 10, 6);
assert(quote.exact === "beta", "buildQuoteSelector exact");
assert(quote.prefix === "alpha ", "buildQuoteSelector prefix");
assert(quote.suffix === " gamma", "buildQuoteSelector suffix");

sameRange(findByQuote({ exact: "gamma" }, index(text)), 11, 16, "findByQuote unique");
sameRange(findByQuote({ exact: "beta", prefix: "gamma ", suffix: " delta" }, index(text)), 17, 21, "findByQuote context");
assert(findByQuote({ exact: "" }, index(text)) === null, "empty quote does not match");

sameRange(fuzzyFind("helo wurld", index("hello world")), 0, 11, "fuzzyFind small edit");
assert(fuzzyFind("", index(text)) === null, "empty fuzzy needle does not match");

const longText = "x".repeat(120) + "needle" + "y".repeat(120);
const longQuote = buildQuoteSelector(index(longText), 120, 126, 32);
assert(longQuote.prefix === "x".repeat(32), "long quote prefix is bounded");
assert(longQuote.suffix === "y".repeat(32), "long quote suffix is bounded");

console.log("anchoring core tests passed");
