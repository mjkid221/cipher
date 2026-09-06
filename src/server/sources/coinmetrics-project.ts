import type { BtcHistory } from "~/server/domain/market-types";

/**
 * The CoinMetrics response, projected to the compact shape the cache holds.
 *
 * Kept free of `server-only` so it can be exercised directly against a saved
 * response: the arithmetic downstream (rainbow fit, 200-week average, Puell)
 * is only as right as this alignment, and alignment bugs are silent.
 */

export const SERIES_START = "2010-07-18";
export const TRAIL_DAYS = 1500;
const MIN_ROWS = 3000;
const MAX_STALE_DAYS = 3;
const DAY_MS = 86_400_000;

export const METRICS = [
  "PriceUSD",
  "CapMVRVCur",
  "IssTotUSD",
  "HashRate",
  "AdrActCnt",
  "TxCnt",
  "FlowInExUSD",
  "FlowOutExUSD",
  "SplyExNtv",
  "CapMrktCurUSD",
  "volume_reported_spot_usd_1d",
] as const;

type Metric = (typeof METRICS)[number];
export type RawRow = { time?: string } & Partial<Record<Metric, string | null>>;

export function projectBtcHistory(
  input: RawRow[],
  now = new Date(),
): BtcHistory {
  const rows = input.filter(
    (row): row is RawRow & { time: string } => typeof row.time === "string",
  );

  if (rows.length < MIN_ROWS) {
    throw new Error(
      `coinmetrics returned ${rows.length} rows; expected the full history`,
    );
  }

  const startMs = Date.parse(SERIES_START);
  const lastTime = rows[rows.length - 1]!.time;
  // CoinMetrics stamps rows to the nanosecond ("…T00:00:00.000000000Z"), which
  // `Date.parse` does not reliably accept. Only the date matters here.
  const lastMs = Date.parse(lastTime.slice(0, 10));
  if (!Number.isFinite(lastMs))
    throw new Error("coinmetrics: unparseable last row");
  if (now.getTime() - lastMs > (MAX_STALE_DAYS + 1) * DAY_MS) {
    throw new Error(
      `coinmetrics history ends ${lastTime.slice(0, 10)}; feed looks frozen`,
    );
  }

  // Align by date rather than by row position, so a missing day upstream
  // becomes a null at the right index instead of shifting everything after it.
  const dayCount = Math.round((lastMs - startMs) / DAY_MS) + 1;
  const price: number[] = new Array<number>(dayCount).fill(NaN);
  const byDay = new Map<number, RawRow>();

  for (const row of rows) {
    const index = Math.round(
      (Date.parse(row.time.slice(0, 10)) - startMs) / DAY_MS,
    );
    if (index < 0 || index >= dayCount) continue;
    byDay.set(index, row);
    const p = num(row.PriceUSD);
    if (p !== null && p > 0) price[index] = roundSig(p, 6);
  }

  // Forward-fill any hole in price; downstream averages cannot take a NaN.
  for (let i = 0; i < dayCount; i++) {
    if (!Number.isFinite(price[i]!)) price[i] = i > 0 ? price[i - 1]! : 0;
  }

  const trailStart = Math.max(0, dayCount - TRAIL_DAYS);
  const trail = <T>(pick: (row: RawRow) => T | null): (T | null)[] => {
    const out: (T | null)[] = [];
    for (let i = trailStart; i < dayCount; i++) {
      const row = byDay.get(i);
      out.push(row ? pick(row) : null);
    }
    return out;
  };

  return {
    start: SERIES_START,
    end: lastTime.slice(0, 10),
    price,
    trailDays: dayCount - trailStart,
    mvrv: trail((row) => sig(row.CapMVRVCur)),
    issUsd: trail((row) => sig(row.IssTotUSD)),
    // Upstream unit is TH/s.
    hashRateEh: trail((row) => {
      const v = num(row.HashRate);
      return v === null ? null : roundSig(v / 1e6, 6);
    }),
    activeAddresses: trail((row) => sig(row.AdrActCnt)),
    txCount: trail((row) => sig(row.TxCnt)),
    exchangeNetFlowUsd: trail((row) => {
      const inflow = num(row.FlowInExUSD);
      const outflow = num(row.FlowOutExUSD);
      return inflow === null || outflow === null
        ? null
        : roundSig(inflow - outflow, 6);
    }),
    exchangeSupplyBtc: trail((row) => sig(row.SplyExNtv)),
    marketCapUsd: trail((row) => sig(row.CapMrktCurUSD)),
    spotVolumeUsd: trail((row) => sig(row.volume_reported_spot_usd_1d)),
  };
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sig(value: string | null | undefined): number | null {
  const n = num(value);
  return n === null ? null : roundSig(n, 6);
}

function roundSig(value: number, digits: number): number {
  if (value === 0) return 0;
  return Number(value.toPrecision(digits));
}
