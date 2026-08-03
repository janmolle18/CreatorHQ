import { Redis } from "ioredis";
import { env } from "../env.ts";

// Ein geteilter ioredis-Client für Locks, Quota-Zähler etc.
// (BullMQ verwaltet seine Verbindungen selbst.)

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  return client;
}
