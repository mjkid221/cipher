import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";

/**
 * Artemis adapter — the chain universe, its identity, and on-chain usage.
 *
 * Two tiers, deliberately separated:
 *
 *   • The asset directory behind https://www.artemis.ai/sectors/chains is open.
 *     It gives us the canonical list of 100+ chains with CoinGecko ids, brand
 *     colours, logos, descriptions and links. That is what we use to define the
 *     universe and to join DefiLlama to Artemis without a hand-written alias
 *     table.
 *
 *   • The cross-chain flow data behind /sectors/flows is open too, and is the
 *     broadest flow source available at 35 chains.
 *
 * Artemis needs no API key for any of this. It did once, for daily active
 * addresses and transaction counts — the only endpoints here that are gated —
 * but those are vanity metrics that say more about airdrop farming than about a
 * chain's economics, so they were dropped from the model and the key with them.
 */

const DATA_SVC = "https://data-svc.artemisxyz.com";

/* ------------------------------------------------------- chain directory ---- */

export interface ArtemisChain {
  artemisId: string;
  symbol: string;
  geckoId: string | null;
  title: string;
  /** Official brand colour. Used for identity marks only, never for encoding. */
  brandColor: string | null;
  logoUrl: string | null;
  description: string | null;
  founders: string | null;
  founded: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  explorer: string | null;
}

interface RawAsset {
  artemis_id?: string;
  symbol?: string;
  coingecko_id?: string | null;
  title?: string;
  color?: string | null;
  thumbnail_url?: string | null;
  visibility?: number;
  metadata?: {
    about?: {
      description?: string | null;
      authors?: string | null;
      foundation?: string | null;
      asset_types?: { label?: string; value?: string }[] | null;
      exclude_from_search_directory?: boolean;
    } | null;
    links?: {
      website?: string | null;
      twitter?: string | null;
      github?: string | null;
      block_explorer?: string | null;
    } | null;
  } | null;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
};

/**
 * Every asset Artemis classifies as a Chain. The upstream payload is ~5 MB, so
 * only the projected result is cached.
 */
export function fetchArtemisChains() {
  return cachedValue(
    "artemis:chains",
    { ttlSeconds: 21_600, staleSeconds: 86_400 },
    async (): Promise<ArtemisChain[]> => {
      const raw = await fetchJson<{ assets?: RawAsset[] }>(
        `${DATA_SVC}/asset/`,
        {
          timeoutMs: 45_000,
        },
      );

      const chains: ArtemisChain[] = [];

      for (const asset of raw.assets ?? []) {
        const about = asset.metadata?.about;
        const isChain = (about?.asset_types ?? []).some(
          (type) => type?.label === "Chain" || type?.value === "Chain",
        );
        if (!isChain || !asset.artemis_id || !asset.title) continue;

        chains.push({
          artemisId: asset.artemis_id,
          symbol: (asset.symbol ?? "").toUpperCase(),
          geckoId: clean(asset.coingecko_id),
          title: asset.title,
          brandColor: normaliseHex(asset.color),
          logoUrl: clean(asset.thumbnail_url),
          description: clean(about?.description),
          founders: clean(about?.authors),
          founded: clean(about?.foundation),
          website: clean(asset.metadata?.links?.website),
          twitter: clean(asset.metadata?.links?.twitter),
          github: clean(asset.metadata?.links?.github),
          explorer: clean(asset.metadata?.links?.block_explorer),
        });
      }

      return chains.sort((a, b) => a.title.localeCompare(b.title));
    },
  );
}

