# Chainbase

A valuation screen for blockchains. It answers one question:

> **Which chain is cheap relative to how well it is actually performing?**

Every major chain is scored twice — once on the size and growth of its real
economy, once on what the market pays for it — and ranked by the distance
between the two.

---

## The model

Crypto metrics span six orders of magnitude, so nothing is compared on raw
values. Every input becomes a **percentile against the peer universe**, which is
robust to outliers and directly interpretable: `82` means "ahead of 82% of
chains".

Three scores are built independently, then combined.

**Fundamentals** — how large the chain's real economy is.

| Input | Weight |
|---|---|
| Chain fees, 30d | 22% |
| Total value locked | 18% |
| Stablecoin float | 15% |
| Chain revenue, 30d | 13% |
| DEX volume, 30d | 12% |
| Daily active addresses | 12% |
| Protocols deployed | 8% |

**Momentum** — whether that economy is growing or decaying. 30-day fee growth
(32%), TVL growth (26%), DEX volume growth (22%), active address growth (10%),
net cross-chain inflow (10%).

**Cheapness** — the valuation ratios, inverted so high means cheap. Market cap
over annualised fees (30%), over TVL (25%), over annualised revenue (20%), over
stablecoin float (15%), over annualised DEX volume (10%). A chain needs at least
two of these present or it is left **unrated** — one odd denominator is enough to
put a chain wrongly at the top of a "cheapest" list.

### The headline number

`valueGap` runs from −100 to +100. Positive means the market prices the chain
below what its activity supports.

```
valueGap = 0.43 × (fundamental percentile − market-cap percentile)
         + 0.32 × (cheapness, recentred to ±100)
         + 0.25 × (momentum,  recentred to ±100)
```

Momentum earns a quarter of the weight deliberately. A cheap multiple on a
shrinking fee stream is a value trap, not an opportunity — those chains are
flagged separately and can be filtered out.

### Confidence

`confidence` (0–1) blends how many model inputs the chain actually supplied with
a size gate, because a $2M-TVL chain can post a spectacular multiple purely
because its denominator is noise. The screen defaults to hiding anything below
35%.

### The peer trend line

Market cap is regressed on a log-scale index of economic size across the chains
with complete data. The scatter plot draws that fit with a ±1σ band, and each
chain reports its distance from the line in standard deviations.

The fit typically explains around **half** of what chains are worth, leaving a
residual spread of several times. That wide band is the honest finding, not a
defect — and it is why the distance from the line is reported as a σ figure
rather than dressed up as a price target.

---

## Where the data comes from

### DefiLlama — capital and revenue
Free, unauthenticated. TVL and 90-day TVL history, stablecoin float, DEX volume,
protocol counts, market caps and 7/30-day price history.

Two things worth knowing about how this adapter reads DefiLlama:

- **Fees are chain-level, not ecosystem-level.** `/overview/fees/{chain}` sums
  every protocol deployed on a chain — for Ethereum that is ~$288M over 30 days
  against the ~$10M the L1 itself earns. The ecosystem figure is a fine adoption
  signal but the wrong denominator for a token multiple, because Uniswap's fees
  do not accrue to ETH. The adapter reads the dimensions overview once and keeps
  the entries DefiLlama categorises as `Chain`, which fixes the semantics and
  replaces a 110-request loop with two requests.
- **A market cap of zero is discarded.** DefiLlama returns `mcap: 0` as a
  placeholder when it has no supply data. Left as a real value it makes every
  ratio zero and sends the chain straight to the top of the ranking.

