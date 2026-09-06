import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson, mapLimit } from "~/server/lib/http";

/**
 * DefiLlama adapter — the capital & revenue side of the model.
 *
 * Everything here comes from DefiLlama's free, unauthenticated API, which is
 * the same data that renders https://defillama.com/chains.
 */

const LLAMA = "https://api.llama.fi";
const COINS = "https://coins.llama.fi";
const STABLES = "https://stablecoins.llama.fi";

/* ------------------------------------------------------------------ TVL ---- */

export interface LlamaChain {
  name: string;
  tvl: number | null;
  tokenSymbol: string | null;
  cmcId: string | null;
  gecko_id: string | null;
  chainId: number | string | null;
}

export function fetchChainsTvl() {
  return cachedValue(
    "llama:chains",
    { ttlSeconds: 300, staleSeconds: 3600 },
    async () => {
      const raw = await fetchJson<LlamaChain[]>(`${LLAMA}/v2/chains`);
      return raw.filter((c) => typeof c.name === "string");
    },
  );
}

export interface TvlPoint {
  date: number;
  tvl: number;
}

/** Daily TVL history for one chain, newest last. */
export function fetchChainTvlSeries(chain: string) {
  return cachedValue(
    `llama:tvlseries:${chain}`,
    { ttlSeconds: 900, staleSeconds: 7200 },
    () =>
      fetchJson<TvlPoint[]>(
        `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(chain)}`,
      ),
  );
}

/* ----------------------------------------------------------- stablecoins ---- */

/** Total stablecoin float per chain, in USD. */
export function fetchStablecoinsByChain() {
  return cachedValue(
    "llama:stablecoins",
    { ttlSeconds: 900, staleSeconds: 7200 },
    async () => {
      const raw = await fetchJson<
        { name: string; totalCirculatingUSD?: Record<string, number> }[]
      >(`${STABLES}/stablecoinchains`);

      const out: Record<string, number> = {};
      for (const row of raw) {
        if (!row?.name) continue;
        const total = Object.values(row.totalCirculatingUSD ?? {}).reduce(
          (sum, value) => sum + (Number.isFinite(value) ? value : 0),
          0,
        );
        out[row.name] = total;
      }
      return out;
    },
  );
}

/* ------------------------------------------------------ stablecoin growth ---- */

/**
 * Percent change in a chain's stablecoin float over 30 days.
 *
 * Stablecoin supply is the least gameable measure of whether anyone is actually
 * using a chain: it is money someone chose to settle there rather than
 * incentivised deposits chasing a yield. The direction of travel matters as much
 * as the level, so it feeds momentum as well as fundamentals.
 *
 * The history endpoint returns a chain's entire series with no date filter, so
 * only the tail is used. Values move slowly, hence the long cache.
 */
function fetchStablecoinGrowth(chain: string) {
  return cachedValue(
    `llama:stablegrowth:${chain}`,
    { ttlSeconds: 3600, staleSeconds: 21_600 },
    async (): Promise<number | null> => {
      try {
        const raw = await fetchJson<
          { totalCirculatingUSD?: Record<string, number> }[] | null
        >(`${STABLES}/stablecoincharts/${encodeURIComponent(chain)}`, {
          retries: 1,
          timeoutMs: 30_000,
          nullOn: [400, 404],
        });

        if (!Array.isArray(raw) || raw.length < 32) return null;

        const total = (index: number) =>
          Object.values(raw[index]?.totalCirculatingUSD ?? {}).reduce(
            (sum, value) => sum + (Number.isFinite(value) ? value : 0),
            0,
          );

        const now = total(raw.length - 1);
        const before = total(raw.length - 31);
        if (!before || before <= 0) return null;
        return (now / before - 1) * 100;
      } catch {
        return null;
      }
    },
  );
}

export async function fetchStablecoinGrowthForChains(
  chains: readonly string[],
) {
  const results = await mapLimit(chains, 8, async (chain) => {
    try {
      return [chain, await fetchStablecoinGrowth(chain)] as const;
    } catch {
      return [chain, null] as const;
    }
  });
  return Object.fromEntries(results) as Record<string, number | null>;
}

/* --------------------------------------------- ecosystem scan (one pass) ---- */

