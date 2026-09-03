import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson, mapLimit } from "~/server/lib/http";

/**
 * Mayan adapter — cross-chain routing demand.
 *
 * Mayan is a cross-chain swap protocol; https://explorer.mayan.finance shows
 * where value is actually moving between chains right now. That makes it the one
 * genuinely *forward-looking* input in the model: bridge inflow tends to lead
 * TVL, which in turn leads price.
 *
 * A deliberate accuracy note. The per-swap `fromTokenPrice` field in the public
 * feed is unreliable — sampling it shows the destination asset's price attached
 * to the source leg (SOL quoted at $1, USDC quoted at $2,391), which inflates a
 * naive `amount × price` sum by more than an order of magnitude against Mayan's
 * own reported 24h total. So we never trust per-swap USD.
 *
 * What we do instead:
 *   • transfer *counts* per chain, which are reliable, give each chain's share
 *     of routing activity;
 *   • the protocol-level 24h volume from `/stats/overview`, which is reliable,
 *     is then allocated across chains by that share.
 *
 * The result is an estimate, and it is labelled as one everywhere it surfaces.
 */

const MAYAN = "https://explorer-api.mayan.finance/v3";

/** Page size accepted by the explorer API (101+ is rejected). */
const PAGE_SIZE = 100;
/** Pages to sample. 12 × 100 keeps the request budget small but the share stable. */
const PAGES = 12;

/* --------------------------------------------------------- chain mapping ---- */

/**
 * Wormhole chain ids as they appear in the Mayan feed.
 *
 * The mapping below was verified against the live feed by reading the gas-token
 * symbol of native (zero-address) transfers per id, which is why 47 is HyperEVM
 * and 48 is Monad rather than the other way round. Ids we cannot attribute are
 * folded into an "unmapped" bucket rather than guessed.
 */
export const WORMHOLE_CHAINS: Record<string, string> = {
  "1": "Solana",
  "2": "Ethereum",
  "4": "BSC",
  "5": "Polygon",
  "6": "Avalanche",
  "10": "Fantom",
  "14": "Celo",
  "15": "Near",
  "16": "Moonbeam",
  "19": "Injective",
  "21": "Sui",
  "22": "Aptos",
  "23": "Arbitrum",
  "24": "OP Mainnet",
  "25": "Gnosis",
  "29": "Bitcoin",
  "30": "Base",
  "32": "Sei",
  "33": "Rootstock",
  "34": "Scroll",
  "35": "Mantle",
  "36": "Blast",
  "37": "X Layer",
  "38": "Linea",
  "39": "Berachain",
  "43": "Unichain",
  "44": "World Chain",
  "45": "Ink",
  "47": "HyperEVM",
  "48": "Monad",
  "50": "Plume Mainnet",
  "52": "Sonic",
};

/* ------------------------------------------------------------- overview ---- */

export interface MayanOverview {
  volume24h: number | null;
  swaps24h: number | null;
  activeTraders24h: number | null;
  volumeAllTime: number | null;
  swapsAllTime: number | null;
}

export function fetchMayanOverview() {
  return cachedValue(
    "mayan:overview",
    { ttlSeconds: 300, staleSeconds: 3600 },
    async (): Promise<MayanOverview> => {
      const raw = await fetchJson<{
        last24h?: { volume?: number; swaps?: number; activeTraders?: number };
        allTime?: { volume?: number; swaps?: number };
      }>(`${MAYAN}/stats/overview`);

      return {
        volume24h: numberOrNull(raw.last24h?.volume),
        swaps24h: numberOrNull(raw.last24h?.swaps),
        activeTraders24h: numberOrNull(raw.last24h?.activeTraders),
        volumeAllTime: numberOrNull(raw.allTime?.volume),
        swapsAllTime: numberOrNull(raw.allTime?.swaps),
      };
    },
  );
}

/* ------------------------------------------------------------ per chain ---- */

export interface MayanChainFlow {
  /** DefiLlama-style chain name, so it joins straight onto the registry. */
  chain: string;
  inboundTransfers: number;
  outboundTransfers: number;
  /** Inbound minus outbound, in transfers. */
  netTransfers: number;
  /** Share of all sampled transfer legs, 0–1. */
  activityShare: number;
  /** Distinct trader addresses seen touching this chain in the sample. */
  traders: number;
  /** 24h inbound volume, estimated by allocating the protocol total by share. */
  estimatedInboundUsd: number | null;
  estimatedOutboundUsd: number | null;
  /** Estimated net 24h USD flow. Positive means capital arriving. */
  estimatedNetUsd: number | null;
}

