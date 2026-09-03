"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "~/lib/cn";
import { formatUsd } from "~/lib/format";
import type { AggregateMeta } from "~/server/domain/types";
import type { RouterOutputs } from "~/trpc/react";

type Methodology = RouterOutputs["chains"]["methodology"];

const LABELS: Record<string, string> = {
  fees30d: "Chain fees, 30d",
  revenue30d: "Chain revenue, 30d",
  tvl: "Total value locked",
  stablecoins: "Stablecoin float",
  dexVolume30d: "DEX volume, 30d",
  dau: "Daily active addresses",
  protocols: "Protocols deployed",
  feesChange30d: "Fee growth, 30d vs prior 30d",
  tvlChange30d: "TVL growth, 30d",
  dexVolumeChange30d: "DEX volume growth, 30d",
  dauChange30d: "Active address growth, 30d",
  bridgeNetUsd: "Net cross-chain inflow, 24h",
  mcapToFees: "Market cap ÷ annualised fees",
  mcapToTvl: "Market cap ÷ TVL",
  mcapToRevenue: "Market cap ÷ annualised revenue",
  mcapToStablecoins: "Market cap ÷ stablecoin float",
  mcapToDexVolume: "Market cap ÷ annualised DEX volume",
  rankGap: "Fundamental rank − market-cap rank",
  cheapness: "Valuation multiples, inverted",
  momentum: "Growth of the underlying activity",
};

export function MethodologyPanel({
  methodology,
  meta,
}: {
  methodology: Methodology | undefined;
  meta: AggregateMeta;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-raised flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
      >
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">
            How the score is built
          </h2>
          <p className="text-ink-muted mt-1 text-[12.5px]">
            Every weight below is read from the scoring code at request time, so
            this panel cannot drift from the model.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "text-ink-muted size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-hairline space-y-6 border-t px-5 py-5">
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
              caption="Valuation ratios, inverted so that high means cheap. At least two must be present or the chain is left unrated."
              weights={methodology?.cheapness}
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
                  large unlock ahead will look cheaper here than it is.
                </li>
                <li>
                  Fees are what the chain itself earns, not what the apps on it
                  earn. That is the right denominator for a token, and it makes
                  most L1s look expensive.
                </li>
                <li>
                  Cross-chain flow is estimated from a recent sample of Mayan
                  swaps
                  {meta.mayan?.sampleWindowHours
                    ? ` spanning about ${meta.mayan.sampleWindowHours.toFixed(1)} hours`
                    : ""}
                  , allocated against a reported 24h volume of{" "}
                  {formatUsd(meta.mayan?.volume24h ?? null)}. It covers the dozen
                  chains Mayan routes to, not all of them.
                </li>
                <li>
                  Nothing here is a recommendation. It is a screen — a way to
                  decide what to look at next.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
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
