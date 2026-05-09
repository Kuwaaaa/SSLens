import {
  validateCreateLensInput,
  validateLensAnchor,
  validateLensRefs,
  validateLensTags,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const validAnchor = validateLensAnchor({
  quote: { exact: "selected text", prefix: "before ", suffix: " after" },
  position: { start: 10, end: 23 },
  domRange: { ignored: true },
});
assert(validAnchor?.quote.exact === "selected text", "valid anchor exact");
assert(validAnchor?.position?.start === 10, "valid anchor position");
assert(!("domRange" in validAnchor), "domRange is not accepted from input");
assert(validateLensAnchor({ quote: { exact: "" } }) === null, "empty quote rejected");
assert(validateLensAnchor({ quote: { exact: "x" }, position: { start: 4, end: 2 } })?.position === undefined, "invalid position omitted");

const tags = validateLensTags(["alpha", "alpha", "  beta  ", "", "x".repeat(80)]);
assert(tags.length === 2 && tags[0] === "alpha" && tags[1] === "beta", "tags cleaned and deduped");

const refs = validateLensRefs([
  { kind: "url", target: "https://example.com/a", label: "Example" },
  { kind: "url", target: "javascript:alert(1)", label: "Bad" },
  { kind: "lens", target: "01ABC", label: "Lens" },
  { kind: "bad", target: "x" },
]);
assert(refs.length === 2, "refs filtered");
assert(refs[0].kind === "url" && refs[1].kind === "lens", "ref kinds preserved");

const create = validateCreateLensInput({
  roomId: "a".repeat(64),
  url: "https://example.com/page",
  type: "quick",
  body: "hello",
  anchor: { quote: { exact: "hello" } },
  tags: ["note"],
  refs,
  anonymous: true,
});
assert(create?.anonymous === true, "create input accepts valid body");
assert(validateCreateLensInput({ ...create, url: "ftp://example.com/file" }) === null, "non-http url rejected");
assert(validateCreateLensInput({ ...create, type: "unknown" }) === null, "unknown type rejected");
assert(validateCreateLensInput({ ...create, body: "" }) === null, "empty body rejected");

console.log("schema validation tests passed");