/**
 * `lite/protocols2` is a ~7 MB payload listing every protocol DefiLlama tracks,
 * with a per-chain TVL breakdown on each. It answers two questions at once, so
 * it is fetched once and projected into two small aggregates. Only the
 * projections are cached — the raw payload never goes near Redis.
 */
export interface EcosystemScan {
  /** Protocols deployed per chain. A rough proxy for ecosystem breadth. */
  protocolCounts: Record<string, number>;
  /** Real-world-asset value per chain, in USD. */
  rwaValue: Record<string, number>;
  /** Percent change in that RWA value versus a month ago. */
  rwaChange30d: Record<string, number>;
}

/** DefiLlama's own categories for tokenised real-world assets. */
const RWA_CATEGORIES = new Set(["RWA", "RWA Lending"]);

/**
 * `chainTvls` mixes real chain names with derived accounting buckets. Of the 134
 * distinct keys across RWA protocols, 59 are buckets: everything hyphenated
 * (`Ethereum-borrowed`, `Base-doublecounted`) plus these bare lowercase keys.
 * Summing them would double count and invent chains that do not exist.
 */
const NON_CHAIN_TVL_KEYS = new Set([
  "borrowed",
  "staking",
  "pool2",
  "vesting",
  "doublecounted",
  "excludeParent",
  "offers",
  "treasury",
]);

const isRealChainKey = (key: string) =>
  !key.includes("-") && !NON_CHAIN_TVL_KEYS.has(key);

interface RawProtocol {
  chains?: string[];
  category?: string;
  chainTvls?: Record<
    string,
    { tvl?: number | null; tvlPrevMonth?: number | null } | number | null
  >;
}

export function fetchEcosystemScan() {
  return cachedValue(
    "llama:ecosystem",
    { ttlSeconds: 3600, staleSeconds: 21_600 },
    async (): Promise<EcosystemScan> => {
      const raw = await fetchJson<{ protocols?: RawProtocol[] }>(
        `${LLAMA}/lite/protocols2`,
        { timeoutMs: 45_000 },
      );

      const protocolCounts: Record<string, number> = {};
      const rwaNow: Record<string, number> = {};
      const rwaPrev: Record<string, number> = {};

      for (const protocol of raw.protocols ?? []) {
        for (const chain of protocol.chains ?? []) {
          protocolCounts[chain] = (protocolCounts[chain] ?? 0) + 1;
        }

        if (!RWA_CATEGORIES.has(protocol.category ?? "")) continue;

        for (const [chain, entry] of Object.entries(protocol.chainTvls ?? {})) {
          if (!isRealChainKey(chain)) continue;
          if (!entry || typeof entry !== "object") continue;

          const current = numberOrNull(entry.tvl);
          const previous = numberOrNull(entry.tvlPrevMonth);
          if (current !== null) rwaNow[chain] = (rwaNow[chain] ?? 0) + current;
          if (previous !== null) {
            rwaPrev[chain] = (rwaPrev[chain] ?? 0) + previous;
          }
        }
      }

      const rwaChange30d: Record<string, number> = {};
      for (const [chain, current] of Object.entries(rwaNow)) {
        const previous = rwaPrev[chain];
        if (previous && previous > 0) {
          rwaChange30d[chain] = (current / previous - 1) * 100;
        }
      }

      return { protocolCounts, rwaValue: rwaNow, rwaChange30d };
    },
  );
}

/* ---------------------------------------------------- bridge aggregators ---- */

export interface BridgeVolume {
  total30d: number | null;
  total24h: number | null;
  change30d: number | null;
}

/**
 * Cross-chain volume routed through bridge aggregators.
 *
 * DefiLlama's dedicated bridges API (the one behind defillama.com/bridges/chains)
 * now returns 402 on every path, so per-chain deposit and withdrawal flow is not
 * available for free. This endpoint is, and it measures a closely related thing:
 * user-initiated cross-chain transfers routed through the 27 aggregator
 * front-ends DefiLlama tracks — LI.FI, Jumper, Socket, Rango and others.
 *
 * Mayan is deliberately not among those 27, so the two sources can be used
 * together without double counting.
 */
