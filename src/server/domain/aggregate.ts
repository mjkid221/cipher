import "server-only";

import { cached } from "~/server/cache/cached";
import { isRedisEnabled } from "~/server/cache/redis";
import { mapLimit, settle } from "~/server/lib/http";
import {
  fetchArtemisActivity,
  fetchArtemisChains,
  type ArtemisChain,
} from "~/server/sources/artemis";
import {
  fetchChainEconomics,
  fetchChainsTvl,
  fetchChainTvlSeries,
  fetchDexVolumeForChains,
  fetchMarketQuotes,
  fetchProtocolCountsByChain,
  fetchStablecoinsByChain,
  type LlamaChain,
  type TvlPoint,
} from "~/server/sources/defillama";
import { fetchMayanFlows, type MayanFlows } from "~/server/sources/mayan";
import {
  computeMultiples,
  scoreUniverse,
  type ScoreInput,
  type ScoreOutput,
} from "./score";
import type {
  AggregateMeta,
  AggregateResult,
  ChainMetrics,
  ChainSnapshot,
} from "./types";

/**
 * Builds the single denormalised snapshot the whole UI reads from.
 *
 * Cost control matters here: a cold build touches roughly 250 third-party
 * endpoints. The universe is therefore capped, every source module caches its
 * own slice, and the finished snapshot is itself cached under one key so a page
 * view is a single Redis read.
 */

/** Chains ranked into the model. Beyond this the data thins out to noise. */
const UNIVERSE_CAP = 55;
/** A chain must clear one of these to enter the universe at all. */
const ENTRY_FLOOR = { tvlUsd: 3_000_000 } as const;
/** Sparkline / change-derivation window. */
const SERIES_DAYS = 90;

const SNAPSHOT_KEY = "snapshot";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Chains where DefiLlama and Artemis disagree on the name *and* one side has no
 * CoinGecko id to join on. Kept deliberately tiny — the CoinGecko key resolves
 * every major chain on its own, so this is for genuine gaps only.
 */
const NAME_ALIASES: Record<string, string> = {
  // DefiLlama name (normalised) -> Artemis artemis_id
  hyperevm: "hyperliquid",
  hyperliquidl1: "hyperliquid",
  opmainnet: "optimism",
  zksyncera: "zksync",
  plumemainnet: "plume",
  bsc: "bsc",
  arbitrumnova: "arbitrum",
  polygonzkevm: "polygon",
  immutablezkevm: "immutable",
};

/* ------------------------------------------------------------------ join ---- */

interface JoinedChain {
  slug: string;
  name: string;
  llama: LlamaChain;
  artemis: ArtemisChain | null;
  geckoId: string | null;
}

function joinUniverse(
  llamaChains: readonly LlamaChain[],
  artemisChains: readonly ArtemisChain[],
): JoinedChain[] {
  const byGecko = new Map<string, ArtemisChain>();
  const byName = new Map<string, ArtemisChain>();

  for (const chain of artemisChains) {
    if (chain.geckoId) byGecko.set(chain.geckoId, chain);
    byName.set(norm(chain.title), chain);
    byName.set(norm(chain.artemisId), chain);
  }

  const byArtemisId = new Map(
    artemisChains.map((chain) => [chain.artemisId, chain]),
  );

  const candidates = llamaChains
    .filter((chain) => {
      const tvl = chain.tvl ?? 0;
      if (tvl >= ENTRY_FLOOR.tvlUsd) return true;
      // Keep an Artemis-tracked chain even if its DefiLlama TVL is thin.
      return (
        (chain.gecko_id ? byGecko.has(chain.gecko_id) : false) ||
        byName.has(norm(chain.name))
      );
    })
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, UNIVERSE_CAP);

  const seen = new Set<string>();
  const joined: JoinedChain[] = [];

  for (const llama of candidates) {
    // Strict matching only: an exact CoinGecko id, an exact name, or an explicit
    // alias. Fuzzy prefix matching produced false pairs (Lighter/LightLink,
    // Polkadot/Polkadex) and is not worth the corruption.
    const artemis =
      (llama.gecko_id ? byGecko.get(llama.gecko_id) : undefined) ??
      byName.get(norm(llama.name)) ??
      byArtemisId.get(NAME_ALIASES[norm(llama.name)] ?? "") ??
      null;

    const name = artemis?.title ?? llama.name;
    let slug = slugify(name);
    if (!slug || seen.has(slug)) slug = slugify(`${name}-${llama.name}`);
    if (seen.has(slug)) continue;
    seen.add(slug);

    joined.push({
      slug,
      name,
      llama,
      artemis,
      geckoId: llama.gecko_id ?? artemis?.geckoId ?? null,
    });
  }

  return joined;
}

