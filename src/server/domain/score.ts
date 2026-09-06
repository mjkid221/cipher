import type {
  ChainMetrics,
  ChainMultiples,
  ChainScores,
  ValuationTier,
} from "./types";

/**
 * The valuation model.
 *
 * The question this app exists to answer is "which chain is cheap relative to
 * how well it is actually performing". That is a two-sided comparison, so the
 * model builds two independent pictures of every chain and then measures the
 * distance between them:
 *
 *   FUNDAMENTAL  how much real economic activity the chain has, and how fast
 *                that activity is growing — fees, revenue, capital parked,
 *                stablecoin float, trading throughput, users, ecosystem breadth.
 *
 *   VALUATION    what the market is paying for it — market cap in absolute
 *                percentile terms, and the classic ratios of market cap to each
 *                fundamental.
 *
 * Everything is scored as a *percentile against the peer universe* rather than
 * on raw values, for three reasons: crypto metrics span six orders of magnitude,
 * percentiles are robust to the outliers that dominate any log-linear fit, and a
 * percentile is directly interpretable — "82" means "better than 82% of chains".
 *
 * The headline number is `mispricing`, on −100…+100. Positive means the market
 * is discounting activity the chain demonstrably has.
 */

/* --------------------------------------------------------------- weights ---- */

/** Level metrics: how big is the chain's real economy. */
export const FUNDAMENTAL_WEIGHTS = {
  fees30d: 0.2,
  /** Settled money on the chain. The clearest sign anyone is actually there. */
  stablecoins: 0.18,
  tvl: 0.17,
  revenue30d: 0.12,
  dexVolume30d: 0.12,
  rwaValue: 0.11,
  bridgeVolume30d: 0.06,
  protocols: 0.04,
} as const;

/** Rate-of-change metrics: is that economy growing or decaying. */
export const MOMENTUM_WEIGHTS = {
  feesChange30d: 0.27,
  stablecoinsChange30d: 0.22,
  tvlChange30d: 0.2,
  dexVolumeChange30d: 0.16,
  bridgeVolumeChange30d: 0.09,
  rwaChange30d: 0.06,
} as const;

/** Valuation ratios. Each is inverted before scoring, so high means cheap. */
export const CHEAPNESS_WEIGHTS = {
  mcapToFees: 0.28,
  mcapToTvl: 0.23,
  mcapToRevenue: 0.18,
  mcapToStablecoins: 0.14,
  mcapToDexVolume: 0.1,
  mcapToRwa: 0.07,
} as const;

/** How the three views combine into the headline score. */
export const COMPOSITE_WEIGHTS = {
  /** Fundamental rank minus market-cap rank. Already on −100…+100. */
  rankGap: 0.43,
  /** Cheapness of the multiples, recentred to −100…+100. */
  cheapness: 0.32,
  /** Momentum, recentred. Guards against buying a decaying cash flow. */
  momentum: 0.25,
} as const;

/**
 * A cheapness score built from a single ratio is a guess, not a valuation — one
 * odd denominator (a chain whose TVL is mostly wrapped BTC, say) is enough to
 * put it top of a "cheapest" list. Require corroboration.
 */
export const MIN_MULTIPLES_FOR_CHEAPNESS = 2;

/** A chain below both of these floors is scored but flagged low-confidence. */
export const SIZE_FLOOR = {
  tvlUsd: 5_000_000,
  annualFeesUsd: 1_000_000,
} as const;

const MONTHS_PER_YEAR = 365 / 30;

/* ----------------------------------------------------------------- stats ---- */

/**
 * Average-rank percentile, 0–100. Nulls stay null and are excluded from the
 * ranking rather than treated as zero — a missing metric is not a bad metric.
 */
export function percentileRanks(
  values: readonly (number | null)[],
): (number | null)[] {
  const present = values
    .map((value, index) => ({ value, index }))
    .filter(
      (entry): entry is { value: number; index: number } =>
        entry.value !== null && Number.isFinite(entry.value),
    );

  const out = values.map(() => null as number | null);
  const n = present.length;
  if (n === 0) return out;
  if (n === 1) {
    out[present[0]!.index] = 50;
    return out;
  }

  const sorted = [...present].sort((a, b) => a.value - b.value);

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.value === sorted[i]!.value)
      j++;
    // 1-based average rank across the tie group.
    const averageRank = (i + j) / 2 + 1;
    const percentile = ((averageRank - 1) / (n - 1)) * 100;
    for (let k = i; k <= j; k++) out[sorted[k]!.index] = percentile;
    i = j + 1;
  }

  return out;
}

