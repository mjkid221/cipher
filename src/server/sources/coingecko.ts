import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import type { TopMarketRow } from "~/server/domain/market-types";

/**
 * CoinGecko adapter — market attention, in one request.
 *
 * This exists because the obvious social sources do not work. X's API starts
 * around $200/month. CoinGecko's own `community_data` is nulled out on the free
 * tier. And the per-coin endpoint that does carry sentiment votes throttles
 * after **four** sequential calls, against the forty-odd this app needs — so
 * that route is not merely slow, it is unusable.
 *
 * The markets endpoint takes every id at once, needs no key, and carries three
 * things worth having:
 *
 *   • 24h trading volume — liquidity, which is the honest version of "attention"
 *   • distance from the all-time high — a sentiment proxy that costs nothing
 *   • fully diluted valuation — see below
 *
 * FDV is the reason this adapter earns its place. The model values chains on
 * *circulating* market cap, which quietly flatters any chain with a large unlock
 * ahead: Hyperliquid trades at over four times its circulating cap. None of this
 * feeds the score, but the dilution overhang is shown wherever a chain is called
 * cheap.
 */

const API = "https://api.coingecko.com/api/v3";

/** Which layer a chain sits on, where CoinGecko classifies it. */
export type ChainLayer = "L1" | "L2";

/**
 * L1 and L2 membership, from CoinGecko's own categories.
 *
 * DefiLlama carries no layer or parent field, and hand-maintaining a list of
 * which chains are rollups would go stale by the month. CoinGecko already
 * classifies them and its markets endpoint takes a category filter, so this is
 * two bulk requests against a taxonomy somebody else keeps current.
 *
 * A chain in neither list is left unclassified rather than guessed. Several are
 * genuinely neither — appchains, sidechains and validiums do not fit the split.
 */
export function fetchChainLayers() {
  return cachedValue(
    "coingecko:layers",
    { ttlSeconds: 86_400, staleSeconds: 172_800 },
    async (): Promise<Record<string, ChainLayer>> => {
      const out: Record<string, ChainLayer> = {};

      for (const [category, layer] of [
        ["layer-1", "L1"],
        ["layer-2", "L2"],
      ] as const) {
        try {
          const raw = await fetchJson<{ id?: string }[]>(
            `${API}/coins/markets?vs_currency=usd&category=${category}&per_page=250&sparkline=false`,
            { timeoutMs: 30_000, retries: 2 },
          );
          for (const row of Array.isArray(raw) ? raw : []) {
            // L2 wins a tie: a few tokens sit in both categories, and the
            // rollup label is the more specific claim.
            if (row.id && (layer === "L2" || !out[row.id])) out[row.id] = layer;
          }
        } catch (error) {
          console.warn(
            `[source:coingecko] ${category} membership failed —`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      return out;
    },
  );
}

export interface MarketAttention {
  /** Fully diluted valuation, USD. */
  fdv: number | null;
  /** 24h spot trading volume across exchanges, USD. */
  tradingVolume24h: number | null;
  /** Percent below the all-time high. Negative. */
  fromAllTimeHigh: number | null;
  /** CoinGecko's own market-cap rank. */
  marketCapRank: number | null;
}

interface RawMarket {
  id?: string;
  fully_diluted_valuation?: number | null;
  total_volume?: number | null;
  ath_change_percentage?: number | null;
  market_cap_rank?: number | null;
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

export function fetchMarketAttention(geckoIds: readonly string[]) {
  const ids = [...new Set(geckoIds.filter(Boolean))].sort();

  return cachedValue(
    `coingecko:attention:${ids.length}`,
    // Long TTL on purpose. The free tier rate-limits aggressively and none of
    // this moves fast enough to justify pressing it.
    { ttlSeconds: 1800, staleSeconds: 21_600 },
    async (): Promise<Record<string, MarketAttention>> => {
      if (ids.length === 0) return {};

      const out: Record<string, MarketAttention> = {};

      // 250 is the endpoint's page size; chains fit in one request today, but
      // the universe cap could rise.
      for (const batch of chunk(ids, 250)) {
        const params = new URLSearchParams({
          vs_currency: "usd",
          ids: batch.join(","),
          per_page: "250",
          sparkline: "false",
        });

        try {
          const raw = await fetchJson<RawMarket[]>(
            `${API}/coins/markets?${params}`,
            { timeoutMs: 30_000, retries: 2 },
          );

          for (const row of Array.isArray(raw) ? raw : []) {
            if (!row.id) continue;
            out[row.id] = {
              fdv: positive(row.fully_diluted_valuation),
              tradingVolume24h: positive(row.total_volume),
              fromAllTimeHigh: numberOrNull(row.ath_change_percentage),
              marketCapRank: positive(row.market_cap_rank),
            };
          }
        } catch (error) {
          // A throttled or unreachable CoinGecko costs the attention panel,
          // nothing else. Every scored metric comes from elsewhere.
          console.warn(
            "[source:coingecko] attention request failed —",
            error instanceof Error ? error.message : error,
          );
        }
      }

      return out;
    },
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value: unknown): number | null {
  const n = numberOrNull(value);
  return n !== null && n > 0 ? n : null;
}

/* ------------------------------------------------------------- top 100 ---- */

/**
 * The 100 largest coins with current circulating supply.
 *
 * This is the universe for the altcoin season index and the supply used to
 * turn DefiLlama's daily prices into an approximate market cap. Both change
 * slowly, so a six-hour TTL is plenty and keeps the free tier's rate limit far
 * away — this app was throttled today by a burst of a dozen calls.
 */
export function fetchTopMarkets() {
  return cachedValue(
    "coingecko:top100:v2",
    { ttlSeconds: 21_600, staleSeconds: 86_400 },
    async (): Promise<TopMarketRow[]> => {
      const params = new URLSearchParams({
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: "100",
        page: "1",
        sparkline: "false",
      });
      const raw = await fetchJson<
        {
          id?: string;
          symbol?: string;
          name?: string;
          current_price?: number | null;
          market_cap?: number | null;
          circulating_supply?: number | null;
        }[]
      >(`${API}/coins/markets?${params}`, { timeoutMs: 10_000, retries: 1 });

      return (Array.isArray(raw) ? raw : [])
        .filter((row) => typeof row.id === "string")
        .map((row) => ({
          id: row.id!,
          symbol: (row.symbol ?? "").toUpperCase(),
          name: row.name ?? row.id!,
          price: numberOrNull(row.current_price),
          marketCap: positive(row.market_cap),
          circulatingSupply: positive(row.circulating_supply),
        }));
    },
  );
}