/* ------------------------------------------------------------- build core ---- */

async function build(): Promise<AggregateResult> {
  const [
    llamaChainsResult,
    artemisChainsResult,
    stablecoinsResult,
    protocolCountsResult,
    mayanResult,
  ] = await Promise.all([
    settle("defillama:chains", fetchChainsTvl()),
    settle("artemis:chains", fetchArtemisChains()),
    settle("defillama:stablecoins", fetchStablecoinsByChain()),
    settle("defillama:protocols", fetchProtocolCountsByChain()),
    settle("mayan:flows", fetchMayanFlows()),
  ]);

  if (!llamaChainsResult) {
    throw new Error(
      "DefiLlama is unreachable — it supplies the chain universe, so there is " +
        "nothing to rank without it.",
    );
  }

  const llamaChains = llamaChainsResult;
  const artemisChains = artemisChainsResult ?? [];
  const stablecoins = stablecoinsResult ?? {};
  const protocolCounts = protocolCountsResult ?? {};
  const mayan: MayanFlows | null = mayanResult;

  const universe = joinUniverse(llamaChains, artemisChains);

  const geckoIds = universe
    .map((chain) => chain.geckoId)
    .filter((id): id is string => Boolean(id));

  const artemisIds = universe
    .map((chain) => chain.artemis?.artemisId)
    .filter((id): id is string => Boolean(id));

  const [
    marketsResult,
    economicsResult,
    dexVolumeResult,
    seriesEntries,
    activityResult,
  ] = await Promise.all([
      settle("defillama:markets", fetchMarketQuotes(geckoIds)),
      settle("defillama:economics", fetchChainEconomics()),
      settle(
        "defillama:dexvolume",
        fetchDexVolumeForChains(universe.map((chain) => chain.llama.name)),
      ),
      mapLimit(universe, 6, async (chain) => {
        try {
          const series = await fetchChainTvlSeries(chain.llama.name);
          return [chain.slug, series] as [string, TvlPoint[]];
        } catch {
          return [chain.slug, [] as TvlPoint[]] as [string, TvlPoint[]];
        }
      }),
      settle("artemis:activity", fetchArtemisActivity(artemisIds)),
    ]);

  const markets = marketsResult ?? {};
  const economics = economicsResult ?? {};
  const dexVolumes = dexVolumeResult ?? {};
  const activity = activityResult ?? null;
  const seriesBySlug = new Map(seriesEntries);

  /* ---- assemble raw metrics ---- */

  const assembled = universe.map((chain) => {
    const econ = economics[chain.llama.name] ?? null;
    const dex = dexVolumes[chain.llama.name] ?? null;

    const quote = chain.geckoId ? markets[chain.geckoId] : undefined;
    const usage = chain.artemis ? activity?.[chain.artemis.artemisId] : undefined;
    const flow = mayan?.chains[chain.llama.name];

    const rawSeries = seriesBySlug.get(chain.slug) ?? [];
    const tvlSeries = rawSeries
      .slice(-SERIES_DAYS)
      .map((point) => point.tvl)
      .filter((value) => typeof value === "number" && Number.isFinite(value));

    const metrics: ChainMetrics = {
      marketCap: quote?.mcap ?? null,
      price: quote?.price ?? null,
      priceChange7d: pctChange(quote?.price ?? null, quote?.price7dAgo ?? null),
      priceChange30d: pctChange(quote?.price ?? null, quote?.price30dAgo ?? null),

      tvl: chain.llama.tvl ?? null,
      tvlChange7d: seriesChange(tvlSeries, 7),
      tvlChange30d: seriesChange(tvlSeries, 30),

      stablecoins: stablecoins[chain.llama.name] ?? null,
      protocols: protocolCounts[chain.llama.name] ?? null,

      fees30d: econ?.fees30d ?? null,
      feesChange30d: econ?.feesChange30d ?? null,
      revenue30d: econ?.revenue30d ?? null,
      revenueChange30d: econ?.revenueChange30d ?? null,
      dexVolume30d: dex?.total30d ?? null,
      dexVolumeChange30d: dex?.change30d ?? null,

      dau: usage?.dau ?? null,
      dauChange30d: pctChange(usage?.dau ?? null, usage?.dauPrev ?? null),
      txns: usage?.txns ?? null,

      bridgeNetUsd: flow?.estimatedNetUsd ?? null,
      bridgeInboundTransfers: flow?.inboundTransfers ?? null,
      bridgeOutboundTransfers: flow?.outboundTransfers ?? null,
      bridgeTraders: flow?.traders ?? null,
    };

    return { chain, metrics, tvlSeries };
  });

  /* ---- score the universe ---- */

  const scoreInputs: ScoreInput[] = assembled.map(({ chain, metrics }) => ({
    slug: chain.slug,
    metrics,
    multiples: computeMultiples(metrics),
  }));

  const { results, regression, medians } = scoreUniverse(scoreInputs);

  const multiplesBySlug = new Map(
    scoreInputs.map((input) => [input.slug, input.multiples]),
  );

  /* ---- rank for the thesis copy ---- */

  const fundamentalOrder = [...assembled]
    .map(({ chain }) => ({
      slug: chain.slug,
      score: results.get(chain.slug)?.scores.fundamental ?? -1,
    }))
    .sort((a, b) => b.score - a.score);
  const fundamentalRank = new Map(
    fundamentalOrder.map((entry, index) => [entry.slug, index + 1]),
  );

  const mcapOrder = [...assembled]
    .map(({ chain, metrics }) => ({ slug: chain.slug, mcap: metrics.marketCap ?? -1 }))
    .sort((a, b) => b.mcap - a.mcap);
  const mcapRank = new Map(
    mcapOrder.map((entry, index) => [entry.slug, index + 1]),
  );

  /* ---- final snapshots ---- */

  const chains: ChainSnapshot[] = assembled.map(({ chain, metrics, tvlSeries }) => {
    const score = results.get(chain.slug)!;
    const multiples = multiplesBySlug.get(chain.slug)!;

    return {
      slug: chain.slug,
      name: chain.name,
      symbol: chain.artemis?.symbol ?? chain.llama.tokenSymbol ?? null,
      logoUrl: chain.artemis?.logoUrl ?? null,
      brandColor: chain.artemis?.brandColor ?? null,
      description: chain.artemis?.description ?? null,
      founded: chain.artemis?.founded ?? null,
      founders: chain.artemis?.founders ?? null,
      website: chain.artemis?.website ?? null,
      twitter: chain.artemis?.twitter ?? null,
      github: chain.artemis?.github ?? null,
      explorer: chain.artemis?.explorer ?? null,
      keys: {
        llamaName: chain.llama.name,
        artemisId: chain.artemis?.artemisId ?? null,
        geckoId: chain.geckoId,
      },
      metrics,
      multiples,
      scores: score.scores,
      percentiles: score.percentiles,
      tier: score.tier,
      valueTrapRisk: score.valueTrapRisk,
      impliedMarketCap: score.impliedMarketCap,
      impliedMarketCapLow: score.impliedMarketCapLow,
      impliedMarketCapHigh: score.impliedMarketCapHigh,
      trendResidual: score.trendResidual,
      impliedUpside: score.impliedUpside,
      investable: score.investable,
      tvlSeries,
      thesis: buildThesis({
        name: chain.name,
        metrics,
        multiples,
        score,
        medians,
        fundamentalRank: fundamentalRank.get(chain.slug) ?? null,
        mcapRank: mcapRank.get(chain.slug) ?? null,
        universeSize: assembled.length,
      }),
    };
  });

  chains.sort(
    (a, b) => (b.scores.mispricing ?? -999) - (a.scores.mispricing ?? -999),
  );

  const meta: AggregateMeta = {
    generatedAt: new Date().toISOString(),
    sources: [
      {
        id: "defillama",
        label: "DefiLlama",
        url: "https://defillama.com/chains",
        status: llamaChainsResult ? "ok" : "unavailable",
        note: "TVL, stablecoin float, DEX volume, fees, revenue, market caps",
      },
      {
        id: "artemis",
        label: "Artemis",
        url: "https://www.artemis.ai/sectors/chains",
        status: artemisChains.length
          ? activity
            ? "ok"
            : "degraded"
          : "unavailable",
        note: artemisChains.length
          ? activity
            ? "Chain universe, identity, daily active addresses, transactions"
            : "Chain universe and identity. Set ARTEMIS_API_KEY to add active addresses and transactions."
          : "Unreachable",
      },
      {
        id: "mayan",
        label: "Mayan Explorer",
        url: "https://explorer.mayan.finance/",
        status: mayan ? "ok" : "unavailable",
        note: mayan
          ? `Cross-chain routing flow, estimated from ${mayan.sampleSize.toLocaleString()} recent swaps`
          : "Unreachable",
      },
    ],
    regression,
    mayan: mayan
      ? {
          volume24h: mayan.overview.volume24h,
          swaps24h: mayan.overview.swaps24h,
          activeTraders24h: mayan.overview.activeTraders24h,
          sampleSize: mayan.sampleSize,
          sampleWindowHours: mayan.sampleWindowHours,
        }
      : null,
    universeSize: chains.length,
    ratedCount: chains.filter((chain) => chain.tier !== "unrated").length,
    cache: { enabled: isRedisEnabled(), ageSeconds: 0, stale: false, tier: "origin" },
  };

  return { chains, meta };
}

