/**
 * Market-wide context: the shapes the `market` router speaks.
 *
 * Everything in this file is **display-only**. None of it is imported by
 * `score.ts` or `aggregate.ts`, and nothing here may influence a chain's rank.
 *
 * Three payloads share one set of cached upstream fetches:
 *
 *   `MarketBrief`   small; prefetched on the server for the always-visible rail
 *   `MarketCycle`   the overlay series for the market-cycle panel; fetched by the
 *                   client after first paint
 *   `MarketDetail`  the full rainbow and histories, fetched when the window opens
 *
 * Every field that comes from an upstream is nullable. A source that fails or
 * times out produces a null, never an error, and the interface says so.
 */

import type { TopModel, TopModelId } from "~/lib/cycle-models";

/* ---------------------------------------------------------------- sources ---- */

export type MarketSourceId =
  "coinmetrics" | "alternative-me" | "coingecko" | "defillama" | "mempool";

export interface MarketSource {
  id: MarketSourceId;
  label: string;
  url: string;
  /** `degraded` means it timed out on this request and is still warming. */
  status: "ok" | "degraded" | "unavailable";
  note: string;
  asOf: string | null;
}

/* --------------------------------------------------------------- readings ---- */

export type Tone = "extreme-low" | "low" | "neutral" | "high" | "extreme-high";

export interface Reading {
  /** The conventional name for this zone, e.g. "Greed", "Bitcoin season". */
  label: string;
  tone: Tone;
  /** One plain sentence built from the numbers. */
  text: string;
}

export interface Tile {
  value: number | null;
  reading: Reading | null;
  /** Up to 30 trailing daily values, oldest first. */
  spark: number[] | null;
  asOf: string | null;
}

/** A daily series in compact form: index `i` is `start + i` days. */
export interface DailySeries {
  start: string;
  values: number[];
}

/* ------------------------------------------------------- raw source shapes ---- */

/** Projected CoinMetrics history. Price in full; the rest trails `end`. */
export interface BtcHistory {
  start: string;
  end: string;
  price: number[];
  trailDays: number;
  mvrv: (number | null)[];
  issUsd: (number | null)[];
  hashRateEh: (number | null)[];
  activeAddresses: (number | null)[];
  txCount: (number | null)[];
  exchangeNetFlowUsd: (number | null)[];
  exchangeSupplyBtc: (number | null)[];
  marketCapUsd: (number | null)[];
  spotVolumeUsd: (number | null)[];
}

export interface FearGreedHistory {
  start: string;
  values: number[];
  classifications: string[];
}

export interface TopMarketRow {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  circulatingSupply: number | null;
}

/** Prices for a set of coins on one grid: index `i` is `start + i × stepDays`. */
export interface CoinPriceHistory {
  start: string;
  /** Number of grid points. */
  days: number;
  /** 1 for the daily grid, 7 for the weekly history. */
  stepDays: number;
  series: Record<string, (number | null)[]>;
  requested: number;
  failedBatches: number;
}

/* -------------------------------------------------------------- the brief ---- */

export interface HalvingStatus {
  blockHeight: number;
  nextHeight: number;
  blocksRemaining: number;
  daysRemaining: number;
  estimatedDate: string;
  lastHalvingDate: string;
  daysSinceLast: number;
  /** 0–1 through the current 210,000-block epoch. */
  cycleProgress: number;
  asOf: string;
}

export interface AltcoinSeasonMethod {
  /** Return window, days. CoinMarketCap's definition. */
  windowDays: 90;
  /** Altcoins with a price both today and `windowDays` ago. */
  sampleSize: number;
  /** Pegs, wrapped and staked forms, funds — removed before counting. */
  excluded: number;
  /** Of the top 100, how many DefiLlama could price. */
  priced: number;
}

export interface MarketBrief {
  generatedAt: string;
  warming: boolean;
  btc: { price: number | null; change24h: number | null; asOf: string | null };
  fearGreed: Tile & { classification: string | null; change7d: number | null };
  altcoinSeason: Tile & { method: AltcoinSeasonMethod | null };
  /** `value` is the z-score from the rainbow centre line. */
  rainbow: Tile & {
    bandIndex: number | null;
    bandLabel: string | null;
    centre: number | null;
  };
  halving: HalvingStatus | null;
  /** Where Bitcoin sits in its four-year cycle, and what the spacing implies. */
  cycle: {
    phase: BitcoinCycles["phase"];
    sinceLastExtreme: number;
    lastTop: CycleExtreme | null;
    lastBottom: CycleExtreme | null;
    nextBottom: BitcoinCycles["nextBottom"];
    nextTop: BitcoinCycles["nextTop"];
  } | null;
  sources: MarketSource[];
}

