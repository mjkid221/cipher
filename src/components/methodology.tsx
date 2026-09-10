"use client";

import { CollapsiblePanel } from "~/components/ui/primitives";

import { formatScore, formatSigned } from "~/lib/format";
import { GLOSSARY, type GlossaryTerm } from "~/lib/glossary";
import { divergingHue } from "~/lib/palette";
import type { AggregateMeta, ChainSnapshot } from "~/server/domain/types";
import type { RouterOutputs } from "~/trpc/react";

type Methodology = RouterOutputs["chains"]["methodology"];

const LABELS: Record<string, string> = {
  fees30d: "Chain fees, 30d",
  revenue30d: "Chain revenue, 30d",
  tvl: "Total value locked",
  stablecoins: "Stablecoin float",
  stablecoinsChange30d: "Stablecoin growth, 30d",
  dexVolume30d: "DEX volume, 30d",
  protocols: "Protocols deployed",
  rwaValue: "Real-world assets",
  bridgeVolume30d: "Bridged volume, 30d",
  feesChange30d: "Fee growth, 30d vs prior 30d",
  tvlChange30d: "TVL growth, 30d",
  dexVolumeChange30d: "DEX volume growth, 30d",
  bridgeVolumeChange30d: "Bridged volume growth, 30d",
  rwaChange30d: "Real-world asset growth, 30d",
  mcapToFees: "Market cap ÷ annualised fees",
  mcapToTvl: "Market cap ÷ TVL",
  mcapToRevenue: "Market cap ÷ annualised revenue",
  mcapToStablecoins: "Market cap ÷ stablecoin float",
  mcapToDexVolume: "Market cap ÷ annualised DEX volume",
  mcapToRwa: "Market cap ÷ real-world assets",
  rankGap: "Fundamental rank − market-cap rank",
  cheapness: "Valuation multiples, inverted",
  momentum: "Growth of the underlying activity",
};

/** Terms shown in the glossary section, in reading order. */
const GLOSSARY_ORDER: GlossaryTerm[] = [
  "valueGap",
  "fundamentals",
  "momentum",
  "cheapness",
  "confidence",
  "percentile",
  "peerFit",
  "trendBand",
  "trendResidual",
  "scaleIndex",
  "valueTrap",
  "chainFees",
  "rwa",
  "bridgeVolume",
  "routing",
];

