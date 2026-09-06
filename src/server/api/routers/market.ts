import {
  getMarketBrief,
  getMarketCycle,
  getMarketDetail,
} from "~/server/domain/market";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

/**
 * Market context. Separate from `chains` because nothing here reads the chain
 * snapshot and nothing here may influence it.
 *
 *   brief   tiny; prefetched on the server for the rail
 *   cycle   the five overlay series; fetched by the client after first paint
 *   detail  the rainbow and full histories; fetched when the window opens
 *
 * All three derive from the same cached upstream fetches.
 */
export const marketRouter = createTRPCRouter({
  brief: publicProcedure.query(() => getMarketBrief()),
  cycle: publicProcedure.query(() => getMarketCycle()),
  detail: publicProcedure.query(() => getMarketDetail()),
});
