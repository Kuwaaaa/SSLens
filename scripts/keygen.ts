// Generate an Ed25519 key pair and write to data/keys.json.
// Run once before starting the server. Pass --force to overwrite existing keys.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = process.env.LUMEN_KEYS ?? "data/keys.json";
const force = process.argv.includes("--force");

if (existsSync(OUT) && !force) {
  console.error(`${OUT} already exists. Pass --force to overwrite.`);
  process.exit(1);
}

const pair = (await crypto.subtle.generateKey(
  { name: "Ed25519" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;

const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ privateJwk, publicJwk }, null, 2) + "\n");

console.log(`Wrote ${OUT}`);
console.log("Public key (JWK):");
console.log(JSON.stringify(publicJwk, null, 2));
