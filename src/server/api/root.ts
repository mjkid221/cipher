import { chainsRouter } from "~/server/api/routers/chains";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * Primary router. Every procedure reads from the cached chain snapshot built in
 * `~/server/domain/aggregate`.
 */
export const appRouter = createTRPCRouter({
  chains: chainsRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Server-side caller, used by React Server Components.
 * @example const { chains } = await api.chains.list();
 */
export const createCaller = createCallerFactory(appRouter);
