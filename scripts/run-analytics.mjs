#!/usr/bin/env node
// Analytics-Lauf manuell anstoßen (Verifikation/Nachholen).
// Nutzung: node scripts/run-analytics.mjs
import "dotenv/config";
import { Queue } from "bullmq";

const queue = new Queue("analytics", {
  connection: { url: process.env.REDIS_URL ?? "redis://localhost:6381", maxRetriesPerRequest: null },
});

await queue.add("daily-analytics", {}, { jobId: `manual-analytics-${Date.now()}` });
console.log("Analytics-Lauf eingereiht — Ergebnis in den Worker-Logs / auf /analytics.");
await queue.close();
