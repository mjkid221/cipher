import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { mapLimit } from "~/server/lib/http";

/**
 * Headlines, from public RSS.
 *
 * There is no free crypto news API worth the name: CoinGecko's is Pro-only and
 * CryptoPanic wants a key. Google News, however, publishes any search as RSS
 * without one — so instead of hoping a general feed mentions a chain, each chain
 * is searched for by name.
 */

/**
 * Google News search, as RSS. No key, and it takes an arbitrary query, which is
 * what makes per-chain coverage possible at all.
 */
const SEARCH = "https://news.google.com/rss/search";

/**
 * How far back to search.
 *
 * There is no per-chain cap. There used to be — eight, then twelve — and the
 * only real justification was payload size, because headlines rode inside the
 * main snapshot that every page load fetched. Once they moved to their own
 * request that reason went away, so everything Google returns inside the window
 * is kept. Google itself caps a search at 100 results, which is the real bound.
 */
export const NEWS_WINDOW_DAYS = 30;
/** Chains queried per refresh, largest first. One request each. */
const MAX_CHAINS = 85;

export interface Headline {
  id: string;
  title: string;
  url: string;
  source: string;
  /**
   * The outlet's domain, from the feed's `<source url>`. Google's RSS carries
   * no article image and its links are redirects, so the outlet's mark is the
   * one picture available per headline without scraping publishers; the client
   * derives it from this.
   */
  sourceDomain: string | null;
  publishedAt: string | null;
  /** Chains this headline is about. */
  chains: string[];
}

/** How much a chain was written about, against how much is shown. */
export interface NewsCoverage {
  chain: string;
  found: number;
  shown: number;
}

export interface NewsResult {
  headlines: Headline[];
  coverage: NewsCoverage[];
}

/* ----------------------------------------------------------- rss parsing ---- */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#8217": "’",
  "#8216": "‘",
  "#8220": "“",
  "#8221": "”",
  "#8211": "–",
  "#8212": "—",
  "#39": "'",
  "#34": '"',
};

/** Tiny stable string hash, used only for list keys. */
function hash(input: string): string {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0).toString(36);
}