export interface MayanFlows {
  chains: Record<string, MayanChainFlow>;
  overview: MayanOverview;
  /** How many swaps the shares were computed from. */
  sampleSize: number;
  /** Wall-clock span of the sample, in hours. */
  sampleWindowHours: number | null;
  /** Transfer legs whose chain id we could not attribute. */
  unmappedLegs: number;
}

interface RawSwap {
  trader?: string;
  sourceChain?: string;
  destChain?: string;
  clientStatus?: string;
  initiatedAt?: string;
}

export function fetchMayanFlows() {
  return cachedValue(
    "mayan:flows",
    { ttlSeconds: 300, staleSeconds: 1800 },
    async (): Promise<MayanFlows> => {
      const offsets = Array.from({ length: PAGES }, (_, i) => i * PAGE_SIZE);

      const [pages, overview] = await Promise.all([
        mapLimit(offsets, 4, async (offset) => {
          try {
            const raw = await fetchJson<{ data?: RawSwap[] }>(
              `${MAYAN}/swaps?limit=${PAGE_SIZE}&offset=${offset}`,
              { timeoutMs: 25_000, retries: 1 },
            );
            return raw.data ?? [];
          } catch {
            return [];
          }
        }),
        fetchMayanOverview(),
      ]);

      const swaps = pages
        .flat()
        // Refunded swaps never moved value; in-progress ones did initiate.
        .filter((swap) => swap.clientStatus !== "REFUNDED");

      const inbound = new Map<string, number>();
      const outbound = new Map<string, number>();
      const traders = new Map<string, Set<string>>();
      let legs = 0;
      let unmappedLegs = 0;
      let minTime = Number.POSITIVE_INFINITY;
      let maxTime = Number.NEGATIVE_INFINITY;

      const bump = (map: Map<string, number>, key: string) =>
        map.set(key, (map.get(key) ?? 0) + 1);

      for (const swap of swaps) {
        const time = swap.initiatedAt ? Date.parse(swap.initiatedAt) : NaN;
        if (Number.isFinite(time)) {
          minTime = Math.min(minTime, time);
          maxTime = Math.max(maxTime, time);
        }

        for (const [side, map] of [
          [swap.sourceChain, outbound],
          [swap.destChain, inbound],
        ] as const) {
          if (!side) continue;
          legs++;
          const chain = WORMHOLE_CHAINS[side];
          if (!chain) {
            unmappedLegs++;
            continue;
          }
          bump(map, chain);
          if (swap.trader) {
            const set = traders.get(chain) ?? new Set<string>();
            set.add(swap.trader);
            traders.set(chain, set);
          }
        }
      }

      const total24h = overview.volume24h;
      const chains: Record<string, MayanChainFlow> = {};
      const names = new Set([...inbound.keys(), ...outbound.keys()]);

      for (const chain of names) {
        const inboundTransfers = inbound.get(chain) ?? 0;
        const outboundTransfers = outbound.get(chain) ?? 0;
        const share = legs > 0 ? (inboundTransfers + outboundTransfers) / legs : 0;

        // Each swap contributes one inbound and one outbound leg, so the volume
        // to spread across legs is 2× the protocol total.
        const perLegUsd =
          total24h !== null && legs > 0 ? (total24h * 2) / legs : null;

        const estimatedInboundUsd =
          perLegUsd === null ? null : perLegUsd * inboundTransfers;
        const estimatedOutboundUsd =
          perLegUsd === null ? null : perLegUsd * outboundTransfers;

        chains[chain] = {
          chain,
          inboundTransfers,
          outboundTransfers,
          netTransfers: inboundTransfers - outboundTransfers,
          activityShare: share,
          traders: traders.get(chain)?.size ?? 0,
          estimatedInboundUsd,
          estimatedOutboundUsd,
          estimatedNetUsd:
            estimatedInboundUsd === null || estimatedOutboundUsd === null
              ? null
              : estimatedInboundUsd - estimatedOutboundUsd,
        };
      }

      const sampleWindowHours =
        Number.isFinite(minTime) && Number.isFinite(maxTime) && maxTime > minTime
          ? (maxTime - minTime) / 3_600_000
          : null;

      return {
        chains,
        overview,
        sampleSize: swaps.length,
        sampleWindowHours,
        unmappedLegs,
      };
    },
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