function fetchBridgeVolume(chain: string) {
  return cachedValue(
    `llama:bridgevolume:${chain}`,
    { ttlSeconds: 600, staleSeconds: 3600 },
    async (): Promise<BridgeVolume | null> => {
      const params = new URLSearchParams({
        excludeTotalDataChart: "true",
        excludeTotalDataChartBreakdown: "true",
      });

      try {
        const raw = await fetchJson<OverviewProtocol | null>(
          `${LLAMA}/overview/bridge-aggregators/${encodeURIComponent(chain)}?${params}`,
          { retries: 1, timeoutMs: 20_000, nullOn: [400, 404] },
        );
        if (!raw) return null;
        return {
          total30d: numberOrNull(raw.total30d),
          total24h: numberOrNull(raw.total24h),
          change30d: numberOrNull(raw.change_30dover30d),
        };
      } catch {
        // No aggregator routes to this chain. That is a real zero, not an outage.
        return null;
      }
    },
  );
}

export async function fetchBridgeVolumeForChains(chains: readonly string[]) {
  const results = await mapLimit(chains, 6, async (chain) => {
    try {
      return [chain, await fetchBridgeVolume(chain)] as const;
    } catch {
      return [chain, null] as const;
    }
  });
  return Object.fromEntries(results) as Record<string, BridgeVolume | null>;
}

/* -------------------------------------------------------------- markets ---- */

export interface MarketQuote {
  mcap: number | null;
  price: number | null;
  price30dAgo: number | null;
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/**
 * Circulating market cap plus spot / 7d / 30d prices for a set of CoinGecko ids.
 * Returned keys are bare gecko ids (the `coingecko:` prefix is stripped).
 */
export function fetchMarketQuotes(geckoIds: readonly string[]) {
  const ids = [...new Set(geckoIds.filter(Boolean))].sort();

  return cachedValue(
    `llama:markets:${ids.length}:${hash(ids.join(","))}`,
    { ttlSeconds: 300, staleSeconds: 3600 },
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const batches = chunk(ids, 40);

      const [mcapBatches, spotBatches, monthBatches] = await Promise.all([
        mapLimit(batches, 4, (batch) =>
          fetchJson<Record<string, { mcap?: number }>>(`${COINS}/mcaps`, {
            method: "POST",
            body: { coins: batch.map((id) => `coingecko:${id}`) },
            timeoutMs: 25_000,
          }).catch(() => ({})),
        ),
        mapLimit(batches, 4, (batch) => fetchPriceBatch(batch)),
        mapLimit(batches, 4, (batch) =>
          fetchPriceBatch(batch, now - 30 * 86_400),
        ),
      ]);

      const mcaps = Object.assign({}, ...mcapBatches) as Record<
        string,
        { mcap?: number }
      >;
      const spot = Object.assign({}, ...spotBatches) as Record<string, number>;
      const month = Object.assign({}, ...monthBatches) as Record<
        string,
        number
      >;

      const out: Record<string, MarketQuote> = {};
      for (const id of ids) {
        out[id] = {
          // DefiLlama returns `mcap: 0` as a placeholder when it has no supply
          // data (PulseChain, EOS, Mixin all do this). Zero is not a market cap,
          // and left as-is it makes every valuation multiple zero, which sends
          // the chain straight to the top of a "cheapest" ranking.
          mcap: positiveOrNull(mcaps[`coingecko:${id}`]?.mcap),
          price: numberOrNull(spot[id]),
          price30dAgo: numberOrNull(month[id]),
        };
      }
      return out;
    },
  );
}

async function fetchPriceBatch(
  ids: readonly string[],
  timestamp?: number,
): Promise<Record<string, number>> {
  const coins = ids.map((id) => `coingecko:${id}`).join(",");
  const url = timestamp
    ? `${COINS}/prices/historical/${timestamp}/${coins}`
    : `${COINS}/prices/current/${coins}`;

  try {
    const raw = await fetchJson<{
      coins?: Record<string, { price?: number }>;
    }>(url, { timeoutMs: 25_000 });

    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.coins ?? {})) {
      const id = key.replace(/^coingecko:/, "");
      if (typeof value?.price === "number") out[id] = value.price;
    }
    return out;
  } catch {
    return {};
  }
}

/* ----------------------------------------------------------- economics ---- */

/**
 * Fees and revenue earned by the chain itself.
 *
 * This deliberately does *not* use `/overview/fees/{chain}`, which sums every
 * fee-generating protocol deployed on that chain — for Ethereum that is $288M
 * over 30 days, against $10.4M the L1 actually earns. The ecosystem number is a
 * fine adoption signal but a wrong denominator for a token multiple, because
 * Uniswap's fees do not accrue to ETH.
 *
 * Instead we read the dimensions overview once and keep the entries DefiLlama
 * itself categorises as `Chain`. One request replaces a per-chain loop and fixes
 * the semantics at the same time.
 */
