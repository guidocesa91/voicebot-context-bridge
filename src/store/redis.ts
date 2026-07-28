import { Redis } from "ioredis";
import { config } from "../config.js";
import type { StoredContext } from "../types.js";
import { contextKey } from "../lib/phone.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function saveContext(
  e164: string,
  context: StoredContext,
): Promise<void> {
  await redis.set(
    contextKey(e164),
    JSON.stringify(context),
    "EX",
    config.contextTtlSeconds,
  );
}

export async function getContext(
  e164: string,
): Promise<StoredContext | null> {
  const raw = await redis.get(contextKey(e164));
  if (!raw) return null;
  return JSON.parse(raw) as StoredContext;
}
