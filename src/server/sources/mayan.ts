import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";

/**
 * Mayan adapter — where capital is actually routing between chains.
 *
 * Mayan publishes an aggregate corridor matrix at `/v3/stats/chains-overview`:
 * for every chain, the USD volume flowing in from and out to every other chain,
 * over a 24h, 7d or 30d window. It is the same data the public explorer renders,
 * and it is authoritative.
 *
 * An earlier version of this adapter did not use it. It sampled a few thousand
 * recent swaps and counted *transfers* per chain, on the reasoning that the
 * per-swap `fromTokenPrice` field is unreliable — which it is, often carrying the
 * destination asset's price on the source leg. Avoiding those prices was right;
 * concluding that dollars were therefore unavailable was not.
 *
 * The cost of that mistake was large. Transfer counts assume every swap is
 * roughly the same size, and on Mayan they are not: Monad carried about 0.7% of
 * transfers but nearly 12% of volume, because the swaps routing through it are
 * far larger than average. Counting them made a major destination look like a
 * rounding error.
 *
 * This version reads the aggregate directly. One request replaces forty, the
 * window is thirty days rather than five hours, and the figures are real dollars.
 */

const EXPLORER = "https://explorer-api.mayan.finance/v3";
const PRICE_API = "https://price-api.mayan.finance/v3";

/** Windows the endpoint accepts. Anything else silently returns all-time. */
export type MayanWindow = "24h" | "7d" | "30d";

/**
 * Thirty days, to match the Artemis flow window.
 *
 * These two sources sit behind a toggle in the same panel. Running them over
 * different periods meant switching source changed two variables at once — the
 * bridges counted *and* the timespan — which made the two views impossible to
 * compare.
 */
const WINDOW: MayanWindow = "30d";

/** Separator for corridor keys. A space cannot appear in a DefiLlama slug pair. */
const KEY_SEP = "->";

/**
 * Mayan chain slug to DefiLlama chain name.
 *
 * A genuine naming join, not a guess: Mayan says `optimism`, DefiLlama says
 * `OP Mainnet`. Mayan's two Hyperliquid environments both settle onto the single
 * chain DefiLlama tracks, so their volumes are summed.
 */
const MAYAN_TO_LLAMA: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  bsc: "BSC",
  polygon: "Polygon",
  avalanche: "Avalanche",
  arbitrum: "Arbitrum",
  optimism: "OP Mainnet",
  base: "Base",
  sui: "Sui",
  aptos: "Aptos",
  linea: "Linea",
  unichain: "Unichain",
  monad: "Monad",
  sonic: "Sonic",
  fogo: "Fogo",
  hyperevm: "Hyperliquid L1",
  hypercore: "Hyperliquid L1",
};

/* ------------------------------------------------------------- overview ---- */

export interface MayanOverview {
  volume24h: number | null;
  swaps24h: number | null;
  activeTraders24h: number | null;
  /** Lifetime volume; the yardstick that shows whether a window was honoured. */
  volumeAllTime: number | null;
}

export function fetchMayanOverview() {
  return cachedValue(
    "mayan:overview",
    { ttlSeconds: 300, staleSeconds: 3600 },
    async (): Promise<MayanOverview> => {
      const raw = await fetchJson<{
        last24h?: { volume?: number; swaps?: number; activeTraders?: number };
        allTime?: { volume?: number };
      }>(`${EXPLORER}/stats/overview`);

      return {
        volume24h: numberOrNull(raw.last24h?.volume),
        swaps24h: numberOrNull(raw.last24h?.swaps),
        activeTraders24h: numberOrNull(raw.last24h?.activeTraders),
        volumeAllTime: numberOrNull(raw.allTime?.volume),
      };
    },
  );
}

/* ------------------------------------------------------ supported chains ---- */

/**
 * Mayan's token registry, whose top-level keys are the chains it supports. Used
 * to name chains that are supported but saw no volume in the window, which the
 * flow data alone cannot distinguish from chains that do not exist.
 */
function fetchSupportedChains() {
  return cachedValue(
    "mayan:supported",
    { ttlSeconds: 21_600, staleSeconds: 86_400 },
    async (): Promise<string[]> => {
      const raw = await fetchJson<Record<string, unknown>>(
        `${PRICE_API}/tokens`,
        { timeoutMs: 45_000 },
      );
      return Object.keys(raw).sort();
    },
  );
}

/* ----------------------------------------------------------- flow matrix ---- */

export interface MayanChainFlow {
  /** DefiLlama-style chain name, so it joins straight onto the registry. */
  chain: string;
  inflowUsd: number;
  outflowUsd: number;
  /** Inflow minus outflow. Positive means capital arriving. */
  netUsd: number;
  /** Share of all routed volume in the window, 0–1. */
  share: number;
}

/** One directed route, source chain to destination chain. */
export interface MayanCorridor {
  from: string;
  to: string;
  volumeUsd: number;
}

