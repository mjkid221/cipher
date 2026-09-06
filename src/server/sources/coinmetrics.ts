import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import type { BtcHistory } from "~/server/domain/market-types";
import {
  METRICS,
  projectBtcHistory,
  SERIES_START,
  type RawRow,
} from "./coinmetrics-project";

/**
 * CoinMetrics community API — the backbone of every Bitcoin cycle indicator.
 *
 * One request returns the complete daily record since July 2010: price, MVRV,
 * issuance, hash rate, active addresses, exchange flows. No key, no pagination,
 * 6,000 requests per 20 seconds. It is the only free source found that reaches
 * back far enough for a rainbow fit or a 200-week average — CoinGecko caps its
 * free history at 365 days.
 *
 * ## Why the response is projected before it is cached
 *
 * The body is 4.6 MB of stringified numbers. Caching that raw would mean every
 * L1 miss pulls 4.6 MB back from Redis and every request re-parses it. Instead
 * the loader parses once and stores ~190 KB of aligned numeric arrays: the full
 * price history (the rainbow needs all of it) and 1,500 trailing days of the
 * other metrics, which is enough for a 730-day chart of a 365-day average. The
 * projection itself lives in `coinmetrics-project.ts` so it can be run against
 * a saved response without a server.
 */

const API = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";

export function fetchBtcHistory() {
  return cachedValue(
    "coinmetrics:btc:v1",
    // Published once a day (T-1), so four hours is already generous; two days
    // of stale-while-revalidate covers an outage without an empty rail.
    { ttlSeconds: 14_400, staleSeconds: 172_800 },
    async (): Promise<BtcHistory> => {
      const params = new URLSearchParams({
        assets: "btc",
        metrics: METRICS.join(","),
        frequency: "1d",
        page_size: "10000",
        start_time: SERIES_START,
      });

      const raw = await fetchJson<{ data?: RawRow[] }>(`${API}?${params}`, {
        timeoutMs: 45_000,
        retries: 1,
      });

      return projectBtcHistory(raw.data ?? []);
    },
  );
}
