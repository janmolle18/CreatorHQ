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

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6380",
  maxRetriesPerRequest: null,
};

for (const name of QUEUES) {
  const queue = new Queue(name, { connection });
  await queue.obliterate({ force: true });
  await queue.close();
  console.log(`geleert: ${name}`);
}
console.log("Alle Queues geleert.");