export interface MayanFlows {
  chains: Record<string, MayanChainFlow>;
  /** Busiest routes in the window, heaviest first. */
  corridors: MayanCorridor[];
  overview: MayanOverview;
  /** The window these flows cover. */
  window: MayanWindow;
  /** Total volume routed in the window, USD. */
  totalVolumeUsd: number;
  /** Supported chains, as DefiLlama names. */
  supportedChains: string[];
  /** Supported chains with no volume in the window. */
  idleChains: string[];
  /** Mayan slugs with volume that this app has no DefiLlama name for. */
  unmappedChains: string[];
}

interface FlowEntry {
  chain?: string;
  volume?: number;
}

type ChainsOverview = Record<
  string,
  { inFlow?: FlowEntry[]; outFlow?: FlowEntry[] } | undefined
>;

export function fetchMayanFlows() {
  return cachedValue(
    `mayan:flows:${WINDOW}`,
    { ttlSeconds: 900, staleSeconds: 3600 },
    async (): Promise<MayanFlows> => {
      const [raw, overview, supported] = await Promise.all([
        fetchJson<ChainsOverview>(
          `${EXPLORER}/stats/chains-overview?timeRange=${WINDOW}`,
          { timeoutMs: 30_000 },
        ),
        fetchMayanOverview(),
        fetchSupportedChains().catch((): string[] => []),
      ]);

      const unmapped = new Set<string>();

      /** Mayan slug to DefiLlama name, remembering what could not be translated. */
      const toLlama = (slug: string | undefined): string | undefined => {
        if (!slug) return undefined;
        const name = MAYAN_TO_LLAMA[slug];
        if (!name) unmapped.add(slug);
        return name;
      };

      const inflow = new Map<string, number>();
      const outflow = new Map<string, number>();
      const corridorVolume = new Map<string, number>();

      const add = (map: Map<string, number>, key: string, value: number) =>
        map.set(key, (map.get(key) ?? 0) + value);

      for (const [slug, sides] of Object.entries(raw)) {
        const chain = toLlama(slug);
        if (!chain || !sides) continue;

        for (const entry of sides.outFlow ?? []) {
          const counterparty = toLlama(entry.chain);
          const volume = numberOrNull(entry.volume);
          if (!counterparty || volume === null || volume <= 0) continue;

          add(outflow, chain, volume);
          // A self-loop is an internal rebalance rather than a route between
          // chains, and it appears on both sides of the matrix.
          if (counterparty !== chain) {
            add(corridorVolume, `${chain}${KEY_SEP}${counterparty}`, volume);
          }
        }

        for (const entry of sides.inFlow ?? []) {
          const counterparty = toLlama(entry.chain);
          const volume = numberOrNull(entry.volume);
          if (!counterparty || volume === null || volume <= 0) continue;
          add(inflow, chain, volume);
        }
      }

      // Every route is reported by both of its endpoints, so the network total
      // is one side of the matrix, not the sum of both.
      const totalVolumeUsd = [...inflow.values()].reduce(
        (sum, value) => sum + value,
        0,
      );

      // The endpoint answers with lifetime figures for any window it does not
      // recognise, silently. A month cannot be most of all time, so if it is,
      // the parameter was ignored and the stale value is the honest answer.
      if (
        overview.volumeAllTime !== null &&
        overview.volumeAllTime > 0 &&
        totalVolumeUsd > 0.5 * overview.volumeAllTime
      ) {
        throw new Error(
          `mayan: chains-overview ignored timeRange=${WINDOW} and returned lifetime volume`,
        );
      }

      const chains: Record<string, MayanChainFlow> = {};
      for (const chain of new Set([...inflow.keys(), ...outflow.keys()])) {
        const inflowUsd = inflow.get(chain) ?? 0;
        const outflowUsd = outflow.get(chain) ?? 0;
        chains[chain] = {
          chain,
          inflowUsd,
          outflowUsd,
          netUsd: inflowUsd - outflowUsd,
          share:
            totalVolumeUsd > 0
              ? (inflowUsd + outflowUsd) / (totalVolumeUsd * 2)
              : 0,
        };
      }

      const corridors: MayanCorridor[] = [...corridorVolume.entries()]
        .map(([key, volumeUsd]) => {
          const [from = "", to = ""] = key.split(KEY_SEP);
          return { from, to, volumeUsd };
        })
        .sort((a, b) => b.volumeUsd - a.volumeUsd);

      const supportedChains = [
        ...new Set(
          supported
            .map((slug) => MAYAN_TO_LLAMA[slug])
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort();

      return {
        chains,
        corridors,
        overview,
        window: WINDOW,
        totalVolumeUsd,
        supportedChains,
        idleChains: supportedChains.filter((name) => !(name in chains)),
        unmappedChains: [...unmapped].sort(),
      };
    },
  );
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
