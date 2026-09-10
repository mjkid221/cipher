import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import type { TokenUnlockSchedule } from "~/server/domain/types";

/**
 * DefiLlama emissions adapter — token allocation and unlock schedules.
 *
 * ## Why the static dataset and not the API
 *
 * DefiLlama's emissions API is paid. Measured 10 September 2026,
 * `api.llama.fi/emissions`, `/emission/{protocol}` and `/emissionsBreakdown`
 * all answer **HTTP 402 Payment Required**, so they are out under the
 * free-and-keyless rule. The static dataset CDN behind the same product is
 * open and needs no key, and carries strictly more: the API's breakdown file
 * has emission rates but no allocation at all.
 *
 * The cost is size. Each document is 0.2–5.9 MB (Celo is the largest, and its
 * schedule runs to 2050) and 69 MB across the 40 chains that have one, which is
 * why this is fetched one chain at a time from a lazy procedure and never from
 * the snapshot. Only the projection below is cached; the raw payload never
 * goes near Redis.
 *
 * ## Percentages are recomputed, not read
 *
 * The documents publish their own `tokenAllocation.current` and `.final`
 * percentages and **they are renormalised over only the tranches DefiLlama
 * managed to classify** — the untracked remainder and any tranche missing from
 * `categories` are divided away rather than shown. Measured the same day:
 *
 *   • Arbitrum reads `insiders: 39.4` where the team tranche is 26.9% of max
 *     supply, because 23% of max supply is not in the tranche series at all
 *     and the `Foundation` tranche is in no category
 *   • Hyperliquid reads `airdrop: 79.9` where the genesis distribution is
 *     31.0% of max supply, because 61% of the supply has no schedule yet
 *   • Ethereum reads `publicSale: 49.3` where the Crowd Sale is 46.9%
 *
 * So every figure here is recomputed from the raw per-tranche series against
 * `supplyMetrics.maxSupply`, and the remainder is carried as an explicit
 * `unscheduled` bucket. Two smaller traps come with that: `categories` keys
 * differ from the series labels **by case** (`DAOs in Arbitrum` against
 * `Daos in Arbitrum`) and carry a `" (TBD)"` suffix, so matching is
 * case-insensitive with the suffix stripped.
 *
 * ## Documents that are not schedules
 *
 * At least four shapes are served on this path. `emissions/avalanche-2` and
 * `emissions/frax` return `{data, metadata, name}` with no `documentedData` at
 * all; `emissions/injective-protocol` has a `documentedData` but no identity
 * fields, its `name` being the slug echoed back. Those are stubs and are
 * rejected.
 *
 * The fourth shape is a real schedule that simply omits `supplyMetrics`:
 * Starknet, Sui and Ronin each carry four to nine populated tranches and no max
 * supply. Dropping them would lose Sui, so the denominator falls back — to
 * CoinGecko's max supply, then to the schedule's own eventual total — and
 * `supply.basis` records which was used. All three were checked against supply
 * the app already holds and the tranches sum to CoinGecko's max exactly.
 *
 * Validation is therefore structural first — a usable document needs at least
 * one populated tranche series and a positive denominator — and only then
 * checked for identity.
 */

const EMISSIONS_CDN = "https://defillama-datasets.llama.fi";

/**
 * Chains whose dataset slug the candidate ladder below cannot reach.
 *
 * DefiLlama files a chain's emissions under whichever protocol issues the
 * token, which is often the bridge, the foundation or the flagship DEX rather
 * than the chain: OP Mainnet is `optimism-foundation`, Osmosis is
 * `osmosis-dex`, Polygon PoS is `polygon-bridge`. Measured 10 September 2026
 * by probing every candidate for all 85 chains — 30 resolve from the chain
 * slug, its name or its CoinGecko id, and these seven do not.
 */
const EMISSIONS_ALIASES: Record<string, string> = {
  "op-mainnet": "optimism-foundation",
  "polygon-pos": "polygon-bridge",
  blast: "blast-l2",
  mantle: "mantle-bridge",
  megaeth: "megaeth-bridge",
  osmosis: "osmosis-dex",
  thorchain: "thorchain-dex",
  worldchain: "worldcoin",
};

