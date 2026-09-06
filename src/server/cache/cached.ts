import "server-only";

import { waitUntil } from "@vercel/functions";

import { getRedis } from "./redis";

/**
 * Two-tier, stale-while-revalidate cache.
 *
 *   L1  in-process Map   — microseconds, per instance, lost on cold start
 *   L2  Upstash Redis    — shared across instances, survives deploys
 *
 * `ttlSeconds` is how long a value is considered fresh. `staleSeconds` is the
 * extra window during which a stale value is still served, while a refresh runs
 * in the background. That combination is what keeps the dashboard instant even
 * though a full rebuild touches ~100 third-party endpoints.
 *
 * Concurrent callers for the same key share a single in-flight load, so a cold
 * cache under load produces one upstream request, not one per reader.
 *
 * ## Refreshing behind the reader, on serverless
 *
 * A stale hit answers immediately and refreshes in the background. On Vercel
 * the function may be frozen the moment the response is sent, which would kill
 * that refresh every time and leave the value ageing until it hard-expired —
 * at which point some visitor pays for a cold rebuild. Every background load
 * is therefore handed to `waitUntil`, which keeps the invocation alive until
 * the promise settles. Outside Vercel it is a no-op.
 *
 * This matters more than it did: on the Hobby plan the warm-up cron can run
 * only once a day, so the stale windows and these background refreshes are
 * what keep the dashboard instant between visits.
 */

/** Kick a refresh without waiting for it, and keep the platform from killing it. */
function refreshInBackground(promise: Promise<unknown>) {
  const settled = promise.catch(() => undefined);
  try {
    waitUntil(settled);
  } catch {
    // Not on Vercel, or no request context: the promise still runs to
    // completion in a long-lived process.
  }
}

export const CACHE_PREFIX = "par:v1";

interface Envelope<T> {
  /** Payload. */
  v: T;
  /** Epoch ms at which the payload was produced. */
  t: number;
}

interface L1Entry {
  envelope: Envelope<unknown>;
  /** Epoch ms after which even the stale window has expired. */
  hardExpiry: number;
}

const l1 = new Map<string, L1Entry>();
const inflight = new Map<string, Promise<unknown>>();

export interface CachedResult<T> {
  data: T;
  /** Age of the served payload in seconds. */
  ageSeconds: number;
  /** True when a background refresh was kicked off for this read. */
  stale: boolean;
  /** Where the payload came from. */
  tier: "l1" | "redis" | "origin";
}

export interface CacheOptions {
  /** Seconds a value stays fresh. */
  ttlSeconds: number;
  /** Extra seconds a stale value may be served while revalidating. */
  staleSeconds?: number;
}

function keyFor(key: string) {
  return `${CACHE_PREFIX}:${key}`;
}

async function readRedis<T>(key: string): Promise<Envelope<T> | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    // The Upstash SDK deserialises JSON for us.
    return (await redis.get<Envelope<T>>(keyFor(key))) ?? null;
  } catch (error) {
    console.warn(
      `[cache] redis GET ${key} failed —`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function writeRedis<T>(
  key: string,
  envelope: Envelope<T>,
  hardTtlSeconds: number,
) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(keyFor(key), envelope, { ex: Math.ceil(hardTtlSeconds) });
  } catch (error) {
    console.warn(
      `[cache] redis SET ${key} failed —`,
      error instanceof Error ? error.message : error,
    );
  }
}

function load<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds: number,
  staleSeconds: number,
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    const value = await loader();
    const envelope: Envelope<T> = { v: value, t: Date.now() };
    l1.set(key, {
      envelope,
      hardExpiry: envelope.t + (ttlSeconds + staleSeconds) * 1000,
    });
    await writeRedis(key, envelope, ttlSeconds + staleSeconds);
    return value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export async function cached<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>,
): Promise<CachedResult<T>> {
  const { ttlSeconds, staleSeconds = ttlSeconds * 6 } = options;
  const now = Date.now();

  const fromL1 = l1.get(key);
  if (fromL1 && fromL1.hardExpiry > now) {
    const ageSeconds = (now - fromL1.envelope.t) / 1000;
    if (ageSeconds <= ttlSeconds) {
      return {
        data: fromL1.envelope.v as T,
        ageSeconds,
        stale: false,
        tier: "l1",
      };
    }
    // Fresh enough to serve, old enough to refresh behind the reader.
    refreshInBackground(load(key, loader, ttlSeconds, staleSeconds));
    return {
      data: fromL1.envelope.v as T,
      ageSeconds,
      stale: true,
      tier: "l1",
    };
  }

  const fromRedis = await readRedis<T>(key);
  if (fromRedis) {
    const ageSeconds = (now - fromRedis.t) / 1000;
    if (ageSeconds <= ttlSeconds + staleSeconds) {
      l1.set(key, {
        envelope: fromRedis,
        hardExpiry: fromRedis.t + (ttlSeconds + staleSeconds) * 1000,
      });
      if (ageSeconds > ttlSeconds) {
        refreshInBackground(load(key, loader, ttlSeconds, staleSeconds));
        return { data: fromRedis.v, ageSeconds, stale: true, tier: "redis" };
      }
      return { data: fromRedis.v, ageSeconds, stale: false, tier: "redis" };
    }
  }

  const data = await load(key, loader, ttlSeconds, staleSeconds);
  return { data, ageSeconds: 0, stale: false, tier: "origin" };
}

/** Convenience wrapper when the caller only wants the payload. */
export async function cachedValue<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>,
): Promise<T> {
  return (await cached(key, options, loader)).data;
}

/** Drop a single key from both tiers. Kept for operators; unused in the app. @public */
export async function invalidate(key: string) {
  l1.delete(key);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(keyFor(key));
  } catch {
    /* best effort */
  }
}

/**
 * Drop every key this app owns, from both tiers.
 *
 * Invalidating only the composite snapshot would rebuild the model from
 * still-warm per-source caches — fast, but it would not fetch anything new,
 * which is not what someone pressing "Refresh" is asking for. This clears the
 * source caches too, so the next read genuinely re-pulls upstream.
 */
/** Drop every key under the prefix. Kept for operators; unused in the app. @public */
export async function invalidateAll() {
  l1.clear();

  const redis = getRedis();
  if (!redis) return;

  try {
    let cursor = "0";
    const found: string[] = [];

    // Bounded: SCAN can return an unbounded number of pages, and this runs on a
    // user-facing request.
    for (let page = 0; page < 20; page++) {
      const [next, keys] = await redis.scan(cursor, {
        match: `${CACHE_PREFIX}:*`,
        count: 200,
      });
      found.push(...keys);
      cursor = String(next);
      if (cursor === "0") break;
    }

    if (found.length > 0) await redis.del(...found);
  } catch (error) {
    console.warn(
      "[cache] bulk invalidate failed —",
      error instanceof Error ? error.message : error,
    );
  }
}