/** Weighted mean over whichever inputs are present, weights renormalised. */
export function weightedMean(
  parts: readonly { value: number | null; weight: number }[],
): number | null {
  let sum = 0;
  let weight = 0;
  for (const part of parts) {
    if (part.value === null || !Number.isFinite(part.value)) continue;
    sum += part.value * part.weight;
    weight += part.weight;
  }
  return weight > 0 ? sum / weight : null;
}

export function median(values: readonly (number | null)[]): number | null {
  const present = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (present.length === 0) return null;
  const mid = Math.floor(present.length / 2);
  return present.length % 2
    ? present[mid]!
    : (present[mid - 1]! + present[mid]!) / 2;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
  sampleSize: number;
  /** Standard deviation of residuals, in the units of y (here: log dollars). */
  residualSd: number;
}

/**
 * Metrics that define a chain's economic *scale*, and their weight in the log
 * size index that the peer regression is fitted against.
 */
export const SCALE_WEIGHTS = {
  fees30d: 0.27,
  tvl: 0.2,
  stablecoins: 0.19,
  dexVolume30d: 0.12,
  revenue30d: 0.08,
  rwaValue: 0.08,
  bridgeVolume30d: 0.03,
  protocols: 0.03,
} as const;

/** Ordinary least squares on (x, y). Used for peer-implied valuation. */
export function linearFit(
  points: readonly (readonly [number, number])[],
): LinearFit | null {
  const n = points.length;
  if (n < 8) return null;

  const meanX = points.reduce((s, p) => s + p[0], 0) / n;
  const meanY = points.reduce((s, p) => s + p[1], 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const rSquared = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  let sse = 0;
  for (const [x, y] of points) sse += (y - (intercept + slope * x)) ** 2;
  const residualSd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;

  return { slope, intercept, rSquared, sampleSize: n, residualSd };
}

/**
 * Standardised natural log of a metric across the universe: z-scores of
 * `ln(value)` for the chains that have it, `null` for those that do not.
 *
 * Fitting market cap against percentile ranks turned out to be a weak
 * functional form — both sides of the relationship are log-normal, so the fit
 * belongs in log space on both axes.
 */
function standardisedLogs(
  values: readonly (number | null)[],
): (number | null)[] {
  const logs = values.map((value) =>
    value !== null && Number.isFinite(value) && value > 0
      ? Math.log(value)
      : null,
  );
  const present = logs.filter((value): value is number => value !== null);
  if (present.length < 2) return values.map(() => null);

  const mean = present.reduce((sum, value) => sum + value, 0) / present.length;
  const variance =
    present.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    present.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return values.map(() => null);

  return logs.map((value) => (value === null ? null : (value - mean) / sd));
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Map a 0–100 score onto −100…+100 so it can be blended with `rankGap`. */
const recentre = (score: number | null) =>
  score === null ? null : (score - 50) * 2;

/* ------------------------------------------------------------- multiples ---- */

export function computeMultiples(metrics: ChainMetrics): ChainMultiples {
  const { marketCap } = metrics;

  /** Guard against dividing by zero, a negative, or a rounding-error residue. */
  const ratio = (denominator: number | null, floor = 0) =>
    marketCap === null || denominator === null || denominator <= floor
      ? null
      : marketCap / denominator;

  const annual = (monthly: number | null) =>
    monthly === null ? null : monthly * MONTHS_PER_YEAR;

  return {
    mcapToTvl: ratio(metrics.tvl, 100_000),
    mcapToFees: ratio(annual(metrics.fees30d), 50_000),
    mcapToRevenue: ratio(annual(metrics.revenue30d), 25_000),
    mcapToStablecoins: ratio(metrics.stablecoins, 100_000),
    mcapToDexVolume: ratio(annual(metrics.dexVolume30d), 1_000_000),
    mcapToRwa: ratio(metrics.rwaValue, 1_000_000),
  };
}

/* ----------------------------------------------------------------- score ---- */

export interface ScoreInput {
  slug: string;
  metrics: ChainMetrics;
  multiples: ChainMultiples;
}

export interface ScoreOutput {
  scores: ChainScores;
  /** Peer-implied market cap, ±1 residual standard deviation. */
  impliedMarketCapLow: number | null;
  impliedMarketCapHigh: number | null;
  /**
   * How far the chain's market cap sits from the peer trend line, in residual
   * standard deviations. Negative means below trend. This, not a percentage
   * "target", is the statistically defensible read on the regression.
   */
  trendResidual: number | null;
  percentiles: Record<string, number | null>;
  tier: ValuationTier;
  valueTrapRisk: boolean;
  impliedMarketCap: number | null;
  impliedUpside: number | null;
  investable: boolean;
}

export interface UniverseScores {
  results: Map<string, ScoreOutput>;
  regression: LinearFit | null;
  /** Peer medians for the multiples, for "cheap versus what" copy. */
  medians: Record<keyof ChainMultiples, number | null>;
}

type ScaleKey = keyof typeof SCALE_WEIGHTS;
const SCALE_KEYS = Object.keys(SCALE_WEIGHTS) as ScaleKey[];

type LevelKey = keyof typeof FUNDAMENTAL_WEIGHTS;
type MomentumKey = keyof typeof MOMENTUM_WEIGHTS;
type MultipleKey = keyof ChainMultiples;

const LEVEL_KEYS = Object.keys(FUNDAMENTAL_WEIGHTS) as LevelKey[];
const MOMENTUM_KEYS = Object.keys(MOMENTUM_WEIGHTS) as MomentumKey[];
const MULTIPLE_KEYS = Object.keys(CHEAPNESS_WEIGHTS) as MultipleKey[];

/**
 * Fields whose absence is genuinely a *data gap*, used to measure per-chain
 * coverage.
 *
 * `rwaValue` and `bridgeVolume30d` are deliberately absent. Both are derived
 * from complete global scans, so a chain missing from either result has a real
 * zero rather than missing data, and docking its confidence would punish it for
 * a fact about the world.
 *
 * Mayan's routing counts are absent for the same structural reason: that source
 * reaches about a dozen chains, and every other chain in the universe used to
 * lose a tenth of its coverage — roughly 0.055 of confidence — for a metric it
 * could never have had.
 */
const COVERAGE_KEYS = [
  "marketCap",
  "tvl",
  "stablecoins",
  "fees30d",
  "revenue30d",
  "dexVolume30d",
  "protocols",
  "tvlChange30d",
] as const satisfies readonly (keyof ChainMetrics)[];

export function scoreUniverse(rows: readonly ScoreInput[]): UniverseScores {
  const n = rows.length;

  /* ---- percentiles for every level, momentum and valuation metric ---- */

  const levelPercentiles = {} as Record<LevelKey, (number | null)[]>;
  for (const key of LEVEL_KEYS) {
    levelPercentiles[key] = percentileRanks(
      rows.map((row) => row.metrics[key] ?? null),
    );
  }

  const momentumPercentiles = {} as Record<MomentumKey, (number | null)[]>;
  for (const key of MOMENTUM_KEYS) {
    momentumPercentiles[key] = percentileRanks(
      rows.map((row) => row.metrics[key] ?? null),
    );
  }

  // Multiples are inverted: the cheapest chain gets the highest score.
  const cheapnessPercentiles = {} as Record<MultipleKey, (number | null)[]>;
  for (const key of MULTIPLE_KEYS) {
    const ranked = percentileRanks(rows.map((row) => row.multiples[key]));
    cheapnessPercentiles[key] = ranked.map((p) =>
      p === null ? null : 100 - p,
    );
  }

  const marketCapPercentiles = percentileRanks(
    rows.map((row) => row.metrics.marketCap),
  );

  /* ---- log-scale economic size index, the regression's x axis ---- */

  const scaleLogs = {} as Record<ScaleKey, (number | null)[]>;
  for (const key of SCALE_KEYS) {
    scaleLogs[key] = standardisedLogs(
      rows.map((row) => row.metrics[key] ?? null),
    );
  }

  const rawScaleIndex = rows.map((_, index) =>
    weightedMean(
      SCALE_KEYS.map((key) => ({
        value: scaleLogs[key][index] ?? null,
        weight: SCALE_WEIGHTS[key],
      })),
    ),
  );

  // Rescale to 0–100 so the scatter's x axis is readable without losing the
  // log-linear relationship the fit depends on.
  const presentScale = rawScaleIndex.filter(
    (value): value is number => value !== null,
  );
  const scaleMin = presentScale.length ? Math.min(...presentScale) : 0;
  const scaleMax = presentScale.length ? Math.max(...presentScale) : 1;
  const scaleSpan = scaleMax - scaleMin || 1;
  const fundamentalIndex = rawScaleIndex.map((value) =>
    value === null ? null : ((value - scaleMin) / scaleSpan) * 100,
  );

  /* ---- coverage denominator: only count inputs this run actually has ---- */

  const activeCoverageKeys = COVERAGE_KEYS.filter((key) =>
    rows.some((row) => row.metrics[key] !== null),
  );

  /* ---- per-chain composite scores ---- */

  interface Draft {
    row: ScoreInput;
    fundamental: number | null;
    fundamentalIndex: number | null;
    momentum: number | null;
    cheapness: number | null;
    cheapnessUnavailable: boolean;
    marketCapPercentile: number | null;
    rankGap: number | null;
    mispricing: number | null;
    confidence: number;
    coverage: number;
    percentiles: Record<string, number | null>;
    investable: boolean;
  }

  const drafts: Draft[] = rows.map((row, index) => {
    const fundamental = weightedMean(
      LEVEL_KEYS.map((key) => ({
        value: levelPercentiles[key][index] ?? null,
        weight: FUNDAMENTAL_WEIGHTS[key],
      })),
    );

    const momentum = weightedMean(
      MOMENTUM_KEYS.map((key) => ({
        value: momentumPercentiles[key][index] ?? null,
        weight: MOMENTUM_WEIGHTS[key],
      })),
    );

    const presentMultiples = MULTIPLE_KEYS.filter(
      (key) => cheapnessPercentiles[key][index] != null,
    ).length;

    const cheapnessUnavailable = presentMultiples < MIN_MULTIPLES_FOR_CHEAPNESS;

    const cheapness = cheapnessUnavailable
      ? null
      : weightedMean(
          MULTIPLE_KEYS.map((key) => ({
            value: cheapnessPercentiles[key][index] ?? null,
            weight: CHEAPNESS_WEIGHTS[key],
          })),
        );

    const marketCapPercentile = marketCapPercentiles[index] ?? null;
    const investable = row.metrics.marketCap !== null;

    const rankGap =
      fundamental !== null && marketCapPercentile !== null
        ? fundamental - marketCapPercentile
        : null;

    const mispricing = investable
      ? weightedMean([
          { value: rankGap, weight: COMPOSITE_WEIGHTS.rankGap },
          { value: recentre(cheapness), weight: COMPOSITE_WEIGHTS.cheapness },
          { value: recentre(momentum), weight: COMPOSITE_WEIGHTS.momentum },
        ])
      : null;

    const presentCount = activeCoverageKeys.filter(
      (key) => row.metrics[key] !== null,
    ).length;
    const coverage =
      activeCoverageKeys.length === 0
        ? 0
        : presentCount / activeCoverageKeys.length;

    const confidence = clamp(
      0.55 * coverage + 0.45 * sizeGate(row.metrics),
      0,
      1,
    );

    const percentiles: Record<string, number | null> = {
      marketCap: marketCapPercentile,
    };
    for (const key of LEVEL_KEYS)
      percentiles[key] = levelPercentiles[key][index] ?? null;
    for (const key of MOMENTUM_KEYS)
      percentiles[key] = momentumPercentiles[key][index] ?? null;
    for (const key of MULTIPLE_KEYS)
      percentiles[`cheap_${key}`] = cheapnessPercentiles[key][index] ?? null;

    return {
      row,
      fundamental,
      fundamentalIndex: fundamentalIndex[index] ?? null,
      momentum,
      cheapnessUnavailable,
      cheapness,
      marketCapPercentile,
      rankGap,
      mispricing: mispricing === null ? null : clamp(mispricing, -100, 100),
      confidence,
      coverage,
      percentiles,
      investable,
    };
  });

  /* ---- peer regression: ln(market cap) on fundamental score ---- */

  const fitPoints = drafts
    .filter(
      (draft) =>
        draft.investable &&
        draft.confidence >= 0.45 &&
        draft.fundamentalIndex !== null &&
        (draft.row.metrics.marketCap ?? 0) > 0,
    )
    .map(
      (draft) =>
        [
          draft.fundamentalIndex!,
          Math.log(draft.row.metrics.marketCap!),
        ] as const,
    );

  const regression = linearFit(fitPoints);

  /**
   * Only expose a peer-implied valuation when the fit actually explains
   * something. Below this, `impliedMarketCap` would be a confident-looking
   * number generated from noise.
   */
  const FIT_USABLE_R2 = 0.5;
  const fitUsable = regression !== null && regression.rSquared >= FIT_USABLE_R2;

  /* ---- medians for peer-relative copy ---- */

  const medians = Object.fromEntries(
    MULTIPLE_KEYS.map((key) => [
      key,
      median(rows.map((row) => row.multiples[key])),
    ]),
  ) as Record<MultipleKey, number | null>;

  /* ---- finalise ---- */

  const results = new Map<string, ScoreOutput>();

  for (const draft of drafts) {
    const logImplied =
      fitUsable && regression && draft.fundamentalIndex !== null
        ? regression.intercept + regression.slope * draft.fundamentalIndex
        : null;

    const impliedMarketCap = logImplied === null ? null : Math.exp(logImplied);
    const impliedMarketCapLow =
      logImplied === null || !regression
        ? null
        : Math.exp(logImplied - regression.residualSd);
    const impliedMarketCapHigh =
      logImplied === null || !regression
        ? null
        : Math.exp(logImplied + regression.residualSd);

    const currentMcap = draft.row.metrics.marketCap;
    const impliedUpside =
      impliedMarketCap !== null && currentMcap !== null && currentMcap > 0
        ? (impliedMarketCap / currentMcap - 1) * 100
        : null;

    const trendResidual =
      logImplied !== null &&
      regression !== null &&
      regression.residualSd > 0 &&
      currentMcap !== null &&
      currentMcap > 0
        ? (Math.log(currentMcap) - logImplied) / regression.residualSd
        : null;

    const valueTrapRisk =
      (draft.mispricing ?? 0) > 15 &&
      draft.momentum !== null &&
      draft.momentum < 30;

    results.set(draft.row.slug, {
      scores: {
        fundamental: draft.fundamental,
        fundamentalIndex: draft.fundamentalIndex,
        momentum: draft.momentum,
        cheapness: draft.cheapness,
        marketCapPercentile: draft.marketCapPercentile,
        rankGap: draft.rankGap,
        mispricing: draft.mispricing,
        confidence: draft.confidence,
        coverage: draft.coverage,
        cheapnessUnavailable: draft.cheapnessUnavailable,
      },
      percentiles: draft.percentiles,
      tier: classify(draft.mispricing, draft.confidence, draft.investable),
      valueTrapRisk,
      impliedMarketCap,
      impliedMarketCapLow,
      impliedMarketCapHigh,
      trendResidual,
      impliedUpside,
      investable: draft.investable,
    });
  }

  void n;
  return { results, regression, medians };
}

/**
 * Confidence damping for chains too small to act on. A $2M-TVL chain can post a
 * spectacular multiple purely because its denominator is noise.
 */
function sizeGate(metrics: ChainMetrics): number {
  const annualFees =
    metrics.fees30d === null ? 0 : metrics.fees30d * MONTHS_PER_YEAR;
  const scale = Math.max(
    metrics.tvl ?? 0,
    metrics.stablecoins ?? 0,
    annualFees * 20, // put a fee stream on the same footing as parked capital
  );
  if (scale <= 0) return 0;

  const low = Math.log10(SIZE_FLOOR.tvlUsd);
  const high = Math.log10(5_000_000_000);
  return clamp((Math.log10(scale) - low) / (high - low), 0, 1);
}

function classify(
  mispricing: number | null,
  confidence: number,
  investable: boolean,
): ValuationTier {
  if (!investable || mispricing === null) return "unrated";
  if (mispricing >= 25 && confidence >= 0.5) return "deep-value";
  if (mispricing >= 10) return "undervalued";
  if (mispricing <= -25) return "overvalued";
  if (mispricing <= -10) return "rich";
  return "fair";
}
