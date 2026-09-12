import {
  computeMultiples,
  scoreUniverse,
  type LinearFit,
  type ScoreInput,
} from "~/server/domain/score";
import { buildThesis } from "~/server/domain/thesis";
import type {
  ChainMetrics,
  ChainMultiples,
  ChainSnapshot,
} from "~/server/domain/types";

import { dilutedCapOf, type DilutedSupply } from "./valuation-basis";

/**
 * Re-scoring the universe on fully diluted valuation, in the browser.
 *
 * `scoreUniverse` and `buildThesis` are pure functions of the snapshot, and the
 * home screen already holds every chain's metrics. So the second basis is a
 * recompute over data in hand: no second snapshot, no cache key, no payload
 * growth, and no cron. It also means the two modes cannot drift, because they
 * are the same function called twice rather than two implementations of it.
 *
 * Importing from `server/domain` is deliberate. Those two modules import
 * nothing but types — no cache, no adapters, no `server-only` — and `filters.ts`
 * already shares the domain types across that boundary. Copying the maths into
 * `lib/` to respect the folder name would create exactly the drift this avoids.
 */

/** How many chains each denominator covered, for the label above the table. */
export interface SupplyMix {
  max: number;
  total: number;
  /** Tokened chains with neither, which go unrated on this basis. */
  missing: number;
}

export interface RebasedUniverse {
  chains: ChainSnapshot[];
  regression: LinearFit | null;
  medians: Record<keyof ChainMultiples, number | null>;
  supplyMix: SupplyMix;
  /** Which supply each chain's valuation used, by slug. */
  supplyOf: Map<string, DilutedSupply>;
}

/**
 * Score the universe again with fully diluted valuations in place of market cap.
 *
 * This reproduces what `aggregate.ts` does after scoring — the two rank maps the
 * thesis copy needs, and the promotion of `unrated` to `no-token` for a chain
 * that never had a token, which the scorer cannot tell apart from one whose
 * market data simply failed.
 */
export function rebaseUniverse(
  chains: readonly ChainSnapshot[],
): RebasedUniverse {
  const supplyOf = new Map<string, DilutedSupply>();
  const supplyMix: SupplyMix = { max: 0, total: 0, missing: 0 };

  const rows: { chain: ChainSnapshot; metrics: ChainMetrics }[] = chains.map(
    (chain) => {
      const diluted = dilutedCapOf(chain.metrics);

      if (diluted.supply) {
        supplyOf.set(chain.slug, diluted.supply);
        supplyMix[diluted.supply] += 1;
      } else if (chain.investable) {
        // Had a circulating cap but no way to price the rest of the supply.
        supplyMix.missing += 1;
      }

      return {
        chain,
        metrics: {
          ...chain.metrics,
          marketCap: diluted.value,
          // The overhang is FDV over circulating cap. Once the cap in hand is
          // already the diluted one there is no overhang left to carry, and
          // leaving it would put "most of the float is still to come" under a
          // ranking that has just counted that float.
          dilutionOverhang: null,
        },
      };
    },
  );

  const scoreInputs: ScoreInput[] = rows.map(({ chain, metrics }) => ({
    slug: chain.slug,
    metrics,
    multiples: computeMultiples(metrics),
  }));

  const { results, regression, medians } = scoreUniverse(scoreInputs);

  const rank = (
    pick: (entry: (typeof rows)[number]) => number | null,
  ): Map<string, number> => {
    const order = [...rows]
      .map((entry) => ({ slug: entry.chain.slug, value: pick(entry) ?? -1 }))
      .sort((a, b) => b.value - a.value);
    return new Map(order.map((entry, index) => [entry.slug, index + 1]));
  };

  const fundamentalRank = rank(
    ({ chain }) => results.get(chain.slug)?.scores.fundamental ?? null,
  );
  const mcapRank = rank(({ metrics }) => metrics.marketCap);

  const rebased = rows.map(({ chain, metrics }, index) => {
    const score = results.get(chain.slug)!;
    const multiples = scoreInputs[index]!.multiples;

    return {
      ...chain,
      metrics,
      multiples,
      scores: score.scores,
      percentiles: score.percentiles,
      tier:
        score.tier === "unrated" && !chain.keys.geckoId
          ? ("no-token" as const)
          : score.tier,
      valueTrapRisk: score.valueTrapRisk,
      impliedMarketCap: score.impliedMarketCap,
      impliedMarketCapLow: score.impliedMarketCapLow,
      impliedMarketCapHigh: score.impliedMarketCapHigh,
      trendResidual: score.trendResidual,
      impliedUpside: score.impliedUpside,
      investable: score.investable,
      thesis: buildThesis({
        name: chain.name,
        metrics,
        multiples,
        score,
        medians,
        fundamentalRank: fundamentalRank.get(chain.slug) ?? null,
        mcapRank: mcapRank.get(chain.slug) ?? null,
        universeSize: rows.length,
        capNoun: "fully diluted value",
      }),
    };
  });

  // The list arrives sorted by value gap, and the hero reads the first entry
  // that clears its bar, so the new ranking has to be put back in that order.
  // Nulls last, matching the router's sort.
  rebased.sort((a, b) => {
    const left = a.scores.mispricing;
    const right = b.scores.mispricing;
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  });

  return { chains: rebased, regression, medians, supplyMix, supplyOf };
}
