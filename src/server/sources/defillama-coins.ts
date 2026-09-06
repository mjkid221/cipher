import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson, mapLimit } from "~/server/lib/http";
import type { CoinPriceHistory } from "~/server/domain/market-types";

/**
 * Prices for any set of CoinGecko-identified coins, from DefiLlama's coins API.
 *
 * This is what makes a real altcoin season index possible. CoinGecko's own
 * history is capped at 365 days per coin on the free tier and throttles after a
 * handful of calls; CoinMetrics covers only 27 of the top 100. DefiLlama
 * resolves `coingecko:<id>` directly and needs no key.
 *
 * ## The 500-point cap, and the two grids
 *
 * One response holds at most 500 points, whatever the period, so a coin's
 * history comes in two shapes. The **daily** grid covers the last fifteen
 * months in one request per coin and is what the index and the rail read. The
 * **weekly** grid reaches back to late 2017 — 460-odd points — in one request
 * per coin, for the long view in the Market window. Weekly aggregation is slow
 * on DefiLlama's side (several seconds a coin), so that grid is cached for a
 * day and served stale for a week; it is history, and the daily grid supplies
 * the recent end. The two are spliced onto one daily grid in the domain.
 */

const API = "https://coins.llama.fi/chart";
const DAY_MS = 86_400_000;
const MAX_POINTS = 500;

interface RawChart {
  coins?: Record<string, { prices?: { timestamp: number; price: number }[] }>;
}

interface Grid {
  /** UTC midnight. */
  startMs: number;
  points: number;
  stepDays: number;
}

/** Stable, short key for a set of ids. */
function fingerprint(ids: readonly string[]): string {
  let h = 2_166_136_261;
  for (const ch of ids.join(",")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0).toString(36);
}

function utcMidnight(): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today.getTime();
}

async function loadGrid(
  ids: readonly string[],
  grid: Grid,
  concurrency: number,
): Promise<CoinPriceHistory> {
  const period =
    grid.stepDays === 1
      ? "1d"
      : grid.stepDays === 7
        ? "1w"
        : `${grid.stepDays}d`;
  // How far from each grid point a price may be taken: half a step.
  const searchWidth = `${grid.stepDays * 12}h`;
  const startSec = Math.floor(grid.startMs / 1000);
  const stepMs = grid.stepDays * DAY_MS;

  const series: Record<string, (number | null)[]> = {};
  let failed = 0;

  await mapLimit(ids, concurrency, async (id) => {
    try {
      const raw = await fetchJson<RawChart>(
        `${API}/coingecko:${id}?start=${startSec}&span=${grid.points}&period=${period}&searchWidth=${searchWidth}`,
        { timeoutMs: 30_000, retries: 1 },
      );
      const points = raw.coins?.[`coingecko:${id}`]?.prices ?? [];
      const out = new Array<number | null>(grid.points).fill(null);
      for (const point of points) {
        const index = Math.round(
          (point.timestamp * 1000 - grid.startMs) / stepMs,
        );
        if (
          index >= 0 &&
          index < grid.points &&
          Number.isFinite(point.price) &&
          point.price > 0
        ) {
          out[index] = point.price;
        }
      }
      series[id] = out;
    } catch (error) {
      // One coin failing costs that coin, not the index.
      failed++;
      console.warn(
        `[source:defillama:coins] ${id} failed —`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  if (Object.keys(series).length === 0) {
    throw new Error("defillama coins: every request failed");
  }

  return {
    start: new Date(grid.startMs).toISOString().slice(0, 10),
    days: grid.points,
    stepDays: grid.stepDays,
    series,
    requested: ids.length,
    failedBatches: failed,
  };
}

/** Daily prices for the last `days` days, ending today. */
export function fetchCoinPriceHistory(ids: readonly string[], days = 460) {
  const sorted = [...new Set(ids)].sort();
  return cachedValue(
    `llama:coinprices:${days}:${sorted.length}:${fingerprint(sorted)}`,
    { ttlSeconds: 21_600, staleSeconds: 86_400 },
    () =>
      loadGrid(
        sorted,
        {
          startMs: utcMidnight() - (days - 1) * DAY_MS,
          points: days,
          stepDays: 1,
        },
        6,
      ),
  );
}

/**
 * Weekly prices since `since`, or as far back as 500 points reach. The Fear &
 * Greed index begins on 1 February 2018; starting 90 days earlier lets the
 * altcoin season index be computed from that first day.
 */
export function fetchCoinPriceHistoryWeekly(
  ids: readonly string[],
  since = "2017-11-03",
) {
  const sorted = [...new Set(ids)].sort();
  const today = utcMidnight();
  const startMs = Math.max(
    Date.parse(since),
    today - (MAX_POINTS - 1) * 7 * DAY_MS,
  );
  const points = Math.floor((today - startMs) / (7 * DAY_MS)) + 1;
  return cachedValue(
    `llama:coinprices:weekly:${since}:${sorted.length}:${fingerprint(sorted)}`,
    { ttlSeconds: 86_400, staleSeconds: 604_800 },
    () => loadGrid(sorted, { startMs, points, stepDays: 7 }, 10),
  );
}