function decode(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, code: string) => {
      if (ENTITIES[code]) return ENTITIES[code];
      if (code.startsWith("#x")) {
        return String.fromCodePoint(parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(parseInt(code.slice(1), 10));
      }
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** An attribute of the first `<tag …>` in the block, decoded. */
function attr(block: string, tag: string, name: string): string {
  const match = new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`, "i").exec(block);
  return match?.[1] ? decode(match[1]) : "";
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function field(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(
    block,
  );
  return match?.[1] ? decode(match[1]) : "";
}

/* ------------------------------------------------------------- querying ---- */

/**
 * Chain names that are ordinary English words.
 *
 * Searching "Base" or "Stable" returns everything and nothing. These get a
 * hand-written query instead of the generic one.
 */
const QUERY_OVERRIDES: Record<string, string> = {
  Base: '"Base" Coinbase L2 crypto',
  Stable: '"Stable" chain stablecoin blockchain',
  Near: '"NEAR Protocol" crypto',
  Story: '"Story Protocol" crypto',
  Ink: '"Ink" Kraken L2 crypto',
  Flow: '"Flow blockchain" crypto',
  Sonic: '"Sonic" blockchain crypto S token',
  Corn: '"Corn" blockchain crypto',
  Movement: '"Movement Labs" crypto',
  Mode: '"Mode Network" crypto',
  Core: '"Core" blockchain CORE crypto',
  Plasma: '"Plasma" XPL blockchain',
  Aurora: '"Aurora" NEAR EVM crypto',
  Metis: '"Metis" blockchain crypto',
};

/**
 * Google News ranks by relevance, not date, and will happily return a
 * well-linked article from six months ago. `when:` bounds it to recent results,
 * which is the whole point of a headline list.
 */
const RECENCY = `when:${NEWS_WINDOW_DAYS}d`;

function queryFor(name: string): string {
  return `${QUERY_OVERRIDES[name] ?? `"${name}" blockchain crypto`} ${RECENCY}`;
}

/**
 * Google News appends " - Outlet" to every title. The outlet is also a separate
 * element, so the suffix is redundant and is trimmed off.
 */
function stripOutlet(title: string, source: string): string {
  if (!source) return title;
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

/* ------------------------------------------------------------------ fetch --- */

/**
 * One search per chain.
 *
 * The previous version merged four general crypto feeds and matched chain names
 * against whatever came back. It gave twenty tagged headlines out of sixty, all
 * but a handful about Bitcoin — because that is what general feeds cover. Asking
 * per chain inverts the problem: every chain gets its own results, and a chain
 * with genuinely no coverage returns nothing instead of being crowded out.
 */
export function fetchHeadlines(
  universe: readonly { name: string; symbol: string | null }[],
) {
  const names = universe.slice(0, MAX_CHAINS).map((chain) => chain.name);

  return cachedValue(
    `news:headlines:${names.length}`,
    { ttlSeconds: 1800, staleSeconds: 21_600 },
    async (): Promise<NewsResult> => {
      const perChain = await mapLimit(names, 6, async (chain) => {
        try {
          const url = `${SEARCH}?q=${encodeURIComponent(queryFor(chain))}&hl=en-US&gl=US&ceid=US:en`;
          const response = await fetch(url, {
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
            headers: {
              accept: "application/rss+xml, application/xml, text/xml",
              "user-agent":
                "Mozilla/5.0 (compatible; cipher/1.0; +valuation research dashboard)",
            },
          });
          if (!response.ok) return { chain, found: 0, items: [] };

          const all = parseFeed(await response.text());

          // Sort before truncating. Google orders by relevance, so slicing its
          // order kept a three-week-old explainer and dropped this morning's
          // news — a list that looked chronological but was a relevance sample.
          const newest = [...all].sort((a, b) =>
            (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
          );

          return {
            chain,
            found: all.length,
            items: newest.map((item) => ({ ...item, chains: [chain] })),
          };
        } catch {
          // One chain's search failing costs that chain's headlines, nothing more.
          return { chain, found: 0, items: [] };
        }
      });

      // The same story often surfaces for several chains; keep one copy and let
      // it carry every chain it was found under.
      const byTitle = new Map<string, Headline>();

      for (const item of perChain.flatMap((entry) => entry.items)) {
        const key = item.title.toLowerCase();
        const existing = byTitle.get(key);
        if (existing) {
          for (const chain of item.chains) {
            if (!existing.chains.includes(chain)) existing.chains.push(chain);
          }
        } else {
          byTitle.set(key, item);
        }
      }

      return {
        headlines: [...byTitle.values()].sort((a, b) =>
          (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
        ),
        coverage: perChain
          .map((entry) => ({
            chain: entry.chain,
            found: entry.found,
            shown: entry.items.length,
          }))
          .filter((entry) => entry.found > 0)
          .sort((a, b) => b.found - a.found),
      };
    },
  );
}

function parseFeed(xml: string): Omit<Headline, "chains">[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  return blocks
    .map((block) => {
      const source = field(block, "source");
      const sourceUrl = attr(block, "source", "url");
      const title = stripOutlet(field(block, "title"), source);
      const link = field(block, "link") || field(block, "guid");
      const date = field(block, "pubDate") || field(block, "published");

      let publishedAt: string | null = null;
      if (date) {
        const parsed = new Date(date);
        if (!Number.isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
      }

      return {
        // A short hash rather than source-plus-title: the id is only a React
        // key, and repeating the title in it added ~80 bytes to every one of
        // twelve hundred headlines.
        id: hash(`${source}:${title}`),
        title,
        url: link,
        source: source || "News",
        sourceDomain: sourceUrl ? domainOf(sourceUrl) : null,
        publishedAt,
      };
    })
    .filter((item) => item.title && item.url.startsWith("http"));
}