/**
 * Display labels and order for DefiLlama's allocation categories.
 *
 * Ordered by what a reader is looking for rather than by size: who holds the
 * supply first, then how it was distributed, then the parts nobody has
 * committed. `unscheduled` is this app's own bucket for the remainder — see the
 * docblock.
 */
const BUCKET_META: { key: string; label: string }[] = [
  { key: "insiders", label: "Team and insiders" },
  { key: "privateSale", label: "Private sale" },
  { key: "publicSale", label: "Public sale" },
  { key: "airdrop", label: "Airdrop" },
  { key: "farming", label: "Liquidity mining" },
  { key: "liquidity", label: "Liquidity provision" },
  { key: "staking", label: "Staking rewards" },
  { key: "ecosystem", label: "Ecosystem" },
  { key: "noncirculating", label: "Treasury" },
  { key: "other", label: "Other" },
  { key: "unscheduled", label: "No published schedule" },
];

const BUCKET_LABELS = new Map(BUCKET_META.map((b) => [b.key, b.label]));
const BUCKET_ORDER = new Map(BUCKET_META.map((b, i) => [b.key, i]));

/** The bucket this app adds for supply the schedule does not account for. */
const UNSCHEDULED = "unscheduled";

/* ------------------------------------------------------------ raw shapes ---- */

interface RawPoint {
  timestamp?: number;
  unlocked?: number;
}

interface RawSeries {
  label?: string;
  data?: RawPoint[];
}

interface RawAllocation {
  recipient?: string;
  category?: string;
  unlockType?: string;
  amount?: number;
}

interface RawUnlockEvent {
  timestamp?: number;
  cliffAllocations?: RawAllocation[];
  linearAllocations?: RawAllocation[];
}

interface RawDocument {
  name?: string;
  gecko_id?: string | null;
  chainName?: string | null;
  categories?: Record<string, string[]>;
  supplyMetrics?: {
    maxSupply?: number;
    adjustedSupply?: number;
    tbdAmount?: number;
  };
  documentedData?: { data?: RawSeries[] };
  metadata?: {
    notes?: string[];
    unlockEvents?: RawUnlockEvent[];
  };
}

/** What the adapter needs to know about the chain it is resolving. */
export interface UnlockScheduleTarget {
  slug: string;
  name: string;
  llamaName: string | null;
  geckoId: string | null;
  /** CoinGecko's circulating supply, carried through for the comparison. */
  circulatingSupply: number | null;
  /** CoinGecko's max supply, the fallback denominator. See `denominatorFor`. */
  maxSupply: number | null;
}

/* -------------------------------------------------------------- helpers ---- */

const DAY_MS = 86_400_000;

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** Compare names ignoring case, punctuation and spacing. */
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `categories` labels carry a " (TBD)" suffix the series labels do not. */
const trancheKey = (label: string) =>
  norm(label.replace(/\s*\(TBD\)\s*$/i, ""));

/* ----------------------------------------------------------- validation ---- */

/**
 * Is this a schedule at all?
 *
 * Structural first, because two of the shapes served on this path are stubs
 * that would pass a field-name check. Without a max supply there is no
 * denominator, and without tranches there is nothing to divide.
 */
function isSchedule(doc: unknown): doc is RawDocument {
  if (!doc || typeof doc !== "object") return false;
  const raw = doc as RawDocument;
  const series = raw.documentedData?.data;
  if (!Array.isArray(series) || series.length === 0) return false;
  return series.some(
    (entry) => Array.isArray(entry?.data) && entry.data.length > 0,
  );
}

/**
 * The denominator every percentage divides, and where it came from.
 *
 * The schedule's own max supply is preferred because it is internally
 * consistent with the tranches it publishes. Where the document omits it — a
 * real shape, see the docblock — CoinGecko's max supply stands in, and where
 * that is missing or smaller than the schedule already accounts for, the
 * schedule's own eventual total does. The last case makes `coveragePctOfMax`
 * 100% by construction, which is why the basis is carried through to the
 * interface rather than hidden.
 */
