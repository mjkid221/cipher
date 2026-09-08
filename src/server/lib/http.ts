/**
 * Small, dependency-free HTTP helpers shared by every upstream data source.
 *
 * Every external call in this app goes through `fetchJson` so that timeouts,
 * retries and error shapes are consistent, and through `mapLimit` so that we
 * never open an unbounded number of sockets against a third-party API.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface FetchJsonOptions {
  /** Abort a single attempt after this many milliseconds. */
  timeoutMs?: number;
  /** How many times to retry a failed attempt (total attempts = retries + 1). */
  retries?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST";
  /** JSON request body, serialised automatically. */
  body?: unknown;
  /** Treat these status codes as `null` instead of throwing. */
  nullOn?: number[];
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry 5xx, 429 and network-level failures; fail fast on other 4xx. */
function isRetryable(status?: number) {
  if (status === undefined) return true; // network / abort
  return status === 429 || status === 408 || status >= 500;
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers = {},
    method = "GET",
    body,
    nullOn = [],
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
        headers: {
          accept: "application/json",
          "user-agent": "alfa/1.0 (+valuation research dashboard)",
          ...(body ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (nullOn.includes(response.status)) {
        return null as T;
      }

      if (!response.ok) {
        const error = new UpstreamError(
          `${method} ${url} failed with ${response.status}`,
          url,
          response.status,
        );
        if (attempt < retries && isRetryable(response.status)) {
          lastError = error;
          await sleep(250 * 2 ** attempt + Math.random() * 200);
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const status = error instanceof UpstreamError ? error.status : undefined;
      if (attempt < retries && isRetryable(status)) {
        await sleep(250 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      break;
    }
  }

  if (lastError instanceof UpstreamError) throw lastError;
  throw new UpstreamError(
    `${method} ${url} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    url,
  );
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 * Results keep input order. Rejections propagate.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

export class DeadlineError extends UpstreamError {
  constructor(label: string, ms: number) {
    super(`${label} exceeded ${ms}ms deadline`, label);
    this.name = "DeadlineError";
  }
}

/**
 * Reject after `ms` if `promise` has not settled.
 *
 * The underlying promise is *not* cancelled. That is the point: a source that
 * misses the deadline on one request is usually a cold cache, and letting it run
 * to completion means it writes its result to the cache and the next request
 * gets it for free. Cancelling would make every cold path cold forever.
 */
export function deadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  return Promise.race([promise, clock]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Like `Promise.allSettled` but collapses failures to `null` and reports them,
 * so one dead upstream degrades a single column instead of the whole page.
 */
export async function settle<T>(
  label: string,
  promise: Promise<T>,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.warn(
      `[source:${label}] degraded —`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
