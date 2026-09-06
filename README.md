# Cipher

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
| Chain fees, 30d | 20% |
| Stablecoin float | 18% |
| Total value locked | 17% |
| Chain revenue, 30d | 12% |
| DEX volume, 30d | 12% |
| Real-world assets | 11% |
| Bridged volume, 30d | 6% |
| Protocols deployed | 4% |

**Momentum** — whether that economy is growing or decaying. 30-day fee growth
(27%), stablecoin growth (22%), TVL growth (20%), DEX volume growth (16%),
bridged volume growth (9%), real-world asset growth (6%).

**Active addresses and transaction counts are deliberately absent.** Both are
trivially inflated by airdrop farming and bot traffic, and neither says much
about whether a chain earns anything. They were in the model and were removed.
Stablecoin float took most of the freed weight: it is the least gameable measure
of whether anyone is actually using a chain, because it is money someone chose to
settle there rather than incentivised deposits chasing a yield that leaves when
the yield does. Both its level and its 30-day direction are scored.

**Cheapness** — the valuation ratios, inverted so high means cheap. Market cap
over annualised fees (28%), over TVL (23%), over annualised revenue (18%), over
stablecoin float (14%), over annualised DEX volume (10%), over real-world assets
(7%). A chain needs at least two of these present or it is left **unrated** — one
odd denominator is enough to put a chain wrongly at the top of a "cheapest" list.
When that happens the interface says so rather than quietly renormalising the
remaining weights.

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

Only metrics whose absence is a genuine *data gap* count toward coverage.
Real-world assets, bridged volume and Mayan routing are all excluded: the first
two come from complete global scans, so a chain missing from them holds a real
zero, and the third reaches about a dozen chains by design. Counting any of them
would dock a chain's confidence for a fact about the world rather than a fact
about the data.

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

### DefiLlama — capital, revenue, real-world assets and bridge flow
Free, unauthenticated. TVL and 90-day TVL history, stablecoin float, DEX volume,
bridged volume, tokenised real-world assets, protocol counts, market caps and
30-day price history.

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
- **Real-world assets cost no extra request.** The ~7MB protocol payload already
  fetched for protocol counts carries 183 protocols categorised `RWA` or
  `RWA Lending`, each with a per-chain breakdown. One pass produces both
  aggregates. The breakdown mixes real chains with accounting buckets — 59 of its
  134 keys are things like `Ethereum-borrowed` and `doublecounted` — and summing
  those would double count and invent chains.
- **Bridge flow comes from aggregators.** DefiLlama's dedicated bridges API now
  returns 402 on every path, so the per-chain deposit and withdrawal data behind
  defillama.com/bridges/chains is not available for free. The substitute measures
  the 27 aggregator front-ends it tracks — LI.FI, Jumper, Socket, Rango and
  others — across most of the 85 chains. Mayan is not among those 27, so the two
  sources do not double count.

### Artemis — the chain universe, and cross-chain capital flow
**No API key needed.** Two open endpoint families do the work.

