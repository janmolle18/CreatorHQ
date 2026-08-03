#!/usr/bin/env node
// Briefing-Lauf manuell anstoßen (synct vorher die Kommentare).
// Nutzung: node scripts/run-briefing.mjs
import "dotenv/config";
import { Queue } from "bullmq";

const queue = new Queue("briefing", {
  connection: { url: process.env.REDIS_URL ?? "redis://localhost:6380", maxRetriesPerRequest: null },
});

await queue.add("daily-briefing", {}, { jobId: `manual-briefing-${Date.now()}` });
console.log("Briefing-Lauf eingereiht — Ergebnis auf /briefing (Worker-Logs für Details).");
await queue.close();
