# Caliper — maintainer guide for coding agents

Caliper is a valuation screen for blockchains: it measures the gap between what
a chain earns and what it costs, ranks 85 chains by it, and surrounds the
ranking with market context. Next.js 15 (App Router), tRPC 11, TanStack Query 5,
Tailwind v4, zustand, TypeScript strict. This file is the operating manual; the
README explains the product and the model to humans.

## Commands

| Task | Command |
|---|---|
| Dev server (always port 3001; 3000 is taken on this machine) | `pnpm dev` |
| Type check / lint / production build | `pnpm typecheck`, `pnpm lint`, `pnpm build` |
| Format | `npx prettier --write <files>` |

Gotchas: `pnpm build` writes to `.next` while `next dev` serves from it, so
never build while a browser check is running, and restart the dev server after
a build. Editing any server module re-instantiates it and empties the
in-process cache tier, so the first request after an edit is a cold fetch
(Redis, if configured, usually answers within seconds). Prettier re-wraps
lines: when patching files programmatically, anchor on whitespace-tolerant
patterns, and re-read a file after formatting before patching it again.

## Layout

```
src/app/                 routes; page.tsx prefetches chains + market.brief; api/health warms caches
src/server/domain/       score.ts (the model), aggregate.ts (snapshot build, universe, flow union),
                         market*.ts (display-only market indicators), types.ts
src/server/sources/      one adapter per upstream: defillama, artemis, mayan, coingecko, coinmetrics,
                         alternative-me, mempool, l2beat, news (Google News RSS), bridges/{wormhole,debridge}
src/server/cache/        cachedValue(key, {ttlSeconds, staleSeconds}, loader): L1 map + Upstash Redis,
                         stale-while-revalidate, refreshes kept alive with waitUntil
src/server/api/routers/  chains (list, detail, meta, news, methodology), market (brief, cycle, detail)
src/components/          screen.tsx (home), chain-detail.tsx, table/, chart/, market/, window/, ui/
src/lib/                 palette (tiers, rainbow, zone strokes), glossary, format, cycle-models, market-zones
src/stores/              zustand filters store (persisted; version-bump + migrate on shape changes)
```

## Rules that must hold

1. **The market layer is display-only.** `score.ts` and `aggregate.ts` import
   nothing from `market*`. Fear & Greed, altcoin season, rainbow, cycles and
   flows are shown, never scored. Check with
   `grep -n "market-" src/server/domain/score.ts src/server/domain/aggregate.ts`.
2. **Every source is free and keyless.** No paid tiers, no API keys beyond the
   optional Upstash Redis. DefiLlama's bridges API, CoinGecko history beyond
   365 days and total-market-cap history are paid; do not reintroduce them.
3. **Every source is optional.** A failed or slow upstream yields `null` and a
   `degraded`/`unavailable` status, never a thrown page. Sources carry
   deadlines (`deadline()` in `server/lib/http.ts`) so an SSR prefetch never
   waits on a cold 4.6 MB fetch; the underlying fetch keeps running into the
   cache.
4. **Labels are honest.** Say what a number is and is not: 90-day window, price
   × today's supply, top-100 not total market, "peer-implied, not a price",
   which bridges a total covers. When a source overlaps another, remove the
   overlap explicitly (Mayan's Wormhole-tagged share, Artemis' own Wormhole and
   deBridge attribution) rather than summing or excluding wholesale.
5. **No brand words in product copy.** Terminology is generic finance: value
   gap, undervalued / overvalued, fairly valued, fair value. "Par" survives only
   in internal identifiers (`par.*` localStorage keys, cache prefix `par:v1`,
   `ParScale`), which are kept so saved state survives; do not migrate them
   without being asked.
6. **Dataviz discipline.** One y-axis per chart (aligned strips with a shared
   crosshair, or colour, never dual axes). Diverging blue = cheap/undervalued,
   red = expensive/overvalued, reserved for that meaning. Categorical trio for
   identity only. Status colours only with a glyph or label. Every colour
   encoding has a named legend. The rainbow chart is the one deliberate
   multi-hue ramp, and every band is named twice.
7. **Windows are outside `HydrateClient`.** A `useQuery` there for a key the
   page prefetched makes TanStack defer hydration and causes an SSR mismatch.
   Windows read prefetched data through their own queries only when those keys
   are never prefetched (market.cycle, market.detail) or via the detail payload.
8. **Config changes that change data shape bump a cache key** (the snapshot key
   carries the universe cap) and, for the persisted store, the version with a
   `migrate`.

## Data facts worth not rediscovering

- DefiLlama coins `/chart` caps at 500 points per request: daily for ~15 months,
  weekly (`period=1w`) since late 2017, spliced onto one daily grid.
- CoinMetrics community API returns full BTC history since 2010 in one request
  (nanosecond timestamps; parse the date part). Projected to ~150 KB before
  caching.
- alternative.me `limit=0` returns all of Fear & Greed since 2018-02-01; the
  feed skips days, so align by date and forward-fill.
- Mayan `chains-overview?timeRange=30d` is honoured; any other parameter name
  silently returns lifetime volume. The adapter throws if a month exceeds half
  of all-time.
- Artemis flows: 43 chains; named bridges are Across, deBridge, USDT0,
  Wormhole; the rest is canonical/unnamed pair flow. It does not carry Mayan.
- Universe: DefiLlama chains with ≥ $3M TVL or Artemis-tracked, top 85 by TVL.
  Ranks 56–85 are as well covered as the top 55; coverage breaks below ~$8M TVL.
- Vercel Hobby: crons once per day at most (more frequent schedules fail the
  deploy), functions up to 300 s, `waitUntil` work counts toward it.

## Verification

Every change is verified in a real browser before it is reported: run the
dev server on 3001, drive it with Playwright (MCP `browser_run_code_unsafe`),
measure rather than eyeball (bounding boxes for overlaps and alignment, DOM
counts, console errors must be zero), take a capture and look at it. Probe API
payloads with curl against `/api/trpc/<router>.<proc>`. Then `pnpm build`,
restart the dev server, and warm `/api/trpc/chains.meta` and
`/api/trpc/market.brief`.

## Conventions

- Conventional commits (`feat(scope):`, `fix:`, `perf(cache):`, `docs:`), body
  explaining why, co-author trailer when an agent authored it.
- Docblocks explain decisions and the evidence for them, including what was
  tried and removed. Keep them current when the decision changes.
- Names rejected for this app: Assay, ChainFather, Par, Fathom. It is Caliper.