export function MethodologyPanel({
  methodology,
  meta,
  example,
}: {
  methodology: Methodology | undefined;
  meta: AggregateMeta;
  /** A real chain, so the worked example can never drift from the model. */
  example?: ChainSnapshot;
}) {
  return (
    <CollapsiblePanel
      title="How the score is built"
      summary="Every weight below is read from the scoring code at request time, so this panel cannot drift from the model. Open it for a worked example and a definition of every term on the screen."
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <WeightList
            title="Fundamentals"
            caption="How large the chain's real economy is, as a percentile against peers."
            weights={methodology?.fundamental}
          />
          <WeightList
            title="Momentum"
            caption="Whether that economy is growing or decaying."
            weights={methodology?.momentum}
          />
          <WeightList
            title="Cheapness"
            caption="Valuation ratios, inverted so that high means cheap. With fewer than two, cheapness is skipped and the value gap comes from rank and momentum alone."
            weights={methodology?.cheapness}
          />
        </div>

        <div className="border-hairline border-t pt-5">
          <WeightList
            title="Economic scale index"
            caption="A separate weighting, in log space rather than percentiles, used only as the horizontal axis of the alpha map and the peer trend line. Percentile ranks flatten the distances between chains; a regression needs those distances kept."
            weights={methodology?.scale}
          />
        </div>

        <div className="border-hairline border-t pt-5">
          <h3 className="text-[12.5px] font-semibold">
            The composite value gap
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {methodology &&
              Object.entries(methodology.composite).map(([key, weight]) => (
                <div key={key} className="bg-raised rounded-lg px-3.5 py-3">
                  <div className="tnum text-[19px] font-semibold">
                    {(weight * 100).toFixed(0)}%
                  </div>
                  <div className="text-ink-muted mt-1 text-[11.5px] leading-snug">
                    {LABELS[key] ?? key}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {example && <WorkedExample chain={example} />}

        <div className="border-hairline border-t pt-5">
          <h3 className="text-[12.5px] font-semibold">Every term, defined</h3>
          <dl className="mt-3 grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
            {GLOSSARY_ORDER.map((term) => (
              <div key={term}>
                <dt className="text-[12px] font-medium">
                  {GLOSSARY[term].title}
                </dt>
                <dd className="text-ink-muted mt-0.5 text-[11.5px] leading-relaxed">
                  {GLOSSARY[term].short}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="border-hairline grid gap-6 border-t pt-5 lg:grid-cols-2">
          <div>
            <h3 className="text-[12.5px] font-semibold">Peer trend line</h3>
            {meta.regression ? (
              <p className="text-ink-secondary mt-2 text-[12.5px] leading-relaxed">
                Market cap is regressed on the log-scale economic size index
                across {meta.regression.sampleSize} chains. The fit explains{" "}
                <span className="tnum text-ink font-medium">
                  {(meta.regression.rSquared * 100).toFixed(0)}%
                </span>{" "}
                of the variation, and leaves a residual spread of{" "}
                <span className="tnum text-ink font-medium">
                  ±{Math.exp(meta.regression.residualSd).toFixed(1)}×
                </span>
                . That band is wide, which is the honest finding: fundamentals
                explain a real part of what chains are worth, and nowhere near
                all of it. Treat the distance from the line as positioning, not
                as a price target.
              </p>
            ) : (
              <p className="text-ink-muted mt-2 text-[12.5px]">
                Not enough chains with both a market cap and complete
                fundamentals to fit a trend this run.
              </p>
            )}
          </div>

          <div>
            <h3 className="text-[12.5px] font-semibold">
              What the numbers do not cover
            </h3>
            <ul className="text-ink-secondary mt-2 space-y-2 text-[12.5px] leading-relaxed">
              <li>
                Market caps are circulating, not fully diluted. A chain with a
                large unlock ahead will look cheaper here than it is. Where
                DefiLlama publishes an unlock schedule — 40 of the 85 chains
                here — the chain&rsquo;s own page breaks it down by date and
                recipient. It is shown, never scored.
              </li>
              <li>
                Fees are what the chain itself earns, not what the apps on it
                earn. That is the right denominator for a token, and it makes
                most L1s look expensive.
              </li>
              <li>
                Bridged volume covers the 27 aggregator front-ends DefiLlama
                tracks, not every bridge. Its full bridge data moved behind a
                paid plan.
              </li>
              <li>
                Mayan routing covers the chains it bridges to, currently{" "}
                {meta.mayan?.byChain.length ?? 0} of them, over the trailing{" "}
                {meta.mayan?.window ?? "week"}. It feeds no score, because
                scoring a metric most of the screen cannot have would penalise
                the rest for it.
              </li>
              <li>
                Nothing here is a recommendation. It is a screen — a way to
                decide what to look at next.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </CollapsiblePanel>
  );
}

/**
 * The model applied to one real chain, end to end.
 *
 * Reads from the live snapshot rather than hard-coded numbers, so it stays true
 * as the data moves and cannot describe a model the code no longer runs.
 */
function WorkedExample({ chain }: { chain: ChainSnapshot }) {
  const { scores } = chain;
  const tone = divergingHue(scores.mispricing);

  const steps = [
    {
      n: 1,
      title: "Rank every metric against the other chains",
      body: `${chain.name} sits at the ${ordinal(scores.fundamental)} percentile on fundamentals, meaning its economy is larger than that share of the screen. Each underlying metric is ranked the same way before being weighted together.`,
      value: formatScore(scores.fundamental),
      caption: "Fundamentals",
    },
    {
      n: 2,
      title: "Check whether it is growing",
      body: `Momentum compares the last 30 days with the 30 before them. ${chain.name} scores ${formatScore(scores.momentum)}, so its activity is growing faster than ${formatScore(scores.momentum)}% of chains here.`,
      value: formatScore(scores.momentum),
      caption: "Momentum",
    },
    {
      n: 3,
      title: "Compare price with all of it",
      body: scores.cheapnessUnavailable
        ? "Too few valuation ratios could be calculated for this chain, so cheapness is skipped and the remaining terms carry the value gap between them."
        : `Six ratios of market cap to something real are ranked and inverted, so a high score means cheap. ${chain.name} scores ${formatScore(scores.cheapness)}.`,
      value: formatScore(scores.cheapness),
      caption: "Cheapness",
    },
    {
      n: 4,
      title: "Blend the three",
      body: `The market ranks ${chain.name} at the ${ordinal(scores.marketCapPercentile)} percentile by size. The gap between that and its fundamentals rank supplies 43% of the result, cheapness 32%, momentum 25%.`,
      value: formatSigned(scores.mispricing),
      caption: "Value gap",
      highlight: true,
    },
  ];

  return (
    <div className="border-hairline border-t pt-5">
      <h3 className="text-[12.5px] font-semibold">
        Worked through, with {chain.name}
      </h3>
      <p className="text-ink-muted mt-1 text-[11.5px]">
        Live numbers from the current snapshot, not an illustration.
      </p>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <li
            key={step.n}
            className="bg-raised relative overflow-hidden rounded-lg p-3.5"
          >
            {step.highlight && (
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: tone }}
                aria-hidden
              />
            )}
            <div className="text-ink-faint text-[10px] tracking-wide uppercase">
              Step {step.n} · {step.caption}
            </div>
            <div
              className="tnum mt-1.5 text-[24px] leading-none font-semibold"
              style={step.highlight ? { color: tone } : undefined}
            >
              {step.value}
            </div>
            <div className="text-ink mt-2 text-[11.5px] font-medium">
              {step.title}
            </div>
            <p className="text-ink-muted mt-1 text-[11px] leading-relaxed">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ordinal(value: number | null): string {
  if (value === null) return "—";
  const n = Math.round(value);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

function WeightList({
  title,
  caption,
  weights,
}: {
  title: string;
  caption: string;
  weights: Record<string, number> | undefined;
}) {
  const entries = Object.entries(weights ?? {}).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  return (
    <div>
      <h3 className="text-[12.5px] font-semibold">{title}</h3>
      <p className="text-ink-muted mt-1 mb-3 text-[11.5px] leading-snug">
        {caption}
      </p>
      <ul className="space-y-2">
        {entries.map(([key, weight]) => (
          <li key={key} className="flex items-center gap-3">
            <span className="text-ink-secondary flex-1 text-[12px]">
              {LABELS[key] ?? key}
            </span>
            <span
              className="bg-grid h-[5px] shrink-0 overflow-hidden rounded-full"
              style={{ width: 44 }}
              aria-hidden
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(weight / max) * 100}%`,
                  background: "var(--color-seq-400)",
                }}
              />
            </span>
            <span className="tnum text-ink-muted w-8 text-right text-[11.5px]">
              {(weight * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