/* ---------------------------------------------------------------- public ---- */

/** The cached snapshot every route and page reads. */
export async function getSnapshot(): Promise<AggregateResult> {
  const result = await cached(
    SNAPSHOT_KEY,
    { ttlSeconds: 300, staleSeconds: 3600 },
    build,
  );

  return {
    chains: result.data.chains,
    meta: {
      ...result.data.meta,
      cache: {
        enabled: isRedisEnabled(),
        ageSeconds: Math.round(result.ageSeconds),
        stale: result.stale,
        tier: result.tier,
      },
    },
  };
}

/* ----------------------------------------------------------------- utils ---- */

function pctChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return (current / previous - 1) * 100;
}

/** Percent change over `days`, read off the tail of a daily series. */
function seriesChange(series: readonly number[], days: number) {
  if (series.length < days + 1) return null;
  const current = series[series.length - 1]!;
  const past = series[series.length - 1 - days]!;
  if (!past) return null;
  return (current / past - 1) * 100;
}

/* ---------------------------------------------------------------- thesis ---- */

interface ThesisInput {
  name: string;
  metrics: ChainMetrics;
  multiples: ReturnType<typeof computeMultiples>;
  score: ScoreOutput;
  medians: Record<string, number | null>;
  fundamentalRank: number | null;
  mcapRank: number | null;
  universeSize: number;
}

