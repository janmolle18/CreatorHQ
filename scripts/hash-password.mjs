#!/usr/bin/env node
// Erzeugt einen scrypt-Hash für ADMIN_PASSWORD_HASH in .env.
// Nutzung: node scripts/hash-password.mjs "dein-passwort"
// Format identisch zu web/lib/password.ts: scrypt:N:r:p:salt:hash (base64url)

import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Nutzung: node scripts/hash-password.mjs "dein-passwort"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });

const encoded = [
  "scrypt",
  N,
  r,
  p,
  salt.toString("base64url"),
  hash.toString("base64url"),
].join(":");

console.log(encoded);
console.log("\nIn .env eintragen als:");
console.log(`ADMIN_PASSWORD_HASH=${encoded}`);
