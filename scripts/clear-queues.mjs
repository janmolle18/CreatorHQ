#!/usr/bin/env node
// Alle BullMQ-Queues leeren (Entwicklung/Reset). Vorsicht: löscht auch Repeatables.
import "dotenv/config";
import { Queue } from "bullmq";

const QUEUES = [
  "download",
  "clip",
  "render",
  "publish",
  "analytics",
  "comments",
  "briefing",
  "maintenance",
];

// KEIN Fallwert. Dieses Skript ruft obliterate({ force: true }) — es löscht
// alles, was es findet, ohne Rückfrage. Ein geratenes Ziel wäre hier kein
// Komfort: Auf diesem Rechner läuft nebenan das Schwesterprojekt auf 6380, und ein Aufruf
// aus dem falschen Verzeichnis hätte dessen Aufträge gelöscht statt der
// eigenen. Wer löschen will, sagt wo.
if (!process.env.REDIS_URL) {
  console.error(
    "REDIS_URL fehlt. Dieses Skript löscht Queues unwiderruflich und rät das " +
      "Ziel deshalb nicht.\n" +
      "Aus dem Projektwurzelverzeichnis aufrufen (dort liegt die .env), oder:\n" +
      "  REDIS_URL=redis://localhost:6381 node scripts/clear-queues.mjs"
  );
  process.exit(1);
}

const connection = {
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: null,
};

console.log(`Ziel: ${connection.url}`);

for (const name of QUEUES) {
  const queue = new Queue(name, { connection });
  await queue.obliterate({ force: true });
  await queue.close();
  console.log(`geleert: ${name}`);
}
console.log("Alle Queues geleert.");
