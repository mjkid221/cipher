import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";

/**
 * L2Beat adapter — which chains are actually rollups.
 *
 * CoinGecko's layer-2 category cannot see a chain with no token, so Base, Ink
 * and World Chain came back unclassified. L2Beat is the specialist registry and
 * classifies by construction rather than by token, which is the right basis.
 *
 * Only its specific scaling categories count. Its "Other" bucket holds 78
 * projects and is a genuine catch-all — Hyperliquid, Polygon PoS, Gnosis and
 * Celo all sit there — so treating it as L2 would tell most readers something
 * they would rightly dispute. Those fall through to CoinGecko instead.
 */

const API = "https://l2beat.com/api";

/** Categories that describe a real scaling construction. */
const ROLLUP_CATEGORIES = new Set([
  "Optimistic Rollup",
  "ZK Rollup",
  "Optimium",
  "Validium",
]);

interface RawProject {
  name?: string;
  slug?: string;
  category?: string;
  isArchived?: boolean;
  isUnderReview?: boolean;
}

/**
 * Names normalise loosely because the two registries disagree on suffixes:
 * L2Beat says "Base Chain" and "Arbitrum One" where this app says "Base" and
 * "Arbitrum".
 */
export function normaliseChainName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(chain|one|mainnet|network|protocol|l2|era)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Normalised names of every chain L2Beat classifies as a rollup. */
export function fetchRollupNames() {
  return cachedValue(
    "l2beat:rollups",
    { ttlSeconds: 86_400, staleSeconds: 172_800 },
    async (): Promise<string[]> => {
      const raw = await fetchJson<{ projects?: Record<string, RawProject> }>(
        `${API}/scaling/summary`,
        {
          timeoutMs: 30_000,
          // L2Beat serves this from its own web app and rejects a bare client.
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; cipher/1.0; +valuation research dashboard)",
          },
        },
      );

      const names = new Set<string>();

      for (const project of Object.values(raw.projects ?? {})) {
        if (!project?.name || project.isArchived) continue;
        if (!ROLLUP_CATEGORIES.has(project.category ?? "")) continue;
        names.add(normaliseChainName(project.name));
      }

      return [...names];
    },
  );
}