function denominatorFor(
  doc: RawDocument,
  target: UnlockScheduleTarget,
  trackedFinal: number,
): { maxSupply: number; basis: "schedule" | "market" | "tracked" } | null {
  const published = finite(doc.supplyMetrics?.maxSupply);
  if (published !== null && published > 0) {
    return { maxSupply: published, basis: "schedule" };
  }

  const market = finite(target.maxSupply);
  if (market !== null && market >= trackedFinal * 0.999) {
    return { maxSupply: market, basis: "market" };
  }

  if (trackedFinal > 0) return { maxSupply: trackedFinal, basis: "tracked" };
  return null;
}

/**
 * Is this schedule the chain we asked for?
 *
 * A positive match on any one of the three identity fields is enough, because
 * none is reliably present: `gecko_id` is null on the Arbitrum and Ethereum
 * documents, and `chainName` is the only field that connects
 * `optimism-foundation` to OP Mainnet. What this rejects is the stub case,
 * where `name` is the requested slug echoed back and the other two are absent.
 */
function matchesTarget(doc: RawDocument, target: UnlockScheduleTarget) {
  const gecko = doc.gecko_id?.toLowerCase();
  if (gecko && gecko === target.geckoId?.toLowerCase()) return true;

  const ours = new Set(
    [target.name, target.llamaName, target.slug]
      .filter((value): value is string => Boolean(value))
      .map(norm),
  );
  return [doc.name, doc.chainName].some(
    (value) => typeof value === "string" && ours.has(norm(value)),
  );
}

/* ----------------------------------------------------------- projection ---- */

/**
 * Read one tranche at a moment in time.
 *
 * The series is daily and cumulative but **not monotonic** — Ethereum's
 * staking tranche falls where EIP-1559 burns exceed issuance — so this takes
 * the last point at or before `at` rather than a running maximum, which would
 * quietly erase that.
 */
function valueAt(points: RawPoint[], at: number): number {
  let value = 0;
  for (const point of points) {
    const t = finite(point.timestamp);
    if (t === null || t * 1000 > at) break;
    value = finite(point.unlocked) ?? value;
  }
  return value;
}

/** Cumulative unlocked supply across every tranche, downsampled for the chart. */
function buildVesting(series: RawSeries[], limit: number) {
  const stamps = new Set<number>();
  for (const entry of series) {
    for (const point of entry.data ?? []) {
      const t = finite(point.timestamp);
      if (t !== null) stamps.add(t * 1000);
    }
  }

  const timeline = [...stamps].sort((a, b) => a - b);
  if (timeline.length === 0) return [];

  // Downsample by time, not by index, so a document mixing daily and sparse
  // points keeps an even spacing. At least weekly, and never over `limit`.
  const span = timeline[timeline.length - 1]! - timeline[0]!;
  const step = Math.max(7 * DAY_MS, span / (limit - 1));

  const out: { t: number; unlocked: number }[] = [];
  let cursor = -Infinity;
  for (const t of timeline) {
    if (t < cursor + step && t !== timeline[timeline.length - 1]) continue;
    cursor = t;
    let unlocked = 0;
    for (const entry of series) unlocked += valueAt(entry.data ?? [], t);
    out.push({ t, unlocked });
  }

  // The loop always keeps the final point, so a schedule whose last sample does
  // not land on a step boundary comes back one over budget. Drop from just
  // before the end rather than resampling: both endpoints matter, and the
  // interior is already evenly spaced.
  while (out.length > limit) out.splice(out.length - 2, 1);

  return out;
}