export interface ChainEconomics {
  fees30d: number | null;
  feesChange30d: number | null;
  revenue30d: number | null;
  revenueChange30d: number | null;
}

interface OverviewProtocol {
  name?: string;
  displayName?: string;
  slug?: string;
  category?: string;
  total24h?: number | null;
  total30d?: number | null;
  change_30dover30d?: number | null;
}

async function fetchChainCategoryTotals(
  dataType: "dailyFees" | "dailyRevenue",
) {
  const params = new URLSearchParams({
    excludeTotalDataChart: "true",
    excludeTotalDataChartBreakdown: "true",
    dataType,
  });

  const raw = await fetchJson<{ protocols?: OverviewProtocol[] }>(
    `${LLAMA}/overview/fees?${params}`,
    { timeoutMs: 45_000 },
  );

  const out: Record<
    string,
    { total30d: number | null; change: number | null }
  > = {};

  for (const entry of raw.protocols ?? []) {
    if (entry.category !== "Chain") continue;
    const name = entry.name ?? entry.displayName;
    if (!name) continue;
    out[name] = {
      total30d: numberOrNull(entry.total30d),
      change: numberOrNull(entry.change_30dover30d),
    };
  }

  return out;
}

/** Chain-level fees and revenue, keyed by DefiLlama chain name. */
export function fetchChainEconomics() {
  return cachedValue(
    "llama:chaineconomics",
    { ttlSeconds: 600, staleSeconds: 3600 },
    async (): Promise<Record<string, ChainEconomics>> => {
      const [fees, revenue] = await Promise.all([
        fetchChainCategoryTotals("dailyFees"),
        fetchChainCategoryTotals("dailyRevenue"),
      ]);

      const names = new Set([...Object.keys(fees), ...Object.keys(revenue)]);
      const out: Record<string, ChainEconomics> = {};

      for (const name of names) {
        out[name] = {
          fees30d: fees[name]?.total30d ?? null,
          feesChange30d: fees[name]?.change ?? null,
          revenue30d: revenue[name]?.total30d ?? null,
          revenueChange30d: revenue[name]?.change ?? null,
        };
      }

      return out;
    },
  );
}

/* ---------------------------------------------------------- dex volume ---- */

export interface DexVolume {
  total30d: number | null;
  total24h: number | null;
  change30d: number | null;
}

/**
 * Spot DEX volume routed on a chain. Unlike fees this is genuinely an
 * ecosystem-level measure and belongs at ecosystem scope, so the per-chain
 * endpoint is the right one.
 */
function fetchDexVolume(chain: string) {
  return cachedValue(
    `llama:dexvolume:${chain}`,
    { ttlSeconds: 600, staleSeconds: 3600 },
    async (): Promise<DexVolume | null> => {
      const params = new URLSearchParams({
        excludeTotalDataChart: "true",
        excludeTotalDataChartBreakdown: "true",
      });

      try {
        const raw = await fetchJson<OverviewProtocol | null>(
          `${LLAMA}/overview/dexs/${encodeURIComponent(chain)}?${params}`,
          { retries: 1, timeoutMs: 20_000, nullOn: [400, 404] },
        );
        if (!raw) return null;
        return {
          total30d: numberOrNull(raw.total30d),
          total24h: numberOrNull(raw.total24h),
          change30d: numberOrNull(raw.change_30dover30d),
        };
      } catch {
        // A chain with no DEX adapter returns a 500 rather than a 404. That is a
        // legitimate "no data", not an outage.
        return null;
      }
    },
  );
}

export async function fetchDexVolumeForChains(chains: readonly string[]) {
  const results = await mapLimit(chains, 6, async (chain) => {
    try {
      return [chain, await fetchDexVolume(chain)] as const;
    } catch {
      return [chain, null] as const;
    }
  });
  return Object.fromEntries(results) as Record<string, DexVolume | null>;
}

/* ---------------------------------------------------------------- utils ---- */

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Same, but treats zero and negatives as "no data" rather than a real value. */
function positiveOrNull(value: unknown): number | null {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

/** Tiny stable string hash, used only to key cache entries. */
function hash(input: string): string {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0).toString(36);
}
