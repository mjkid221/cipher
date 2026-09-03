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
 *   • The time-series metrics (daily active addresses, transactions) sit behind
 *     an API key. The public web app signs its own short-lived token in the
 *     browser; we do not forge that. Set `ARTEMIS_API_KEY` and the usage columns
 *     light up. Leave it unset and the model simply scores without them — see
 *     `coverage` on each chain snapshot.
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
  /** Metric names Artemis tracks for this chain. */
  trackedMetrics: string[];
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
  metrics_metadata_overwrite?: { metric_name?: string }[] | null;
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
      const raw = await fetchJson<{ assets?: RawAsset[] }>(`${DATA_SVC}/asset/`, {
        timeoutMs: 45_000,
      });

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
          trackedMetrics: (asset.metrics_metadata_overwrite ?? [])
            .map((entry) => entry?.metric_name)
            .filter((name): name is string => Boolean(name)),
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

/* -------------------------------------------------------- usage metrics ---- */

export interface ArtemisActivity {
  /** Mean daily active addresses over the trailing window. */
  dau: number | null;
  /** Mean daily active addresses over the 30 days before that. */
  dauPrev: number | null;
  /** Mean daily transactions over the trailing window. */
  txns: number | null;
  txnsPrev: number | null;
}

export type ArtemisActivityMap = Record<string, ArtemisActivity>;

const ACTIVITY_METRICS = ["CHAIN_DAU", "CHAIN_TXNS"] as const;

let keyWarningShown = false;

export function hasArtemisKey() {
  return Boolean(process.env.ARTEMIS_API_KEY);
}

/**
 * Daily active addresses and transaction counts, averaged over the trailing
 * 30 days and the prior 30 for a momentum read. Returns `null` when no API key
 * is configured so callers can degrade rather than guess.
 */
export function fetchArtemisActivity(artemisIds: readonly string[]) {
  const apiKey = process.env.ARTEMIS_API_KEY;
  const ids = [...new Set(artemisIds)].sort();

  if (!apiKey) {
    if (!keyWarningShown) {
      keyWarningShown = true;
      console.info(
        "[source:artemis] ARTEMIS_API_KEY not set — active-address and " +
          "transaction columns will be reported as unavailable.",
      );
    }
    return Promise.resolve(null);
  }

  if (ids.length === 0) return Promise.resolve<ArtemisActivityMap>({});

  return cachedValue(
    `artemis:activity:${ids.length}`,
    { ttlSeconds: 3600, staleSeconds: 21_600 },
    async (): Promise<ArtemisActivityMap | null> => {
      const end = new Date();
      const start = new Date(end.getTime() - 61 * 86_400_000);
      const params = new URLSearchParams({
        artemisIds: ids.join(","),
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        APIKey: apiKey,
      });

      try {
        const raw = await fetchJson<unknown>(
          `${DATA_SVC}/data/api/${ACTIVITY_METRICS.join(",")}/?${params}`,
          { timeoutMs: 45_000, retries: 1 },
        );
        return parseActivity(raw, ids);
      } catch (error) {
        console.warn(
          "[source:artemis] metrics request failed —",
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    },
  );
}

interface SeriesPoint {
  date: string;
  val: number;
}

/**
 * Artemis has shipped a few response envelopes over the years
 * (`data.symbols`, `data.artemis_ids`, or a bare map). Rather than pin one, walk
 * the object for `{ date, val }` series and index them by chain and metric.
 */
function parseActivity(
  raw: unknown,
  ids: readonly string[],
): ArtemisActivityMap {
  const found = new Map<string, SeriesPoint[]>();

  const isSeries = (value: unknown): value is SeriesPoint[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "date" in (value[0] as object) &&
    "val" in (value[0] as object);

  const walk = (node: unknown, trail: string[]) => {
    if (!node || typeof node !== "object") return;
    if (isSeries(node)) {
      found.set(trail.join("/").toLowerCase(), node);
      return;
    }
    if (Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      walk(value, [...trail, key]);
    }
  };
  walk(raw, []);

  const pick = (id: string, metric: string): SeriesPoint[] | null => {
    for (const [path, series] of found) {
      if (path.includes(id.toLowerCase()) && path.includes(metric.toLowerCase())) {
        return series;
      }
    }
    return null;
  };

  const out: ArtemisActivityMap = {};

  for (const id of ids) {
    const dau = pick(id, "dau");
    const txns = pick(id, "txns") ?? pick(id, "txn");
    out[id] = {
      dau: meanOfLast(dau, 0, 30),
      dauPrev: meanOfLast(dau, 30, 30),
      txns: meanOfLast(txns, 0, 30),
      txnsPrev: meanOfLast(txns, 30, 30),
    };
  }

  return out;
}

/** Mean of `count` points ending `offset` points back from the newest. */
function meanOfLast(
  series: SeriesPoint[] | null,
  offset: number,
  count: number,
): number | null {
  if (!series || series.length === 0) return null;

  const ordered = [...series]
    .filter((point) => typeof point.val === "number" && Number.isFinite(point.val))
    .sort((a, b) => a.date.localeCompare(b.date));

  const end = ordered.length - offset;
  const window = ordered.slice(Math.max(0, end - count), Math.max(0, end));
  if (window.length === 0) return null;

  return window.reduce((sum, point) => sum + point.val, 0) / window.length;
}
