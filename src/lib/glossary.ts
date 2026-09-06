/**
 * Every term this app puts on screen, defined in plain language.
 *
 * The rule: if a number, symbol or label appears in the interface, it has an
 * entry here and an `<Explain>` affordance next to it. Statistical shorthand
 * like R² and σ is precise for people who already know it and opaque for
 * everyone else, and a screen nobody can interpret is not a screen.
 */

export interface GlossaryEntry {
  /** Heading shown in the popover. */
  title: string;
  /** One sentence. Should stand alone. */
  short: string;
  /** The fuller explanation, one or two paragraphs. */
  long: string;
  /** How it is calculated, in words rather than notation where possible. */
  formula?: string;
  /** A concrete reading, so the number means something. */
  example?: string;
}

export const GLOSSARY = {
  valueGap: {
    title: "Value gap",
    short:
      "How far the market's price sits from what the chain's actual activity supports, on a scale of −100 to +100.",
    long: "Positive means the chain is undervalued against its peers: it earns, holds or moves more than its market cap suggests. Negative means the opposite. Zero means price and activity are in line with the rest of the screen.\n\nIt is a relative measure. A chain scoring +40 is cheap compared with the other chains listed here, not cheap in absolute terms.",
    formula:
      "43% the gap between its fundamentals rank and its market-cap rank, 32% how cheap its valuation ratios are, 25% whether its activity is growing.",
    example:
      "A chain ranked 10th on fundamentals but 28th by market cap has a large positive gap, and the model rewards it.",
  },

  fundamentals: {
    title: "Fundamentals",
    short:
      "How big the chain's real economy is, scored 0 to 100 against the other chains on this screen.",
    long: "Eight measures are combined: the fees the chain earns, its stablecoin float, the capital locked on it, its revenue, DEX volume, tokenised real-world assets, bridged volume, and how many protocols have deployed there.\n\nEach is converted to a percentile before weighting, because these numbers span six orders of magnitude and a raw average would let one large figure swamp the rest.\n\nActive addresses and transaction counts are deliberately absent. Both are trivially inflated by airdrop farming and bot traffic, and neither says much about whether a chain earns anything.",
    formula:
      "Weighted average of percentile ranks. Fees carry the most weight at 20%, then stablecoin float at 18%.",
    example:
      "A score of 78 means the chain's economy is larger than 78% of its peers.",
  },

  momentum: {
    title: "Momentum",
    short:
      "Whether that economy is growing or shrinking, scored 0 to 100 against peers.",
    long: "Compares the last 30 days with the 30 before them across fees, stablecoin float, capital, DEX volume, bridged volume and real-world assets.\n\nMomentum carries a quarter of the value gap on purpose. A cheap valuation on a shrinking business is a value trap, not an opportunity, and without this term the model would rank decaying chains highest.",
    formula:
      "Weighted average of percentile-ranked 30-day growth rates. Fee growth carries the most weight at 27%, then stablecoin growth at 22%.",
    example: "A score of 20 means almost every other chain is growing faster.",
  },

  cheapness: {
    title: "Cheapness",
    short:
      "How low the chain's valuation ratios are compared with peers. Higher means cheaper.",
    long: "Six ratios of market cap to something real: annualised fees, TVL, annualised revenue, stablecoin float, annualised DEX volume, and real-world assets. Each is ranked and then inverted, so the chain with the lowest ratio scores highest.\n\nA chain needs at least two of the six to be scored at all. One odd denominator is enough to put a chain wrongly at the top of a cheapest-first list.",
    formula:
      "Weighted average of inverted percentile ranks across the six ratios.",
    example:
      "A score of 91 means only 9% of chains trade on cheaper multiples.",
  },

  confidence: {
    title: "Confidence",
    short:
      "How much the score can be trusted, based on how complete the chain's data is and how big the chain is.",
    long: "Two things drag a score toward guesswork. Missing inputs, and size. A chain with a $3M TVL can post a spectacular valuation ratio purely because its denominator is close to noise.\n\nThis is not a percentile. It does not say the chain is better or worse than its peers, only how much weight to put on its position.",
    formula:
      "55% the share of model inputs the chain actually supplied, plus 45% a size gate that ramps from $5M to $5B on the larger of TVL, stablecoins, or 20× annualised fees.",
    example:
      "Below 45%, the model stops using the chain to fit the peer trend line and flags it as directional only.",
  },

  percentile: {
    title: "Percentile",
    short:
      "A chain's rank on one measure against every other chain on this screen, from 0 to 100.",
    long: "Percentiles are used throughout instead of raw values because crypto metrics span enormous ranges. Ethereum's fees are thousands of times a small chain's, and any straight average would be decided entirely by the largest number in it.\n\nThe comparison set is the chains listed here, currently capped at the 55 largest by TVL. It is not a ranking against all blockchains that exist.",
    example: "82 means the chain beats 82% of the screen on that measure.",
  },

  peerFit: {
    title: "How much fundamentals explain",
    short:
      "The share of the differences in chain market caps that economic scale accounts for.",
    long: "Market caps are plotted against a measure of each chain's economic size, and a line is fitted through them. This number is how much of the spread that line captures. Statisticians call it R-squared, on a scale of 0 to 1.\n\nAround half is the interesting result. If fundamentals explained nearly everything, there would be no mispricing to find and no reason for this screen. If they explained almost nothing, the model would have no basis at all. Half means the numbers matter and leave real room for the market to be wrong.",
    formula: "R², the coefficient of determination from the peer regression.",
    example:
      "0.52 means about half the variation in market caps tracks economic scale, and half is narrative, token age, float and everything else.",
  },

  trendBand: {
    title: "The shaded band",
    short:
      "The range around the trend line where roughly two chains in three sit.",
    long: "Chains scatter around the peer trend line rather than sitting on it. The band shows one standard deviation of that scatter, written σ in statistics, which by convention covers about 68% of cases.\n\nThe band here is wide, several times over in either direction. That is the honest picture and it is why this app reports a chain's distance from the line rather than converting it into a price target it cannot support.",
    example:
      "A chain outside the band is unusually priced for its size, in whichever direction it sits.",
  },

  trendResidual: {
    title: "Distance from trend",
    short:
      "How far a chain's market cap sits from the peer trend line, measured in standard deviations.",
    long: "Negative means the market values the chain below what its economic size would predict; positive means above. The unit is the σ from the shaded band, so −1.0 sits exactly one band-width below the line.\n\nIt is deliberately reported this way rather than as a percentage upside. With a fit this loose, a percentage would imply a precision the data does not have.",
    example:
      "−1.4 means priced well below trend, in the bottom seventh or so of the scatter.",
  },

  scaleIndex: {
    title: "Economic scale index",
    short:
      "A single 0 to 100 measure of how economically large a chain is, on a log scale.",
    long: "The horizontal axis of the alpha map. It blends fees, TVL, stablecoins, DEX volume, revenue, real-world assets, bridged volume and protocols, all in log space so the distances between chains stay meaningful.\n\nThis is a separate calculation from the fundamentals score. Fundamentals uses percentile ranks, which are robust but flatten the gaps between chains. The trend line needs those gaps preserved, so it uses this instead.",
  },

  valueTrap: {
    title: "Value-trap risk",
    short:
      "The chain looks cheap on its ratios, but the activity underneath it is shrinking.",
    long: "Flagged when a chain is meaningfully undervalued while momentum sits in the bottom third. These are the chains that look most attractive on a screen and most often should not be bought, because the denominator of every cheap-looking ratio is still falling.",
  },

  rwa: {
    title: "Real-world assets",
    short:
      "Tokenised off-chain assets held on the chain: treasuries, private credit, tokenised equities and funds.",
    long: "Counted across every protocol DefiLlama categorises as RWA or RWA Lending, summed by chain. It is a measure of institutional capital that has chosen to settle somewhere, and it tends to be far stickier than yield-chasing TVL.\n\nA chain with no entry genuinely holds none, so it ranks last rather than going unscored.",
    example: "Ethereum holds roughly $15B, Stellar and Solana around $2B each.",
  },

  bridgeVolume: {
    title: "Bridge volume",
    short:
      "Value moved to and from the chain through cross-chain bridge aggregators over 30 days.",
    long: "Covers the 27 aggregator front-ends DefiLlama tracks, including LI.FI, Jumper, Socket and Rango. Rising bridged volume means capital is choosing to move somewhere, which tends to lead TVL, which in turn tends to lead price.\n\nDefiLlama's full bridge deposit and withdrawal data moved behind a paid plan, so this measures aggregator-routed flow rather than every bridge transfer.",
  },

  stablecoins: {
    title: "Stablecoin float",
    short: "Dollars parked on the chain as stablecoins.",
    long: "The least gameable measure of whether anyone is actually using a chain. Stablecoin supply is money someone chose to settle somewhere, rather than incentivised deposits chasing a yield that will leave when the yield does.\n\nBoth the level and its 30-day direction are scored, at 18% of fundamentals and 22% of momentum — the heaviest weights in the model after fees.",
  },

  dexVolume: {
    title: "DEX volume",
    short:
      "Spot trading volume on decentralised exchanges on the chain, over 30 days.",
    long: "A throughput measure rather than a capital one. It captures how hard the capital sitting on a chain is actually working, and it is the same figure DefiLlama reports on its DEX rankings.",
  },

  chainFees: {
    title: "Chain fees",
    short:
      "Fees earned by the chain itself, not by the applications running on it.",
    long: "This distinction changes the answer completely. Summing every protocol on Ethereum gives roughly $288M over 30 days; the network itself earns around $10M of that. The rest accrues to Uniswap, Aave and the other applications, not to ETH.\n\nFor valuing a chain's token, the network's own take is the correct denominator. It also makes most layer ones look expensive on a price-to-fees basis, which is a real finding rather than an error.",
  },

  mcapToFees: {
    title: "Market cap ÷ annualised fees",
    short:
      "What the market pays for each dollar of fee income the chain itself earns each year.",
    long: "The closest crypto equivalent to a price-to-sales ratio. Lower is cheaper. Because chain-level fees are small relative to token valuations, these multiples run into the hundreds or thousands, and the peer median is the number worth comparing against rather than any absolute threshold.",
  },

  netFlow: {
    title: "Net cross-chain flow",
    short:
      "Capital that moved onto a chain minus capital that left it, over the last 30 days.",
    long: "Positive means more value arrived than departed. It is the clearest read on where capital is choosing to sit, and it tends to move before the metrics the model scores: money bridges in, then TVL rises, then price follows.\n\nCombined from four public sources — Artemis (Across, USDT0 and the canonical bridges), Mayan, Wormhole and deBridge — with each dollar counted once, across roughly fifty chains. It is shown rather than scored, because that is still not every chain on this screen and scoring a metric some cannot have would penalise them for it.",
    example:
      "A chain gaining capital is not automatically undervalued. Read it as a reason to look, not a conclusion.",
  },

  dilution: {
    title: "Dilution overhang",
    short:
      "Fully diluted valuation divided by circulating market cap. How much of the token supply is still to come.",
    long: "Every valuation ratio on this screen divides *circulating* market cap, because that is what you can buy today. That quietly flatters any chain with a large unlock ahead: the fees look cheap against today's float and considerably less cheap against tomorrow's.\n\n1.0 means the supply is fully issued. 4.3 means four times the current float is still to be released. It is shown rather than scored, but it is the first thing to check on anything this screen calls cheap.",
    example:
      "Bitcoin sits near 1.0. Hyperliquid is above 4, so its circulating cap describes a fraction of the eventual supply.",
  },

  attention: {
    title: "Market attention",
    short:
      "Spot trading volume over 24 hours, and how far the token sits below its all-time high.",
    long: "The nearest honest substitute for social metrics. Follower counts sit behind a paid API, and the free tiers that once carried sentiment have closed, so this uses liquidity and drawdown instead — both of which are harder to fake than a follower count.\n\nNeither feeds the score. Trading volume measures interest without saying whether the interest is informed, and distance from a high is a fact about the past.",
  },

  routing: {
    title: "Live routing",
    short:
      "Cross-chain transfers into and out of the chain right now, from a recent sample of Mayan swaps.",
    long: "Counts, not dollars. Mayan's public feed attaches unreliable prices to individual swaps, often quoting the wrong asset, so a dollar figure per chain would be a transfer count wearing a dollar sign.\n\nThis is shown alongside the model rather than inside it. Mayan routes to about a dozen chains, and scoring a metric most of the screen structurally cannot have would penalise them for something that is not their fault.",
  },

  /* ---------------------------------------------------- market indicators ---- */

  fearGreed: {
    title: "Fear & Greed index",
    short:
      "A 0–100 reading of crypto market sentiment: 0 is extreme fear, 100 is extreme greed.",
    long: "Alternative.me's index, the one every aggregator republishes. It blends volatility, market momentum and volume, social media activity, Bitcoin dominance and search trends into a single daily figure.\n\nThe conventional reading is contrarian: extreme fear has tended to accompany bottoms and extreme greed tops. That is a tendency, not a rule, and this app shows the index rather than scoring on it.",
    example:
      "74 reads as Greed. Below 25 is Extreme fear; above 75 is Extreme greed.",
  },

  rainbowBand: {
    title: "Bitcoin rainbow chart",
    short:
      "Which of nine bands around Bitcoin's long-run price trend today's price falls in, from 'fire sale' to 'maximum bubble'.",
    long: "A logarithmic regression of price against time since Bitcoin's genesis block, fitted here to every day before 2025 so the bands do not drift day to day. Nine bands of equal width in log terms are drawn around that trend line, placed so the price has been inside them on 99% of days since 2010, each with the classic label.\n\nIt is a way of seeing where a price sits against its own history, not a forecast. The bands run in the classic rainbow order — violet and blue for cheap, through green and yellow, to orange and red for expensive — so the two poles still agree with the blue-is-cheap, red-is-expensive colouring used everywhere else on the screen.",
    formula:
      "ln(price) = a + b · ln(days since 3 January 2009), fitted by least squares to days before 2025. The nine band edges are ten equal steps between the 0.5th and 99.5th percentile of the fit's residuals.",
  },

  halving: {
    title: "Bitcoin halving",
    short:
      "Every 210,000 blocks the new supply per block halves. This is the countdown to the next one.",
    long: "Estimated from the current block height at ten minutes a block, so the date drifts by a few days as real block times vary. Cycle progress is how far through the current 210,000-block epoch the chain is.\n\nPast halvings: November 2012, July 2016, May 2020, April 2024.",
  },

  altcoinSeason: {
    title: "Altcoin season index (90-day)",
    short:
      "The share of the 100 largest coins that beat Bitcoin over the last 90 days. Above 75 is altcoin season; below 25 is Bitcoin season.",
    long: "CoinMarketCap's definition, computed here on real price history rather than a snapshot, so it has a year of its own past. Stablecoins, tokenised treasuries, gold tokens and wrapped or staked forms of other assets are removed first, because none of them can meaningfully beat or lose to Bitcoin.\n\nPrices come from DefiLlama for every coin CoinGecko ranks in the top 100. The count of coins actually compared is shown beside the index; below 40 the index is withheld.",
    formula:
      "Eligible top-100 coins whose 90-day return exceeds Bitcoin's, divided by the eligible count, times 100. Recomputed for every day in the window.",
  },

  altcoinMarketCap: {
    title: "Altcoin market cap",
    short:
      "Combined market cap of the top-100 coins excluding Bitcoin, stablecoins and wrapped tokens.",
    long: "Each day's figure is price times today's circulating supply, summed over today's top 100 without Bitcoin, pegs, wrapped tokens or funds, so the shape is exact and the level approximate. It is drawn only on days at least 40 of those coins had a price, and because the basket is today's, older values favour the coins that survived into it.",
  },

  marketCycle: {
    title: "The market cycle",
    short:
      "Two panels since 2018: Bitcoin's price coloured by Fear & Greed, and the altcoin market cap coloured by the altcoin season index.",
    long: "Each panel keeps one y-axis and lets the second variable ride on colour, so a stretch of red near a peak or blue near a trough reads straight off the line. The colours follow the app's cheap-to-expensive scale — fear and Bitcoin season cool, greed and altcoin season warm — and every zone is named in the legend, so nothing is colour alone. A second y-axis is avoided on purpose: a chart with two y-scales can be made to say anything by choosing where they meet. One crosshair runs through both panels.\n\nShown, not scored. Nothing here touches a chain's rank.",
  },

  bitcoinCycles: {
    title: "Bitcoin's four-year cycle",
    short:
      "Every cycle top and bottom in Bitcoin's history, the spacing between them, and the window that spacing implies for the next ones.",
    long: "Tops and bottoms are found from the price record, not typed in: the long-run trend line first splits the record into cycles, then each cycle's top is the highest price between two bottoms and each bottom the lowest price between two tops. That lands on June 2011, December 2013, December 2017 and November 2021 for tops, and November 2011, January 2015, December 2018 and November 2022 for bottoms. The latest peak is treated as this cycle's top but drawn hollow until a bottom confirms it.\n\nA power-law curve — price against days since genesis, both on log scales — runs through the bottoms. Through the tops, several candidate curves are fitted and backtested: each is fitted on the tops before 2021 and before 2025 and asked to predict those tops. A straight power law over-predicted both by about 2×; the default is whichever came closest for the latest top, and the card lets you switch between them. Each top has landed a smaller multiple above the last (39×, 17×, 3.4×, 1.9×), and every model has still over-shot — read the ratios. The windows for the next bottom and top come from the range of past spacings since 2013; the 2011 cycle, on a market a thousandth the size, is shown but not averaged.\n\nFour cycles is a small sample and a pattern is not a law. Shown, not scored.",
    formula:
      "Next bottom: the last top plus the shortest and longest top-to-bottom spacing since 2013. Next top: the middle of that window plus the shortest and longest bottom-to-top spacing. Prices at those dates come from the fitted curves.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTerm = keyof typeof GLOSSARY;
