import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import type { FearGreedHistory } from "~/server/domain/market-types";

/**
 * The Fear & Greed index, from alternative.me — the original and the one every
 * aggregator republishes. Free, keyless, and one call returns the whole record
 * since 2018, newest first. Reversed here so it lines up with every other daily
 * series in the app, oldest first.
 */

const API = "https://api.alternative.me/fng/";
/** `limit=0` is the API's word for everything — daily since 1 February 2018. */
const LIMIT = 0;

interface RawEntry {
  value?: string;
  value_classification?: string;
  timestamp?: string;
}

export function fetchFearGreed() {
  return cachedValue(
    "fng:history",
    // Updates once a day. An hour is plenty; a day of stale covers an outage.
    { ttlSeconds: 3600, staleSeconds: 86_400 },
    async (): Promise<FearGreedHistory> => {
      const raw = await fetchJson<{ data?: RawEntry[] }>(
        `${API}?limit=${LIMIT}&format=json`,
        { timeoutMs: 15_000, retries: 1 },
      );

      const entries = (raw.data ?? [])
        .map((entry) => ({
          value: Number(entry.value),
          label: entry.value_classification ?? "",
          ts: Number(entry.timestamp) * 1000,
        }))
        .filter(
          (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.ts),
        )
        .sort((a, b) => a.ts - b.ts);

      if (entries.length === 0) throw new Error("fear & greed: empty response");

      // Lay the values on a daily grid by date. The feed skips the odd day —
      // 3,135 rows span about 3,138 days — and a plain list read as "one per
      // day" slides everything after each gap, so today's value lands in
      // yesterday's slot and the curve sits days off every other series. A
      // gap carries the previous day's reading forward; for a daily sentiment
      // index that is the honest fill.
      const dayMs = 86_400_000;
      const first = Math.floor(entries[0]!.ts / dayMs) * dayMs;
      const last = Math.floor(entries[entries.length - 1]!.ts / dayMs) * dayMs;
      const days = Math.round((last - first) / dayMs) + 1;
      const values: number[] = new Array<number>(days);
      const classifications: string[] = new Array<string>(days);
      let cursor = 0;
      for (let i = 0; i < days; i++) {
        const dayStart = first + i * dayMs;
        while (
          cursor + 1 < entries.length &&
          entries[cursor + 1]!.ts < dayStart + dayMs
        )
          cursor++;
        const entry = entries[cursor]!;
        // Only advance onto an entry that belongs to this day or earlier.
        values[i] = entry.ts < dayStart + dayMs ? entry.value : values[i - 1]!;
        classifications[i] =
          entry.ts < dayStart + dayMs ? entry.label : classifications[i - 1]!;
      }

      return {
        start: new Date(first).toISOString().slice(0, 10),
        values,
        classifications,
      };
    },
  );
}