const pct = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}%`;

const money = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

/**
 * The plain-language case for (or against) each chain. Deliberately built from
 * the same numbers the score uses, so the copy can never drift from the model.
 */
function buildThesis({
  metrics,
  multiples,
  score,
  medians,
  fundamentalRank,
  mcapRank,
  universeSize,
}: ThesisInput): string[] {
  const lines: string[] = [];
  const { scores } = score;

  if (!score.investable) {
    lines.push(
      "No liquid native asset, so there is nothing to value. Shown for its fundamentals only.",
    );
  }

  if (
    fundamentalRank !== null &&
    mcapRank !== null &&
    score.investable &&
    mcapRank - fundamentalRank >= 4
  ) {
    lines.push(
      `Ranks #${fundamentalRank} of ${universeSize} on fundamentals but only #${mcapRank} by market cap.`,
    );
  }

  if (
    metrics.feesChange30d !== null &&
    metrics.priceChange30d !== null &&
    metrics.feesChange30d > 15 &&
    metrics.priceChange30d < 0
  ) {
    lines.push(
      `Fees ${pct(metrics.feesChange30d)} over 30 days while the token moved ${pct(metrics.priceChange30d)} — the divergence this screen looks for.`,
    );
  } else if (metrics.feesChange30d !== null && metrics.feesChange30d > 40) {
    lines.push(
      `Fee revenue ${pct(metrics.feesChange30d)} versus the prior 30 days.`,
    );
  }

  const feeMultiple = multiples.mcapToFees;
  const feeMedian = medians.mcapToFees ?? null;
  if (feeMultiple !== null && feeMedian !== null) {
    if (feeMultiple < feeMedian * 0.6) {
      lines.push(
        `Trades at ${feeMultiple.toFixed(0)}× annualised fees against a peer median of ${feeMedian.toFixed(0)}×.`,
      );
    } else if (feeMultiple > feeMedian * 2.5) {
      lines.push(
        `Trades at ${feeMultiple.toFixed(0)}× annualised fees, well above the ${feeMedian.toFixed(0)}× peer median.`,
      );
    }
  }

  if (multiples.mcapToTvl !== null && multiples.mcapToTvl < 1) {
    lines.push(
      `Market cap sits below the capital secured on the chain, at ${multiples.mcapToTvl.toFixed(2)}× TVL.`,
    );
  }

  if (metrics.bridgeNetUsd !== null && Math.abs(metrics.bridgeNetUsd) > 50_000) {
    lines.push(
      metrics.bridgeNetUsd > 0
        ? `Net cross-chain inflow of about ${money(metrics.bridgeNetUsd)} in the last 24 hours.`
        : `Net cross-chain outflow of about ${money(Math.abs(metrics.bridgeNetUsd))} in the last 24 hours.`,
    );
  }

  if (score.valueTrapRisk) {
    lines.push(
      "Cheap on the multiples, but the underlying activity is contracting. Classic value-trap shape.",
    );
  }

  if (
    scores.momentum !== null &&
    scores.momentum >= 75 &&
    scores.fundamental !== null &&
    scores.fundamental >= 60
  ) {
    lines.push(
      "Top-quartile growth on an already-large base, which is the rarer combination.",
    );
  }

  if (score.trendResidual !== null && Math.abs(score.trendResidual) >= 0.75) {
    const sigma = Math.abs(score.trendResidual).toFixed(1);
    lines.push(
      score.trendResidual < 0
        ? `Priced ${sigma}σ below the peer trend for its economic scale, on a fit that leaves wide error bars.`
        : `Priced ${sigma}σ above the peer trend for its economic scale.`,
    );
  }

  if (scores.confidence < 0.45) {
    lines.push(
      "Thin or incomplete data. Treat the score as directional rather than actionable.",
    );
  }

  if (lines.length === 0) {
    lines.push(
      "Fundamentals and valuation sit close to peer averages. No clear dislocation.",
    );
  }

  return lines.slice(0, 5);
}