### Artemis — the chain universe and its identity
The asset directory behind [artemis.ai/sectors/chains](https://www.artemis.ai/sectors/chains)
is open, and supplies 100+ chains with CoinGecko ids, brand colours, logos,
descriptions, founders and links. That CoinGecko id is what joins Artemis to
DefiLlama cleanly — it resolves every major chain without a hand-written alias
table, and the matching is strict (exact id, exact name, or an explicit alias)
because fuzzy matching produced false pairs like Lighter/LightLink.

The **time-series metrics** — daily active addresses and transactions — sit
behind an API key. The public web app signs a short-lived token in the browser;
this project does not forge it. Set `ARTEMIS_API_KEY` and those columns light up.
Without it the model scores on the remaining inputs and reports the gap honestly
rather than guessing.

### Mayan — cross-chain routing demand
[explorer.mayan.finance](https://explorer.mayan.finance/) shows where value is
moving between chains right now, which makes it the one forward-looking input:
bridge inflow tends to lead TVL, which tends to lead price.

One accuracy note. The per-swap `fromTokenPrice` field in the public feed is
unreliable — sampling it shows the destination asset's price attached to the
source leg (SOL quoted at $1, USDC at $2,391), inflating a naive `amount × price`
sum by more than an order of magnitude against Mayan's own reported 24h total.
So per-swap USD is never trusted. Instead, **transfer counts** per chain — which
are reliable — give each chain's share of routing activity, and the
protocol-level 24h volume is allocated across chains by that share. The result is
an estimate and is labelled as one everywhere it appears.

Wormhole chain ids were verified against the live feed by reading the gas-token
symbol of native transfers per id, which is why `47` is HyperEVM and `48` is
Monad rather than the other way round.

---

## Setup

```bash
pnpm install
cp .env.example .env      # both keys are optional
pnpm dev
```

### Environment

| Variable | Required | Effect |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | no | Shares the cache across instances and deploys |
| `UPSTASH_REDIS_REST_TOKEN` | no | — |
| `ARTEMIS_API_KEY` | no | Adds daily active addresses and transactions |

Create a Redis database at [console.upstash.com](https://console.upstash.com/redis)
and paste the REST credentials. Nothing breaks without them: the app falls back
to its in-process cache, and a Redis that is misconfigured or down logs a warning
per key and serves from origin.

---

## Caching

A cold snapshot touches roughly 140 third-party endpoints, so caching is part of
the design rather than an optimisation.

```
L1   in-process Map     microseconds · per instance · lost on cold start
L2   Upstash Redis      shared across instances · survives deploys
```

Both tiers are stale-while-revalidate: `ttlSeconds` is how long a value is
fresh, and for a further window a stale value is served immediately while a
refresh runs behind the reader. Concurrent callers for the same key share one
in-flight load, so a cold cache under load produces one upstream request rather
than one per reader.

Only *derived* values are cached. The chain directory is a 5MB payload and the
protocol list is 7MB; both are projected down to small objects before anything is
written, which keeps every entry well inside Upstash's per-value limit.

Measured locally: **~5s cold, ~15ms warm.** `vercel.json` schedules
`/api/health` every five minutes so no visitor pays for a cold build.

---

## Layout

```
src/
  server/
    lib/http.ts            fetch with timeouts, retries, bounded concurrency
    cache/                 Upstash client + the two-tier SWR cache
    sources/               one adapter per upstream, each independently cached
    domain/
      registry via join    CoinGecko-keyed identity join across sources
      score.ts             the model: percentiles, weights, regression
      aggregate.ts         builds the snapshot and the plain-language thesis
    api/routers/chains.ts  tRPC procedures
  components/
    chart/                 hand-built SVG: scatter, area, sparkline, bars
    table/                 the ranked screen
  app/
    page.tsx               the screen
    chain/[slug]/          per-chain breakdown
    api/health/            liveness, coverage, fit diagnostics, cache warm-up
```

Data flows one way: adapters → snapshot → tRPC → TanStack Query. The snapshot is
denormalised, so a page view is a single cache read and the client never
waterfalls.

`/api/health?verbose=1` returns per-source status, per-metric coverage counts,
the regression's residual distribution, and the top-ranked chains with their
thesis lines. It is the fastest way to see whether the model is behaving.

---

## Visual and accessibility decisions

The data-encoding colours are validated, not chosen by eye. The categorical trio
and the diverging pair clear every colour-vision gate against this app's exact
dark surface: lightness band, chroma floor, adjacent-pair CVD separation (worst
ΔE 9.4), normal-vision separation (worst ΔE 20.9) and 3:1 contrast.

- **Brand colours never encode a value.** A chain's colour appears on its avatar
  ring, where it carries identity. Data marks use the validated tokens only.
- **Sparklines use one hue, not green-up/red-down.** That pairing measures
  ΔE 6.5 under protanopia, which is only legal alongside a second encoding, and a
  bare sparkline has none. Direction is carried by the line's shape and by the
  signed delta printed beside it.
- **Status colours always ship with a glyph or label**, never hue alone.
- **Every chart has a table twin.** The scatter's values are all present in the
  ranked table below it, so no value is reachable only by hover.
- **One filter row scopes everything.** The scatter and the table render from the
  same pure filter function and cannot disagree.

---

## Limitations

- Market caps are **circulating**, not fully diluted. A chain with a large unlock
  ahead looks cheaper here than it is.
- Chain-level fees make most L1s look expensive on a price-to-fees basis. That is
  the correct reading for a token, and it is a different question from "is this
  chain widely used".
- Cross-chain flow covers the dozen chains Mayan routes to, from a sample
  spanning a couple of hours, and is an estimate.
- Scores are **relative to the chains on this screen** and move as the data moves.
- This is a screen, not advice. It decides what to look at next.

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm start       # serve the build
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
```
