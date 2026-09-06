"use client";

import { useMemo } from "react";

import { formatUsdAxis } from "~/lib/format";
import { rainbowBandFill } from "~/lib/palette";
import {
  dailyAxis,
  LineChart,
  type BandFill,
  type PointMarker,
} from "./line-chart";

/**
 * The Bitcoin rainbow chart: weekly price on a log scale inside nine bands
 * around a long-run regression, with halvings marked.
 *
 * The server ships the centre line and ten multipliers; band k runs from
 * `centre × multipliers[k]` to `centre × multipliers[k + 1]`. All nine bands
 * are finite and the same width in log terms, placed so the price has been
 * inside the rainbow on 99% of days since 2010 — it leaves only at the 2011
 * and 2013 blow-offs and in the first weeks of trading, which is what the
 * classic chart shows too.
 *
 * The bands are painted in the classic spectrum (see `rainbowBandFill`),
 * with a hairline along each edge so they read as bands rather than a wash,
 * and the band the price sits in today is brighter. The newest weekly close
 * is dotted and labelled so "where are we" needs no hunting.
 *
 * At the right edge the bands are a dozen pixels tall, so the edge labels can
 * only name the bands that fit; the legend under the chart names all nine, in
 * the strip's order, cheap to expensive.
 */
export function RainbowChart({
  weekly,
  multipliers,
  labels,
  currentBand,
  halvings,
  height = 420,
  className,
}: {
  weekly: {
    start: string;
    stepDays: number;
    price: readonly number[];
    centre: readonly number[];
  };
  multipliers: readonly number[];
  labels: readonly string[];
  currentBand: number | null;
  halvings: readonly string[];
  height?: number;
  className?: string;
}) {
  const x = useMemo(
    () => dailyAxis(weekly.start, weekly.price.length, weekly.stepDays),
    [weekly.start, weekly.price.length, weekly.stepDays],
  );

  const bands = useMemo<BandFill[]>(() => {
    const edge = (k: number) =>
      weekly.centre.map((c) => c * (multipliers[k] ?? 1));
    const count = multipliers.length - 1;
    return Array.from({ length: count }, (_, i) => ({
      id: `band-${i}`,
      label: labels[i],
      lower: edge(i),
      upper: edge(i + 1),
      fill: rainbowBandFill(i),
      opacity: i === currentBand ? 0.5 : 0.3,
      stroke: rainbowBandFill(i),
      strokeOpacity: 0.7,
    }));
  }, [weekly.centre, multipliers, labels, currentBand]);

  const today = useMemo<PointMarker[]>(() => {
    let i = weekly.price.length - 1;
    while (i > 0 && !Number.isFinite(weekly.price[i])) i--;
    const price = weekly.price[i];
    const at = x[i];
    return price === undefined || at === undefined
      ? []
      : [
          {
            at,
            y: price,
            label: "today",
            color: "var(--color-ink)",
            below: true,
            align: "end" as const,
          },
        ];
  }, [weekly.price, x]);

  return (
    <div className={className}>
      <LineChart
        x={x}
        series={[
          {
            id: "btc",
            label: "Bitcoin, weekly close",
            values: weekly.price,
            color: "var(--color-ink)",
            width: 1.5,
          },
        ]}
        bands={bands}
        markers={today}
        events={halvings.map((date) => ({
          at: Date.parse(date),
          label: "Halving",
          placement: "bottom" as const,
        }))}
        yScale="log"
        // Sub-dollar ticks: the axis starts near 8¢ in 2010, and "$0" is not a price.
        formatY={(v) => (v < 1 ? `$${v.toFixed(2)}` : formatUsdAxis(v))}
        height={height}
        label="Bitcoin price since 2010 on a log scale, inside nine rainbow bands around its long-run trend, with halvings marked"
        rightGutter={128}
      />
      <ul
        className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px]"
        aria-label="Rainbow bands, cheapest to most expensive"
      >
        {labels.map((text, i) => {
          const current = i === currentBand;
          return (
            <li
              key={text}
              className={
                current
                  ? "text-ink inline-flex items-baseline gap-1.5 font-medium"
                  : "text-ink-muted inline-flex items-baseline gap-1.5"
              }
            >
              <span
                className="h-2 w-3 self-center rounded-[2px]"
                style={{
                  backgroundColor: rainbowBandFill(i),
                  opacity: current ? 1 : 0.75,
                }}
                aria-hidden
              />
              {text}
              {current && <span className="text-ink-faint"> · now</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
