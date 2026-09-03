import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Upstash Redis is optional.
 *
 * Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` and every upstream
 * response is cached across processes and deploys. Leave them unset and the app
 * still works — it falls back to the in-process L1 cache only, which is fine for
 * local development but will re-scrape on every cold start in production.
 */

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    client = null;
    return client;
  }

  try {
    client = new Redis({
      url,
      token,
      // Upstash's REST transport is HTTP; keep retries tight so a slow cache
      // never becomes slower than just refetching the upstream.
      retry: { retries: 1, backoff: (n) => n * 100 },
    });
  } catch (error) {
    console.warn(
      "[cache] Upstash Redis init failed, continuing without it —",
      error instanceof Error ? error.message : error,
    );
    client = null;
  }

  return client;
}

export const isRedisEnabled = () => getRedis() !== null;
