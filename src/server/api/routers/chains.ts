import { z } from "zod";

import { getNews, getSnapshot } from "~/server/domain/aggregate";
import {
  CHEAPNESS_WEIGHTS,
  COMPOSITE_WEIGHTS,
  FUNDAMENTAL_WEIGHTS,
  median,
  MIN_MULTIPLES_FOR_CHEAPNESS,
  MOMENTUM_WEIGHTS,
  SCALE_WEIGHTS,
  SIZE_FLOOR,
} from "~/server/domain/score";
import type { ChainMultiples } from "~/server/domain/types";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const SORT_KEYS = [
  "mispricing",
  "fundamental",
  "momentum",
  "cheapness",
  "marketCap",
  "tvl",
  "fees30d",
  "impliedUpside",
] as const;

const listInput = z
  .object({
    /** Hide chains whose data is too thin to act on. */
    minConfidence: z.number().min(0).max(1).default(0),
    /** Drop chains with no liquid native asset. */
    onlyInvestable: z.boolean().default(false),
    sort: z.enum(SORT_KEYS).default("mispricing"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .default({
    minConfidence: 0,
    onlyInvestable: false,
    sort: "mispricing",
    direction: "desc",
  });

export const chainsRouter = createTRPCRouter({
  /** The full ranked universe plus run metadata. */
  list: publicProcedure.input(listInput).query(async ({ input }) => {
    const { chains, meta } = await getSnapshot();

    const filtered = chains.filter((chain) => {
      if (input.onlyInvestable && !chain.investable) return false;
      return chain.scores.confidence >= input.minConfidence;
    });

    const read = (chain: (typeof chains)[number]): number | null => {
      switch (input.sort) {
        case "mispricing":
          return chain.scores.mispricing;
        case "fundamental":
          return chain.scores.fundamental;
        case "momentum":
          return chain.scores.momentum;
        case "cheapness":
          return chain.scores.cheapness;
        case "impliedUpside":
          return chain.impliedUpside;
        case "marketCap":
          return chain.metrics.marketCap;
        case "tvl":
          return chain.metrics.tvl;
        case "fees30d":
          return chain.metrics.fees30d;
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      // Chains missing the sort key always sink, whichever way we are sorting.
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return input.direction === "desc" ? right - left : left - right;
    });

    return { chains: sorted, meta };
  }),

  /** One chain, with the peer set needed to draw it in context. */
  detail: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ input }) => {
      const { chains, meta } = await getSnapshot();
      const chain = chains.find((entry) => entry.slug === input.slug) ?? null;

      const multipleKeys: (keyof ChainMultiples)[] = [
        "mcapToTvl",
        "mcapToFees",
        "mcapToRevenue",
        "mcapToStablecoins",
        "mcapToDexVolume",
        "mcapToRwa",
      ];

      return {
        chain,
        meta,
        /** Peer medians for every valuation ratio, for "cheap versus what". */
        medians: Object.fromEntries(
          multipleKeys.map((key) => [
            key,
            median(chains.map((entry) => entry.multiples[key])),
          ]),
        ) as Record<keyof ChainMultiples, number | null>,
        /** Trimmed peers, enough to redraw the scatter in context. */
        peers: chains.map((entry) => ({
          slug: entry.slug,
          name: entry.name,
          logoUrl: entry.logoUrl,
          marketCap: entry.metrics.marketCap,
          fundamentalIndex: entry.scores.fundamentalIndex,
          mispricing: entry.scores.mispricing,
          confidence: entry.scores.confidence,
          trendResidual: entry.trendResidual,
          impliedMarketCap: entry.impliedMarketCap,
        })),
      };
    }),

  /**
   * Headlines, on their own request.
   *
   * Not part of the snapshot: they were 81% of its payload, carried by every
   * page view for a window most visitors never open. Optionally narrowed to one
   * chain for its detail page.
   */
  news: publicProcedure
    .input(z.object({ chain: z.string().min(1).optional() }).optional())
    .query(async ({ input }) => {
      const feed = await getNews();
      if (!input?.chain) return feed;

      const chain = input.chain;
      return {
        ...feed,
        headlines: feed.headlines.filter((item) => item.chains.includes(chain)),
        coverage: feed.coverage.filter((entry) => entry.chain === chain),
      };
    }),

  /** Run metadata on its own, for the header freshness indicator. */
  meta: publicProcedure.query(async () => (await getSnapshot()).meta),

  /** The model's weights, so the methodology panel cannot drift from the code. */
  methodology: publicProcedure.query(() => ({
    fundamental: FUNDAMENTAL_WEIGHTS,
    momentum: MOMENTUM_WEIGHTS,
    cheapness: CHEAPNESS_WEIGHTS,
    composite: COMPOSITE_WEIGHTS,
    /**
     * The regression axis. Published because it drives the peer trend line, the
     * implied market cap and every distance-from-trend figure on screen — and a
     * panel that claims it cannot drift from the model should not omit it.
     */
    scale: SCALE_WEIGHTS,
    minMultiplesForCheapness: MIN_MULTIPLES_FOR_CHEAPNESS,
    sizeFloor: SIZE_FLOOR,
  })),
});
