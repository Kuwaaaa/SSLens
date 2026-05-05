import { canonicalizeUrl } from "./canonicalize-url.ts";

interface Case {
  name: string;
  input: string;
  documentCanonical?: string | null;
  expected: string;
}

const cases: Case[] = [
  {
    name: "bilibili video strips tracking query",
    input: "https://www.bilibili.com/video/BV11Z9tBRE5C/?spm_id_from=333.1007&vd_source=abc",
    expected: "https://www.bilibili.com/video/BV11Z9tBRE5C",
  },
  {
    name: "bilibili mobile subdomain canonical host",
    input: "https://m.bilibili.com/video/BV11Z9tBRE5C?share_source=copy_web",
    expected: "https://www.bilibili.com/video/BV11Z9tBRE5C",
  },
  {
    name: "youtube keeps meaningful watch params and sorts them",
    input: "https://www.youtube.com/watch?utm_source=x&v=abc123&t=33&si=share",
    expected: "https://www.youtube.com/watch?t=33&v=abc123",
  },
  {
    name: "article strips common tracking params",
    input: "https://example.com/post/?utm_campaign=launch&ref=twitter&id=42#comments",
    expected: "https://example.com/post?id=42",
  },
  {
    name: "search keeps meaningful query params",
    input: "https://example.com/search?utm_medium=social&source=web&q=lumen",
    expected: "https://example.com/search?q=lumen&source=web",
  },
  {
    name: "same-origin document canonical wins",
    input: "https://example.com/post?utm_source=x&id=1",
    documentCanonical: "https://example.com/post/canonical?utm_source=x&id=1",
    expected: "https://example.com/post/canonical?id=1",
  },
  {
    name: "cross-origin document canonical is ignored",
    input: "https://example.com/post?utm_source=x&id=1",
    documentCanonical: "https://evil.example/post/canonical?id=1",
    expected: "https://example.com/post?id=1",
  },
];

let failures = 0;

for (const c of cases) {
  const actual = canonicalizeUrl(c.input, c.documentCanonical);
  if (actual !== c.expected) {
    failures += 1;
    console.error(`FAIL ${c.name}`);
    console.error(`  input:    ${c.input}`);
    if (c.documentCanonical) console.error(`  document: ${c.documentCanonical}`);
    console.error(`  expected: ${c.expected}`);
    console.error(`  actual:   ${actual}`);
  } else {
    console.log(`PASS ${c.name}`);
  }
}

if (failures > 0) process.exit(1);
console.log(`canonicalize-url: ${cases.length} cases passed`);

