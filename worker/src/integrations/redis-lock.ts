import { randomUUID } from "node:crypto";
import { getRedis as redis } from "./redis.ts";

// Einfacher Redis-Lock (SET NX PX) — verhindert den Token-Refresh-Race,
// wenn mehrere Publish-Jobs denselben Account gleichzeitig anfassen.

const ACQUIRE_RETRY_MS = 250;

export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  waitMs = 15_000
): Promise<T> {
  const token = randomUUID();
  const deadline = Date.now() + waitMs;

  for (;;) {
    const acquired = await redis().set(key, token, "PX", ttlMs, "NX");
    if (acquired === "OK") break;
    if (Date.now() > deadline) {
      throw new Error(`Lock ${key} nicht erhalten (${waitMs} ms)`);
    }
    await new Promise((resolve) => setTimeout(resolve, ACQUIRE_RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    // Nur den eigenen Lock freigeben (Compare-and-Delete via Lua).
    await redis().eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      key,
      token
    );
  }
}