function normaliseHex(value: string | null | undefined): string | null {
  const hex = value?.trim();
  if (!hex) return null;
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

/* -------------------------------------------------------- capital flows ---- */

/**
 * Cross-chain capital flow, from the data behind
 * https://www.artemis.ai/sectors/flows.
 *
 * This one is open, unlike the per-chain usage metrics above, and it is the
 * broadest flow source available: 35 chains with real inflow, outflow and net
 * figures in USD, against the 13 Mayan reaches. Mayan still answers a question
 * Artemis does not — which specific routes carry the volume — so the two are
 * complementary rather than redundant.
 *
 * Passing no `sourceChains` filter returns every chain Artemis tracks. Naming a
 * subset instead restricts the aggregation to flows *between* those chains,
 * which quietly understates every one of them, so the filter is deliberately
 * omitted.
 */
export interface ChainFlow {
  /** Artemis chain id, which is how the rest of the app joins to Artemis. */
  artemisId: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  /**
   * What Artemis attributes to each named bridge (across, debridge, usdt0,
   * wormhole). These sum to well under the totals — the rest is canonical
   * bridges and unnamed routes — and they are what lets the combined view add a
   * bridge's own, fuller figures without counting the attributed part twice.
   */
  byBridge: Record<string, { inflowUsd: number; outflowUsd: number }>;
}

/** One directed route between two chains, in USD. */
export interface FlowCorridor {
  from: string;
  to: string;
  volumeUsd: number;
}

export interface ArtemisFlows {
  chains: ChainFlow[];
  /**
   * Routes between chains. Artemis reports each chain's largest counterparties
   * rather than a complete matrix, so this is the busiest routes rather than
   * every route — but it spans far more chains than any complete matrix on
   * offer.
   */
  corridors: FlowCorridor[];
  /** Trailing window these figures cover, in days. */
  windowDays: number;
}

/**
 * Thirty days rather than seven. It roughly doubles how many chains appear in
 * the route breakdown, and a month of flow is a steadier signal than a week.
 */
const FLOW_WINDOW_DAYS = 30;

interface RawFlowRow {
  value?: string;
  parent?: string | null;
  inflow?: number;
  outflow?: number;
  netflow?: number;
}

export function fetchArtemisFlows() {
  return cachedValue(
    "artemis:flows",
    { ttlSeconds: 1800, staleSeconds: 7200 },
    async (): Promise<ArtemisFlows> => {
      const end = new Date();
      const start = new Date(end.getTime() - FLOW_WINDOW_DAYS * 86_400_000);
      const params = new URLSearchParams({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        granularity: "DAY",
      });

      const raw = await fetchJson<RawFlowRow[]>(
        `${DATA_SVC}/flows/netflows-table/?${params}`,
        { timeoutMs: 45_000 },
      );

      const rows = Array.isArray(raw) ? raw : [];
      const chains: ChainFlow[] = [];
      const chainIds = new Set<string>();

      for (const row of rows) {
        // Top-level rows are the chains themselves.
        if (row.parent !== null && row.parent !== undefined) continue;

        const artemisId = row.value?.trim();
        // Artemis buckets flows it cannot attribute under `unmapped:<n>`.
        if (!artemisId || artemisId.startsWith("unmapped")) continue;

        const inflowUsd = numberOr(row.inflow, 0);
        const outflowUsd = numberOr(row.outflow, 0);
        if (inflowUsd === 0 && outflowUsd === 0) continue;

        chainIds.add(artemisId);
        chains.push({
          artemisId,
          inflowUsd,
          outflowUsd,
          netUsd: numberOr(row.netflow, inflowUsd - outflowUsd),
          byBridge: {},
        });
      }
      const byId = new Map(chains.map((chain) => [chain.artemisId, chain]));

      // Child rows mix two different things: counterparty *chains* and the
      // *bridges* that carried the value (across, debridge, usdt0, wormhole).
      // Keeping only children that name a chain turns the tree into a route map.
      const corridors: FlowCorridor[] = [];

      for (const row of rows) {
        const parent = row.parent?.trim();
        const child = row.value?.trim();
        if (!parent || !child) continue;
        if (parent === child) continue;
        if (!chainIds.has(parent)) continue;

        // A child that is not a chain is a bridge: what Artemis attributes to
        // it, from this chain's point of view.
        if (!chainIds.has(child)) {
          if (!child.startsWith("unmapped")) {
            const owner = byId.get(parent);
            if (owner) {
              owner.byBridge[child] = {
                inflowUsd: numberOr(row.inflow, 0),
                outflowUsd: numberOr(row.outflow, 0),
              };
            }
          }
          continue;
        }

        // A row under `ethereum` named `arbitrum` describes the pair from
        // Ethereum's point of view: its `outflow` left Ethereum for Arbitrum.
        const out = numberOr(row.outflow, 0);
        const inn = numberOr(row.inflow, 0);
        if (out > 0)
          corridors.push({ from: parent, to: child, volumeUsd: out });
        if (inn > 0)
          corridors.push({ from: child, to: parent, volumeUsd: inn });
      }

      chains.sort((a, b) => b.netUsd - a.netUsd);
      corridors.sort((a, b) => b.volumeUsd - a.volumeUsd);
      return { chains, corridors, windowDays: FLOW_WINDOW_DAYS };
    },
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