function project(
  doc: RawDocument,
  target: UnlockScheduleTarget,
  datasetSlug: string,
): TokenUnlockSchedule | null {
  const now = Date.now();
  const series = (doc.documentedData?.data ?? []).filter(
    (entry): entry is RawSeries & { label: string; data: RawPoint[] } =>
      typeof entry.label === "string" &&
      Array.isArray(entry.data) &&
      entry.data.length > 0,
  );

  // Tranche label → bucket, from `categories`, case-insensitively and with the
  // " (TBD)" suffix stripped. Without both of those, Arbitrum's airdrop loses
  // its "DAOs in Arbitrum" tranche to a capital letter.
  const bucketOf = new Map<string, string>();
  for (const [bucket, labels] of Object.entries(doc.categories ?? {})) {
    for (const label of Array.isArray(labels) ? labels : []) {
      if (typeof label === "string") bucketOf.set(trancheKey(label), bucket);
    }
  }

  // The unlock events name a category per recipient, which fills a few gaps
  // `categories` leaves. "Uncategorized" appears there literally and is not
  // one — a tranche DefiLlama could not place stays in `other` rather than
  // being guessed into a bucket that changes what the chart says.
  const events = doc.metadata?.unlockEvents ?? [];
  for (const event of events) {
    for (const alloc of [
      ...(event.cliffAllocations ?? []),
      ...(event.linearAllocations ?? []),
    ]) {
      const recipient = alloc.recipient;
      const category = alloc.category;
      if (!recipient || !category || category === "Uncategorized") continue;
      const key = trancheKey(recipient);
      if (!bucketOf.has(key)) bucketOf.set(key, category);
    }
  }

  const measured = series.map((entry) => {
    const tokensNow = valueAt(entry.data, now);
    const last = entry.data[entry.data.length - 1]!;
    const tokensFinal = finite(last.unlocked) ?? tokensNow;
    return {
      label: entry.label,
      bucket: bucketOf.get(trancheKey(entry.label)) ?? "other",
      tokensNow,
      tokensFinal,
      progressPct:
        tokensFinal > 0 ? Math.min(100, (tokensNow / tokensFinal) * 100) : null,
    };
  });

  const trackedNow = measured.reduce((sum, t) => sum + t.tokensNow, 0);
  const trackedFinal = measured.reduce((sum, t) => sum + t.tokensFinal, 0);

  const denominator = denominatorFor(doc, target, trackedFinal);
  if (!denominator) return null;
  const { maxSupply, basis } = denominator;

  const tranches = measured.map((tranche) => ({
    ...tranche,
    pctFinalOfMax: (tranche.tokensFinal / maxSupply) * 100,
  }));

  const unscheduledTokens = Math.max(0, maxSupply - trackedFinal);

  const totals = new Map<string, { now: number; final: number }>();
  for (const tranche of tranches) {
    const entry = totals.get(tranche.bucket) ?? { now: 0, final: 0 };
    entry.now += tranche.tokensNow;
    entry.final += tranche.tokensFinal;
    totals.set(tranche.bucket, entry);
  }
  // A floor, not a filter: rounding in the source leaves Monad with 10.8M
  // tokens unaccounted against a 101.6B max supply, and a 0.01% bucket is
  // noise a reader would have to dismiss rather than a gap worth naming.
  if (unscheduledTokens > maxSupply * 0.0005) {
    totals.set(UNSCHEDULED, { now: 0, final: unscheduledTokens });
  }

  const buckets = [...totals.entries()]
    .map(([key, value]) => ({
      key,
      label: BUCKET_LABELS.get(key) ?? key,
      pctNow: (value.now / maxSupply) * 100,
      pctFinal: (value.final / maxSupply) * 100,
      tokensNow: value.now,
      tokensFinal: value.final,
    }))
    .sort(
      (a, b) =>
        (BUCKET_ORDER.get(a.key) ?? 99) - (BUCKET_ORDER.get(b.key) ?? 99),
    );

  /*
   * Dated cliffs only.
   *
   * A `linearAllocations` entry carries a rate per week, not an amount, so it
   * cannot be summed into a token figure without inventing one. Continuous
   * vesting is already the slope of the curve; what a reader means by "the
   * next unlock" is the discrete release, and that is what this lists.
   */
  const nextUnlocks = events
    .map((event) => {
      const seconds = finite(event.timestamp);
      if (seconds === null) return null;
      const timestamp = seconds * 1000;
      if (timestamp <= now) return null;

      const recipients = (event.cliffAllocations ?? [])
        .map((alloc) => ({
          recipient: alloc.recipient ?? "Unnamed",
          bucket:
            alloc.category && alloc.category !== "Uncategorized"
              ? alloc.category
              : "other",
          tokens: finite(alloc.amount) ?? 0,
          kind: "cliff" as const,
        }))
        .filter((entry) => entry.tokens > 0)
        .sort((a, b) => b.tokens - a.tokens);

      const tokens = recipients.reduce((sum, entry) => sum + entry.tokens, 0);
      if (tokens <= 0) return null;

      return {
        at: new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        tokens,
        pctOfMax: (tokens / maxSupply) * 100,
        recipients,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const horizon = now + 90 * DAY_MS;
  const next90dTokens = nextUnlocks
    .filter((entry) => entry.timestamp <= horizon)
    .reduce((sum, entry) => sum + entry.tokens, 0);

  const vesting = buildVesting(series, 160);
  const scheduledEnd = vesting.find(
    (point) => point.unlocked >= trackedFinal * 0.9999,
  );

  return {
    source: "defillama",
    datasetSlug,
    asOf: new Date(now).toISOString(),
    supply: {
      maxSupply,
      basis,
      adjustedSupply:
        finite(doc.supplyMetrics?.adjustedSupply) ??
        maxSupply - unscheduledTokens,
      tbdAmount: finite(doc.supplyMetrics?.tbdAmount) ?? 0,
      trackedNow,
      trackedFinal,
      coveragePctOfMax: (trackedFinal / maxSupply) * 100,
      circulatingSupply: target.circulatingSupply,
    },
    stillToUnlockTokens: Math.max(0, maxSupply - trackedNow),
    stillToUnlockPctOfMax: Math.max(
      0,
      ((maxSupply - trackedNow) / maxSupply) * 100,
    ),
    scheduledToUnlockTokens: Math.max(0, trackedFinal - trackedNow),
    unscheduledTokens,
    next90dTokens,
    fullyVestedAt: scheduledEnd
      ? new Date(scheduledEnd.t).toISOString().slice(0, 10)
      : null,
    buckets,
    tranches: tranches.sort((a, b) => b.tokensFinal - a.tokensFinal),
    nextUnlocks: nextUnlocks.slice(0, 6),
    vesting,
    notes: (doc.metadata?.notes ?? []).filter(
      (note): note is string => typeof note === "string" && note.length > 0,
    ),
  };
}

/* ---------------------------------------------------------------- fetch ---- */

/**
 * One chain's unlock schedule, or null where DefiLlama publishes none.
 *
 * Null is the common case and not a failure: 40 of the 85 chains in the
 * universe have a document, which is 58% of those with a token. The caller
 * shows the absence rather than an error.
 *
 * The long stale window matters more than the TTL. These documents change on
 * governance timescales, and a cold miss is a multi-megabyte fetch, so once a
 * chain has been read its page stays instant for two days while refreshes run
 * behind the reader.
 */
export function fetchTokenUnlockSchedule(target: UnlockScheduleTarget) {
  return cachedValue(
    `llama:emissions:v3:${target.slug}`,
    { ttlSeconds: 21_600, staleSeconds: 172_800 },
    async (): Promise<TokenUnlockSchedule | null> => {
      const candidates: string[] = [];
      for (const candidate of [
        EMISSIONS_ALIASES[target.slug],
        target.slug,
        slugify(target.name),
        target.llamaName ? slugify(target.llamaName) : null,
        target.geckoId,
      ]) {
        if (candidate && !candidates.includes(candidate)) {
          candidates.push(candidate);
        }
      }

      for (const candidate of candidates) {
        try {
          const doc = await fetchJson<unknown>(
            `${EMISSIONS_CDN}/emissions/${candidate}`,
            { retries: 1, timeoutMs: 45_000, nullOn: [400, 403, 404] },
          );
          if (!isSchedule(doc)) continue;
          if (!matchesTarget(doc, target)) {
            console.warn(
              `[source:defillama-emissions] ${candidate} is a schedule but not ${target.slug} — skipped`,
            );
            continue;
          }

          const schedule = project(doc, target, candidate);
          if (!schedule) continue;

          // A supply disagreement is expected, not disqualifying: DefiLlama
          // counts an unlocked treasury allocation as unlocked and CoinGecko
          // does not, so the two differ by design. Worth a line in the log
          // when it is large, because it is also how a genuinely wrong
          // document would show up.
          const circulating = target.circulatingSupply;
          if (circulating && schedule.supply.maxSupply < circulating * 0.9) {
            console.warn(
              `[source:defillama-emissions] ${target.slug} max supply ${schedule.supply.maxSupply} is below circulating ${circulating}`,
            );
          }

          return schedule;
        } catch (error) {
          // Every source is optional: a dead or slow CDN costs this one panel.
          console.warn(
            `[source:defillama-emissions] ${candidate} failed —`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      return null;
    },
  );
}
