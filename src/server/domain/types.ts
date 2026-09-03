/** Canonical shapes shared by the server model and the UI. */

export interface ChainIdentity {
  /** URL-safe canonical id, e.g. `op-mainnet`. */
  slug: string;
  name: string;
  symbol: string | null;
  logoUrl: string | null;
  /** Official brand colour, used for identity marks only — never for encoding. */
  brandColor: string | null;
  description: string | null;
  founded: string | null;
  founders: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  explorer: string | null;
  /** Upstream keys, kept so the UI can link back to each source. */
  keys: {
    llamaName: string | null;
    artemisId: string | null;
    geckoId: string | null;
  };
}

export interface ChainMetrics {
  /** Circulating market capitalisation, USD. */
  marketCap: number | null;
  price: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;

  tvl: number | null;
  tvlChange7d: number | null;
  tvlChange30d: number | null;

  stablecoins: number | null;
  protocols: number | null;

  fees30d: number | null;
  feesChange30d: number | null;
  revenue30d: number | null;
  revenueChange30d: number | null;
  dexVolume30d: number | null;
  dexVolumeChange30d: number | null;

  /** Mean daily active addresses, 30d. Null unless an Artemis key is set. */
  dau: number | null;
  dauChange30d: number | null;
  txns: number | null;

  /** Estimated net 24h cross-chain flow via Mayan, USD. */
  bridgeNetUsd: number | null;
  bridgeInboundTransfers: number | null;
  bridgeOutboundTransfers: number | null;
  bridgeTraders: number | null;
}

/** Valuation ratios. Lower means cheaper on every one of these. */
export interface ChainMultiples {
  /** Market cap ÷ TVL. */
  mcapToTvl: number | null;
  /** Market cap ÷ annualised chain fees. A price-to-sales analogue. */
  mcapToFees: number | null;
  /** Market cap ÷ annualised revenue accruing to the chain. */
  mcapToRevenue: number | null;
  /** Market cap ÷ stablecoin float. */
  mcapToStablecoins: number | null;
  /** Market cap ÷ annualised DEX volume. */
  mcapToDexVolume: number | null;
}

export interface ChainScores {
  /** 0–100. Size of the chain's real economic activity, versus peers. */
  fundamental: number | null;
  /**
   * 0–100 log-scale index of the same economic activity. Unlike the percentile
   * score above this preserves the *distance* between chains, which is what the
   * peer-implied valuation regression needs.
   */
  fundamentalIndex: number | null;
  /** 0–100. Rate of change of that activity. */
  momentum: number | null;
  /** 0–100. How cheap the multiples are, versus peers. High is cheap. */
  cheapness: number | null;
  /** 0–100 percentile of market cap. The market's own ranking. */
  marketCapPercentile: number | null;
  /** −100…+100. Fundamental percentile minus market-cap percentile. */
  rankGap: number | null;
  /** −100…+100 composite. Positive means the market is discounting the chain. */
  mispricing: number | null;
  /** 0–1. How much of the model's input this chain actually supplied. */
  confidence: number;
  /** Share of model inputs present, 0–1. */
  coverage: number;
}

export type ValuationTier =
  | "deep-value"
  | "undervalued"
  | "fair"
  | "rich"
  | "overvalued"
  | "unrated";

export interface ChainSnapshot extends ChainIdentity {
  metrics: ChainMetrics;
  multiples: ChainMultiples;
  scores: ChainScores;
  /** Percentile rank per metric, 0–100, for the profile chart. */
  percentiles: Record<string, number | null>;
  tier: ValuationTier;
  /** Cheap multiples on decaying fundamentals — a classic value trap. */
  valueTrapRisk: boolean;
  /** Peer-implied market cap from the fundamental-vs-valuation regression. */
  impliedMarketCap: number | null;
  /** That estimate ±1 residual standard deviation. Wide on purpose. */
  impliedMarketCapLow: number | null;
  impliedMarketCapHigh: number | null;
  /**
   * Distance from the peer trend line in residual standard deviations.
   * Negative means the market caps this chain below the line.
   */
  trendResidual: number | null;
  /** Percent move from current to peer-implied market cap. */
  impliedUpside: number | null;
  /** Has a native asset with a tradeable market cap. */
  investable: boolean;
  /** Trailing daily TVL, oldest first. Up to 90 points. */
  tvlSeries: number[];
  /** The plain-language reason this chain scores where it does. */
  thesis: string[];
}

export interface AggregateMeta {
  generatedAt: string;
  /** Per-source health so the UI can be honest about gaps. */
  sources: {
    id: "defillama" | "artemis" | "mayan";
    label: string;
    url: string;
    status: "ok" | "degraded" | "unavailable";
    note: string;
  }[];
  /** Regression used for peer-implied valuation. */
  regression: {
    slope: number;
    intercept: number;
    rSquared: number;
    sampleSize: number;
    residualSd: number;
  } | null;
  mayan: {
    volume24h: number | null;
    swaps24h: number | null;
    activeTraders24h: number | null;
    sampleSize: number;
    sampleWindowHours: number | null;
  } | null;
  universeSize: number;
  ratedCount: number;
  cache: {
    enabled: boolean;
    ageSeconds: number;
    stale: boolean;
    tier: string;
  };
}

export interface AggregateResult {
  chains: ChainSnapshot[];
  meta: AggregateMeta;
}
