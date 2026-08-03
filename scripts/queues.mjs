#!/usr/bin/env node
// Ops-Helfer für die Queues: Status ansehen, anhalten, weiterlaufen lassen.
//   node scripts/queues.mjs status
//   node scripts/queues.mjs pause download clip
//   node scripts/queues.mjs resume download clip
import { Queue } from "bullmq";
import IORedis from "ioredis";

const ALL = [
  "download",
  "clip",
  "render",
  "publish",
  "analytics",
  "comments",
  "briefing",
  "maintenance",
];

const [action, ...rest] = process.argv.slice(2);
if (!action || !["status", "pause", "resume"].includes(action)) {
  console.error("Nutzung: node scripts/queues.mjs <status|pause|resume> [queue …]");
  process.exit(1);
}

const names = rest.length > 0 ? rest : ALL;
const unknown = names.filter((name) => !ALL.includes(name));
if (unknown.length > 0) {
  console.error(`Unbekannte Queue(s): ${unknown.join(", ")}`);
  process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6380", {
  maxRetriesPerRequest: null,
});

for (const name of names) {
  const queue = new Queue(name, { connection });
  if (action === "pause") await queue.pause();
  if (action === "resume") await queue.resume();
  const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
  const paused = await queue.isPaused();
  console.log(
    `${name.padEnd(12)} ${paused ? "PAUSIERT" : "läuft   "}  ` +
      `wartend ${counts.waiting}  aktiv ${counts.active}  ` +
      `verzögert ${counts.delayed}  fehlgeschlagen ${counts.failed}`
  );
  await queue.close();
}

await connection.quit();
