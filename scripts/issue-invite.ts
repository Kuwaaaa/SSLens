// Mint an invite code. Usage:
//   bun scripts/issue-invite.ts                 # founder (no issuer recorded)
//   bun scripts/issue-invite.ts --by <userId>   # record issuer

import { db } from "../apps/server/src/db.ts";

const args = process.argv.slice(2);
let issuedBy: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--by") {
    issuedBy = args[i + 1] ?? null;
    i++;
  }
}

// 8-char invite, omit easily-confused chars (I, O, 0, 1).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const insertInvite = db.query<
  unknown,
  [string, string | null, number]
>("INSERT INTO invite_codes (code, issued_by, created_at) VALUES (?, ?, ?)");

let attempts = 0;
let code: string;
while (true) {
  code = generateCode();
  try {
    insertInvite.run(code, issuedBy, Date.now());
    break;
  } catch (err) {
    attempts++;
    if (attempts > 5) throw err;
  }
}

console.log("Invite code:");
console.log(`  ${code}`);
if (issuedBy) console.log(`  issued by: ${issuedBy}`);
