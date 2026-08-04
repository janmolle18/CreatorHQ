import { Queue } from "bullmq";

// Schlanker Queue-Zugriff für Server Actions (Jobs einreihen, nie verarbeiten).
// Die Worker-Prozesse (worker/) konsumieren; Payload-Formate müssen zu
// worker/src/queues.ts passen.

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6381",
  maxRetriesPerRequest: null,
} as never;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 3600 * 24, count: 1000 },
  removeOnFail: { age: 3600 * 24 * 7 },
};

declare global {
  // Next.js Dev-HMR: Queues über Modul-Reloads hinweg wiederverwenden.
  var __creatorhqQueues: Record<string, Queue> | undefined;
}

function getQueue(name: string): Queue {
  const registry = (globalThis.__creatorhqQueues ??= {});
  registry[name] ??= new Queue(name, { connection, defaultJobOptions });
  return registry[name];
}

export function downloadQueue(): Queue {
  return getQueue("download");
}

export function clipQueue(): Queue {
  return getQueue("clip");
}

export function renderQueue(): Queue {
  return getQueue("render");
}

export function maintenanceQueue(): Queue {
  return getQueue("maintenance");
}

export function publishQueue(): Queue {
  return getQueue("publish");
}

export function briefingQueue(): Queue {
  return getQueue("briefing");
}

export function analyticsQueue(): Queue {
  return getQueue("analytics");
}

export function commentsQueue(): Queue {
  return getQueue("comments");
}

/** Alle Queues für die Systemübersicht — Reihenfolge = Anzeigereihenfolge. */
export const ALL_QUEUES = [
  ["Download", downloadQueue],
  ["Schnitt", clipQueue],
  ["Fertigstellung", renderQueue],
  ["Veröffentlichen", publishQueue],
  ["Messung", analyticsQueue],
  ["Kommentare", commentsQueue],
  ["Briefing", briefingQueue],
  ["Wartung", maintenanceQueue],
] as const;
