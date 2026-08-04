#!/usr/bin/env node
// Download-Jobs manuell einreihen (Verifikation/Debugging).
// Nutzung: node scripts/enqueue-download.mjs <sourceVideoId> | --all-discovered
import "dotenv/config";
import { Queue } from "bullmq";
import postgres from "postgres";

const arg = process.argv[2];
if (!arg) {
  console.error("Nutzung: node scripts/enqueue-download.mjs <sourceVideoId> | --all-discovered");
  process.exit(1);
}

const queue = new Queue("download", {
  connection: { url: process.env.REDIS_URL ?? "redis://localhost:6381", maxRetriesPerRequest: null },
});

const ids = [];
if (arg === "--all-discovered") {
  const sql = postgres(process.env.DATABASE_URL);
  const rows = await sql`select id from source_videos where status = 'discovered'`;
  ids.push(...rows.map((r) => r.id));
  await sql.end();
} else {
  ids.push(arg);
}

for (const id of ids) {
  await queue.add("download", { sourceVideoId: id }, { jobId: `download-${id}` });
  console.log(`eingereiht: download-${id}`);
}
console.log(`${ids.length} Job(s) eingereiht`);
await queue.close();
