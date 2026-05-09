export { canonicalizeUrl, canonicalizeUrlString, roomIdFor } from "../packages/url/src/index.ts";
import { canonicalizeUrl, roomIdFor } from "../packages/url/src/index.ts";

if (import.meta.main) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: bun scripts/canonicalize-url.ts <url>");
    process.exit(1);
  }
  const canonical = canonicalizeUrl(input);
  const room = await roomIdFor(input);
  console.log(JSON.stringify({ input, canonical, roomId: room }, null, 2));
}