/* -------------------------------------------------------------- the cycle ---- */

/**
 * The overlay: daily series on one time grid since the Fear & Greed index
 * began, `index i = start + i days`. Bitcoin is painted by Fear & Greed and the
 * altcoin market cap by the altcoin season index, so each panel keeps one
 * y-axis and the second variable rides on colour.
 */
export interface MarketCycle {
  generatedAt: string;
  start: string;
  days: number;
  fearGreed: (number | null)[];
  /** 90-day altcoin season index, on days at least 40 of today's top 100 were priced. */
  altcoinSeason: (number | null)[];
  /** How many of today's top-100 altcoins had a price that day — the sample behind both altcoin series. */
  altcoinCoverage: (number | null)[];
  /** Bitcoin's daily close. */
  btcPriceUsd: (number | null)[];
  /** Today's top-100 altcoins at each day's price times today's supply, on days at least 40 were priced. */
  altMarketCapUsd: (number | null)[];
  /** Altcoin prices are daily from this date; weekly, carried forward, before it. */
  dailyFrom: string | null;
  halvings: string[];
  method: AltcoinSeasonMethod | null;
  /** What the altcoin series are and are not. */
  marketCapNote: string;
  sources: MarketSource[];
}

/* -------------------------------------------------------- bitcoin cycles ---- */

export interface CycleExtreme {
  date: string;
  price: number;
  /** Days since the genesis block, the x of every fit. */
  daysSinceGenesis: number;
  /**
   * True when the record has not yet run long enough to confirm it: a bottom
   * needs a year of higher prices after it, a top needs a confirmed bottom
   * after it. The latest peak is always provisional until a bottom follows.
   */
  provisional: boolean;
}

export interface IntervalStats {
  /** Every historical interval, days, oldest first. */
  samples: number[];
  min: number;
  mean: number;
  max: number;
}

export interface DateRange {
  from: string;
  mid: string;
  to: string;
}

export interface CycleFit {
  /** ln(price) = a + b · ln(days since genesis). */
  a: number;
  b: number;
  rSquared: number;
  sampleSize: number;
}

export interface BitcoinCycles {
  tops: (CycleExtreme & { multipleOfPrevious: number | null })[];
  bottoms: (CycleExtreme & { drawdownFromTop: number | null })[];
  intervals: {
    bottomToBottom: IntervalStats | null;
    topToTop: IntervalStats | null;
    topToBottom: IntervalStats | null;
    bottomToTop: IntervalStats | null;
  };
  /** Which cycles the intervals are drawn from. */
  intervalsFrom: string;
  topFit: CycleFit | null;
  bottomFit: CycleFit | null;
  /** Every candidate curve through the tops, fitted and backtested. */
  topModels: TopModel[];
  /** The model that predicted the most recent top best from the tops before it. */
  defaultTopModel: TopModelId | null;
  phase: "bear" | "bull" | "unknown";
  /** Days since the most recent extreme. */
  sinceLastExtreme: number;
  nextBottom:
    (DateRange & { priceLow: number | null; priceHigh: number | null }) | null;
  nextTop:
    (DateRange & { priceLow: number | null; priceHigh: number | null }) | null;
}

/* ------------------------------------------------------------- the detail ---- */

export interface RainbowSection {
  fit: {
    a: number;
    b: number;
    sigma: number;
    rSquared: number;
    sampleSize: number;
    fitStart: string;
    fitEnd: string;
    genesis: string;
  };
  /** Ten edges in residual-σ units; band k runs from edge k to edge k + 1. */
  bandEdgesZ: number[];
  /** The same edges as multiples of the centre line. */
  multipliers: number[];
  labels: string[];
  weekly: { start: string; stepDays: 7; price: number[]; centre: number[] };
  current: { price: number; centre: number; z: number; bandIndex: number };
  halvings: string[];
  nextHalvingEstimate: string | null;
}

export interface AltcoinReturn {
  id: string;
  symbol: string;
  name: string;
  /** Percent over the 90-day window. */
  change90d: number;
  beatsBitcoin: boolean;
}

export interface MarketDetail {
  generatedAt: string;
  brief: MarketBrief;
  rainbow: RainbowSection | null;
  cycles: BitcoinCycles | null;
  /** Fear & Greed since February 2018. */
  fearGreed: DailySeries | null;
  altcoinSeason: {
    btcChange90d: number | null;
    /** Every counted altcoin, best first. */
    coins: AltcoinReturn[];
  } | null;
  notCovered: { label: string; reason: string }[];
  sources: MarketSource[];
}