The asset directory behind [artemis.ai/sectors/chains](https://www.artemis.ai/sectors/chains)
supplies 100+ chains with CoinGecko ids, brand colours, logos, descriptions,
founders and links. That CoinGecko id is what joins Artemis to DefiLlama cleanly
— it resolves every major chain without a hand-written alias table, and the
matching is strict (exact id, exact name, or an explicit alias) because fuzzy
matching produced false pairs like Lighter/LightLink.

The flow data behind [artemis.ai/sectors/flows](https://www.artemis.ai/sectors/flows)
gives inflow, outflow and net figures in USD across **35 chains** — the broadest
flow source available, and nearly three times Mayan's reach. Passing no
`sourceChains` filter returns every chain Artemis tracks; naming a subset instead
restricts the aggregation to flows *between* those chains, which quietly
understates every one of them, so the filter is omitted.

Its `/articles/` feed is open too, and supplies the research window. Two limits
shape how that is presented: only about a quarter of articles are crypto, the
rest being equities research, and `mentioned_tickers` is populated on roughly a
fifth and almost entirely with stock symbols. **Articles cannot be tied to
chains**, so it is a global reading list filtered to the crypto category, and the
interface calls it research rather than news.

Artemis' gated `/v2/data/` metrics are not used. They covered daily active
addresses and transactions, which were dropped from the model as vanity metrics,
and the API key requirement went with them.

### CoinGecko — market attention, and dilution
Free, unauthenticated, **one request for every chain**. Shown, never scored.

This exists because the obvious social sources do not work. X's API starts around
$200/month. CoinGecko's own `community_data` is nulled out on the free tier. And
the per-coin endpoint that carries sentiment votes throttles after **four**
sequential calls against the forty-odd needed here — so that route is not slow,
it is unusable. The markets endpoint takes every id at once and carries three
things worth having.

**Fully diluted valuation is the reason this earns its place.** Every ratio in
the model divides *circulating* market cap, which quietly flatters any chain with
a large unlock ahead: Hyperliquid trades at **4.3×** its circulating cap. The
overhang is now shown wherever a chain is called cheap, and the thesis says so
in words. Alongside it: 24h trading volume, the honest version of "attention",
and distance from the all-time high.

### Cross-chain flow — one dataset
There is one flow view, combined from four public sources with each dollar
counted once, and the selected chain shows what each source contributed.

**Totals and routes are combined from four public sources, each dollar counted
once.** Artemis is the backbone — Across, USDT0, the canonical bridges and its own
partial attribution of Wormhole and deBridge, across 43 chains. Mayan's corridor
matrix is added in full: Artemis does not carry it (on Monad, Mayan reports $83M
of inflow in a month where Artemis sees $25M in total). Wormhole and deBridge
contribute only the *excess* over what Artemis already attributes to them, per
chain and per direction, and each of their routes is scaled by the same share so
the ribbons sum to the totals they sit beneath.

**Mayan and Wormhole overlap, but only partly.** About 40% of Mayan's volume rides
Wormhole messages and appears in Wormhole's matrix tagged `MAYAN`; the rest
settles through Mayan's own solvers and never touches Wormhole. So the Wormhole
adapter removes the Mayan-tagged share per source chain (read from Wormholescan
with and without `appId=MAYAN`) and Mayan is counted from its own figures. An
earlier version excluded Mayan altogether because one corridor happened to match
on both — measured properly, Ethereum to Solana is $3.9B on Mayan against $60M
on Wormhole over the same month, so that match was a coincidence and the
exclusion lost most of Mayan's flow.

**DefiLlama's bridge data would have been the single broad source.** Every one of
its bridge endpoints now answers `402` and points to the paid plan, so it is not
used.

**One vocabulary matters more than it sounds.** The bridge adapters speak
DefiLlama's chain names and Artemis speaks its own, so "Avalanche" and "Avalanche
C-Chain" arrived as two different chains and never merged. Before the fix,
Artemis appeared to see 42% of volume the combined set missed; afterwards, 7.5%.

**DefiLlama's own bridge data is not available.** `defillama.com/bridges/chains`
runs on their `inflows` endpoint, which returns 402 and asks for a subscription,
as does every path under `bridges.llama.fi`. Their free `chain-assets` endpoint
does work and gives bridged assets *held* per chain, but that is a stock rather
than a flow and answers a different question.

### Layer — L1 or L2
Two registries, because neither is sufficient alone.

CoinGecko's `layer-1` and `layer-2` categories are two bulk requests and cover
most chains, but they key on a token, so tokenless rollups came back
unclassified — Base among them. L2Beat classifies by construction, and its
specific scaling categories (optimistic rollup, ZK rollup, optimium, validium)
catch exactly those. Its "Other" bucket holds 78 projects including Hyperliquid,
Polygon PoS and Gnosis, so treating that as L2 would assert something most
readers would dispute; those fall through to CoinGecko instead.

The result is 30 L1, 14 L2 and 11 left unclassified. That last group is not a
failure: appchains, sidechains and validiums genuinely fit neither label, and
guessing would be worse than admitting it.

### News — one search per chain
No free crypto news API exists: CoinGecko's is Pro-only, CryptoPanic wants a key.
Google News publishes any search as RSS without one, which is what makes
per-chain coverage possible. Roughly 1,300 articles across 44 chains.

**Two bugs are worth recording, because both produced output that looked
plausible.**

The first version merged four general crypto feeds and matched chain names
against whatever came back. It gave twenty tagged headlines out of sixty, nearly
all about Bitcoin, because that is what general feeds cover.

The second capped every chain at eight and sliced Google's own ordering. That
ordering is **relevance, not date** — so the list rendered chronologically while
actually being a relevance sample. Monad kept a three-week-old "What Is APR
Crypto?" explainer and dropped that morning's piece on its block time; twenty
dropped articles were fresher than something kept. Sorting by date before
truncating moved the median headline age from 8 days to 2.

The uniform eight was its own problem: it made every chain look equally
newsworthy. The real thirty-day counts run from 100 for Solana to 2 for Mezo,
and that spread says something.

**There is no cap now, and removing it fixed something larger.** The only real
justification for capping had been payload size — and headlines were riding
inside the snapshot that every page load fetched, where they were **81% of it**.
Moving them to their own request took the per-page payload from 252 KB to 44 KB
and made the cap pointless in the same stroke: nobody pays for headlines until
they open the window, so all 1,186 are kept and nothing is truncated.

Queries carry `when:30d`, and chain names that are ordinary English words get a
hand-written query — searching "Base" or "Stable" returns everything and
nothing, so those become `"Base" Coinbase L2 crypto` and similar.

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

Those are the only two, and both are optional. Every data source this app reads
is open and unauthenticated.

Create a Redis database at [console.upstash.com](https://console.upstash.com/redis)
and paste the REST credentials. Nothing breaks without them: the app falls back
to its in-process cache, and a Redis that is misconfigured or down logs a warning
per key and serves from origin.

---

## Caching

A cold snapshot touches roughly 250 third-party endpoints, so caching is part of
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

A Vercel cron hits `/api/health` once a day, the most the Hobby plan allows.
Between runs, the snapshot stays servable for a day after it goes stale and
every stale read refreshes it behind the reader (kept alive with `waitUntil`,
since a serverless function may otherwise be frozen once it responds), so a
visitor after a quiet day gets an instant page while the rebuild happens
behind them, and only a full day of silence plus a failed cron produces a
cold build.

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
  lib/glossary.ts          every on-screen term, defined once
  server/sources/bridges/  one adapter per protocol, normalised in shared.ts
  components/
    chart/                 hand-built SVG: scatter, area, sankey, sparkline, bars
    ui/explain.tsx         the definition popover, portalled past overflow
    window/                a draggable, minimisable panel and its shared state
  server/sources/l2beat.ts which chains are actually rollups
    flows-window.tsx       the capital-flow explorer that lives inside it
    news-window.tsx        headlines, filterable by chain, in a second window
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
  ranked table below it, and the flow diagram is paired with a ranked corridor
  table, so no value is reachable only by hover.
- **Nothing is left undefined.** Every score, symbol and column label carries an
  info affordance backed by `src/lib/glossary.ts`, and the methodology panel
  works one real chain through the model end to end using live numbers. R² and σ
  appear in the explanations rather than on the face of the interface.
- **One filter row scopes everything.** The scatter and the table render from the
  same pure filter function and cannot disagree.
- **Tooltips open on hover, and stay open long enough to reach.** There is a gap
  between the icon and the panel, and the panel holds the formula and a worked
  example. Trigger and panel share one close timer, so crossing the gap does not
  dismiss it. Focus opens it for keyboard users; tap opens it on touch, which has
  no hover to use.
- **Chain logos sit inside the alpha-map marks, with the value gap as a ring
  around them.** Identity inside, encoding outside, so a brand colour still never
  carries a quantity.
- **An unfocused window fades.** These float over a dense ranking, and an opaque
  panel on top of the table you are reading is in the way. Reaching past it drops
  it to 45%; touching it brings it back. It stays fully interactive while faded,
  so one click restores rather than a re-open.
- **Nothing important lives below the fold.** The page is one dense ranking, and
  material stacked underneath it goes unread. Cross-chain flow therefore opens in
  a draggable window from the sticky header instead: summoned when wanted, moved
  aside rather than closed, and left open while you keep working on the page
  behind it. On phones it becomes a sheet, because dragging a window around a
  phone is a desktop metaphor in the wrong place.
- **Flow ribbons scale with the square root of volume.** One route can be three
  quarters of everything moving; drawn linearly it fills the panel and every
  other chain collapses to a hairline. The transform is stated in the legend and
  the exact figures sit in the table beneath.

---

## Limitations

- Market caps are **circulating**, not fully diluted. A chain with a large unlock
  ahead looks cheaper here than it is.
- Chain-level fees make most L1s look expensive on a price-to-fees basis. That is
  the correct reading for a token, and it is a different question from "is this
  chain widely used".
- Bridged volume covers aggregator-routed transfers, not every bridge, because
  DefiLlama's full bridge data is now paid.
- Mayan routing covers the dozen chains it reaches, from a sample spanning a few
  hours, is measured in transfers rather than dollars, and feeds no score.
- Real-world asset figures follow DefiLlama's categorisation. A chain showing
  none genuinely has none in that data set.
- Scores are **relative to the chains on this screen** and move as the data moves.
- Market caps remain circulating in the model. Fully diluted value is shown
  beside them rather than substituted, because the float you can buy today is the
  right denominator for a ratio; the overhang is the caveat, not a replacement.
- Social metrics are absent by necessity, not choice. Follower counts sit behind
  a paid API, and the free tiers that once carried sentiment have closed.
- News coverage is thin below the top ten chains, because the press is. That is a
  fact about the media, not a gap in the plumbing.
- Token Terminal was evaluated and left out. Its public API needs a paid key, its
  internal API rejects requests without a browser session, and the only open path
  returns 50 of 9,139 rows from a URL containing a build hash that changes on
  every deploy. Not something to build on.
- This is a screen, not advice. It decides what to look at next.

## Scripts

```bash
pnpm dev         # dev server
pnpm build       # production build
pnpm start       # serve the build
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
```

## Market context

Beside the ranking sits a rail of five market signals that read at a glance —
Fear & Greed, the 90-day altcoin season index, the Bitcoin rainbow band, where
Bitcoin sits in its four-year cycle, and the halving countdown. A **Market**
window holds the rest: **the market cycle** (since 2018, Bitcoin's price
coloured by Fear & Greed and the altcoin market cap coloured by the altcoin
season index, one time axis and one crosshair); **Bitcoin's four-year cycle** (every top and bottom found from the
price record, power-law curves through each, and the window past spacing implies
for the next bottom and top); Fear & Greed since 2018; every coin the altcoin
season index counted; and the rainbow chart. **None of it feeds the model**:
`score.ts` and `aggregate.ts` import nothing from `market*`.

Everything comes from free, keyless endpoints:

| Data | Source |
|---|---|
| Daily Bitcoin price since 2010 | CoinMetrics community API (drives the rainbow fit) |
| Fear & Greed, daily since February 2018 | alternative.me |
| The top 100 by market cap, with circulating supply | CoinGecko |
| Prices for those 100 coins — daily for 15 months, weekly since late 2017 | DefiLlama coins API (the altcoin season index and the altcoin market cap) |
| Block height | mempool.space, blockstream.info |

Honest labels: the **altcoin season index is CoinMarketCap's 90-day definition**
computed on real history, with the number of coins compared shown beside it;
**market caps are price × today's circulating supply**, so shapes are exact and
levels approximate; the **altcoin series are blank where fewer than 40 of
today's top 100 had a price**, rather than drawn from a handful of survivors;
and the **rainbow bands run in the classic spectrum**, cool for cheap and warm
for expensive, each band named at the chart's edge. The regression is fitted to rows
before 2025 so the band edges do not drift daily, and the nine bands are equal
log-steps spanning the middle 99% of its residuals, so the price has been inside
the rainbow on 99% of days.
