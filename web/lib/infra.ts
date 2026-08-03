import { createConnection } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "@creatorhq/db";
import { ALL_QUEUES, maintenanceQueue } from "@/lib/queues";

// Infra-Statuschecks für die Übersicht: Postgres, Redis, MinIO, Worker.
// Kurze Timeouts, keine Secrets in den Detail-Texten.

/** Muss zum Worker passen (worker/src/index.ts schreibt alle 15 s, EX 45). */
const WORKER_HEARTBEAT_KEY = "creatorhq:worker:heartbeat";

const CHECK_TIMEOUT_MS = 1500;

export interface InfraStatus {
  name: string;
  endpoint: string;
  ok: boolean;
  detail: string;
  latencyMs: number | null;
}

function short(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 90 ? `${message.slice(0, 90)}…` : message;
}

async function checkPostgres(): Promise<InfraStatus> {
  const endpoint = "postgres · localhost:5433";
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return {
      name: "Postgres",
      endpoint,
      ok: true,
      detail: "Verbunden",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { name: "Postgres", endpoint, ok: false, detail: short(error), latencyMs: null };
  }
}

function checkRedis(): Promise<InfraStatus> {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  const host = url.hostname;
  const port = Number(url.port || 6379);
  const endpoint = `redis · ${host}:${port}`;
  const started = Date.now();

  return new Promise((resolve) => {
    const fail = (detail: string) =>
      resolve({ name: "Redis", endpoint, ok: false, detail, latencyMs: null });

    const socket = createConnection({ host, port, timeout: CHECK_TIMEOUT_MS });
    socket.on("connect", () => socket.write("PING\r\n"));
    socket.on("data", (chunk) => {
      socket.destroy();
      if (chunk.toString().startsWith("+PONG")) {
        resolve({
          name: "Redis",
          endpoint,
          ok: true,
          detail: "Verbunden",
          latencyMs: Date.now() - started,
        });
      } else {
        fail("Unerwartete Antwort auf PING");
      }
    });
    socket.on("timeout", () => {
      socket.destroy();
      fail("Timeout");
    });
    socket.on("error", (error) => fail(short(error)));
  });
}

async function checkMinio(): Promise<InfraStatus> {
  const base = process.env.S3_ENDPOINT ?? "http://localhost:9002";
  const endpoint = `minio · ${base.replace(/^https?:\/\//, "")}`;
  const started = Date.now();
  try {
    const response = await fetch(`${base}/minio/health/live`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        name: "MinIO",
        endpoint,
        ok: false,
        detail: `HTTP ${response.status}`,
        latencyMs: null,
      };
    }
    return {
      name: "MinIO",
      endpoint,
      ok: true,
      detail: "Verbunden",
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { name: "MinIO", endpoint, ok: false, detail: short(error), latencyMs: null };
  }
}

async function checkWorker(): Promise<InfraStatus> {
  const endpoint = "worker · Docker-Container";
  const started = Date.now();
  try {
    // BullMQ bringt die Redis-Verbindung mit → kein zweiter Client nötig.
    const client = await maintenanceQueue().client;
    const value = await client.get(WORKER_HEARTBEAT_KEY);
    if (!value) {
      return {
        name: "Worker",
        endpoint,
        ok: false,
        detail: "Kein Lebenszeichen — docker compose up -d",
        latencyMs: null,
      };
    }
    const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
    return {
      name: "Worker",
      endpoint,
      ok: true,
      detail: `Verbunden (Tick vor ${ageSeconds} s)`,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { name: "Worker", endpoint, ok: false, detail: short(error), latencyMs: null };
  }
}

export async function checkInfra(): Promise<InfraStatus[]> {
  return Promise.all([checkPostgres(), checkRedis(), checkMinio(), checkWorker()]);
}

export interface QueueDepth {
  name: string;
  active: number;
  waiting: number;
  delayed: number;
  failed: number;
  /** Gesetzt, wenn die Zahlen nicht ermittelt werden konnten. */
  error?: string;
}

/**
 * Tiefen aller Arbeits-Queues.
 *
 * `failed` ist wichtig: Nach drei Fehlversuchen verschwindet ein Job aus
 * active/waiting und war bisher nirgends mehr sichtbar. Und ein Redis-Ausfall
 * wird als Fehler gemeldet statt als „alles leer" — vorher sah ein toter
 * Redis exakt aus wie ein ruhiger Betrieb.
 */
export async function queueDepths(): Promise<QueueDepth[]> {
  return Promise.all(
    ALL_QUEUES.map(async ([name, queueFn]) => {
      try {
        const counts = await queueFn().getJobCounts("active", "waiting", "delayed", "failed");
        return {
          name,
          active: counts.active ?? 0,
          waiting: counts.waiting ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
        };
      } catch (error) {
        return { name, active: 0, waiting: 0, delayed: 0, failed: 0, error: short(error) };
      }
    })
  );
}
