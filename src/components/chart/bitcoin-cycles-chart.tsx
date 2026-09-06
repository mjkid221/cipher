"use client";

import { useMemo, useState } from "react";

import { evalTopModel, type TopModel } from "~/lib/cycle-models";
import { formatMonth, formatUsdAxis } from "~/lib/format";
import { cn } from "~/lib/cn";
import { OVER, UNDER } from "~/lib/palette";
import type { RouterOutputs } from "~/trpc/react";
import {
  dailyAxis,
  LineChart,
  type PointMarker,
  type TimeRange,
} from "./line-chart";

type Detail = RouterOutputs["market"]["detail"];
type Cycles = NonNullable<Detail["cycles"]>;
type Rainbow = NonNullable<Detail["rainbow"]>;

const GENESIS_MS = Date.parse("2009-01-03");
const DAY_MS = 86_400_000;

/**
 * Bitcoin's four-year cycle: weekly price on a log scale with every cycle top
 * and bottom marked, two power-law curves through them, and the windows the
 * historical spacing implies for the next bottom and top.
 *
 * The curves are the "diminishing returns" made explicit — each is
 * `ln(price) = a + b · ln(days since genesis)`, fitted through four or five
 * points, and each top has landed a smaller multiple above the last. They are
 * extrapolations from a handful of points and are drawn dashed and labelled
 * as estimates for that reason.
 *
 * Hovering reads out above the chart rather than in a floating card: the plot
 * is dense with labelled extremes and a card over it hid the very thing being
 * pointed at.
 */
export function BitcoinCyclesChart({
  cycles,
  rainbow,
  topModel,
  height = 400,
  className,
}: {
  cycles: Cycles;
  rainbow: Rainbow;
  /** Which curve through the tops to draw; null draws none. */
  topModel: TopModel | null;
  height?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const weekly = rainbow.weekly;
    const startMs = Date.parse(weekly.start);
    // Run the axis out past the furthest estimate, so the windows are visible.
    const furthest = Math.max(
      Date.parse(cycles.nextTop?.to ?? weekly.start),
      Date.parse(cycles.nextBottom?.to ?? weekly.start),
      startMs + (weekly.price.length - 1) * weekly.stepDays * DAY_MS,
    );
    const endMs = furthest + 120 * DAY_MS;
    const count = Math.ceil((endMs - startMs) / (weekly.stepDays * DAY_MS)) + 1;
    const x = dailyAxis(weekly.start, count, weekly.stepDays);

    const price: (number | null)[] = x.map((_, i) => weekly.price[i] ?? null);
    const curve = (fit: Cycles["topFit"]) =>
      fit
        ? x.map((ms) =>
            Math.exp(fit.a + fit.b * Math.log((ms - GENESIS_MS) / DAY_MS)),
          )
        : null;

    const topLine = topModel
      ? x.map((ms) =>
          evalTopModel(topModel, (ms - GENESIS_MS) / DAY_MS, cycles.bottomFit),
        )
      : null;

    let latest = price.length - 1;
    while (latest > 0 && price[latest] == null) latest--;

    return { x, price, topLine, bottomLine: curve(cycles.bottomFit), latest };
  }, [cycles, rainbow, topModel]);

  const readIndex = hover ?? model.latest;
  const readPrice = model.price[readIndex] ?? null;
  const readTop = model.topLine?.[readIndex] ?? null;
  const readBottom = model.bottomLine?.[readIndex] ?? null;
  const fmt = (v: number) => (v < 1 ? `$${v.toFixed(2)}` : formatUsdAxis(v));

  const markers: PointMarker[] = [
    ...cycles.tops.map((t) => ({
      at: Date.parse(t.date),
      y: t.price,
      label: `${formatMonth(t.date)} · ${formatUsdAxis(t.price)}${t.provisional ? " · so far" : ""}`,
      color: OVER,
      hollow: t.provisional,
    })),
    ...cycles.bottoms.map((b) => ({
      at: Date.parse(b.date),
      y: b.price,
      label: `${formatMonth(b.date)} · ${formatUsdAxis(b.price)}${b.provisional ? " · so far" : ""}`,
      color: UNDER,
      hollow: b.provisional,
      below: true,
    })),
  ];

  const ranges: TimeRange[] = [];
  if (cycles.nextBottom) {
    ranges.push({
      from: Date.parse(cycles.nextBottom.from),
      to: Date.parse(cycles.nextBottom.to),
      label: "next bottom?",
      fill: UNDER,
    });
  }
  if (cycles.nextTop) {
    ranges.push({
      from: Date.parse(cycles.nextTop.from),
      to: Date.parse(cycles.nextTop.to),
      label: "next top?",
      fill: OVER,
    });
  }

  const series = [
    {
      id: "btc",
      label: "Bitcoin, weekly close",
      values: model.price,
      color: "var(--color-ink)",
      width: 1.5,
    },
    ...(model.topLine
      ? [
          {
            id: "tops",
            label: topModel
              ? `Tops · ${topModel.label}`
              : "Curve through the tops",
            values: model.topLine,
            color: OVER,
            width: 1.2,
            dash: "4 4",
          },
        ]
      : []),
    ...(model.bottomLine
      ? [
          {
            id: "bottoms",
            label: "Curve through the bottoms",
            values: model.bottomLine,
            color: UNDER,
            width: 1.2,
            dash: "4 4",
          },
        ]
      : []),
  ];

  return (
    <div className={className}>
      <div className="text-ink-secondary mb-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1 text-[12px]">
        <span className="text-ink-faint tnum min-w-[11ch]">
          {new Date(model.x[readIndex]!).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          {hover === null && " · latest"}
        </span>
        <Read
          label="Bitcoin"
          value={readPrice === null ? "—" : fmt(readPrice)}
        />
        {readTop !== null && (
          <Read label="Tops curve" value={fmt(readTop)} color={OVER} />
        )}
        {readBottom !== null && (
          <Read label="Bottoms curve" value={fmt(readBottom)} color={UNDER} />
        )}
        {readPrice !== null && readBottom !== null && (
          <span className="text-ink-faint tnum">
            {(readPrice / readBottom).toFixed(2)}× the bottom curve
          </span>
        )}
      </div>

      <LineChart
        x={model.x}
        series={series}
        markers={markers}
        ranges={ranges}
        events={[
          ...rainbow.halvings.map((d) => ({
            at: Date.parse(d),
            label: "Halving",
            placement: "bottom" as const,
          })),
          ...(rainbow.nextHalvingEstimate
            ? [
                {
                  at: Date.parse(rainbow.nextHalvingEstimate),
                  label: "Halving · est.",
                  placement: "bottom" as const,
                },
              ]
            : []),
        ]}
        yScale="log"
        formatY={(v) => (v < 1 ? `$${v.toFixed(2)}` : formatUsdAxis(v))}
        height={height}
        label="Bitcoin price on a log scale with every cycle top and bottom marked, power-law curves through each set, and the estimated windows for the next bottom and top"
        hoverIndex={hover}
        onHoverChange={setHover}
        tooltip={false}
      />
    </div>
  );
}

function Read({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {color && (
        <span
          className="h-[3px] w-2.5 self-center rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn(
          "tnum font-medium",
          value === "—" ? "text-ink-faint" : "text-ink",
        )}
      >
        {value}
      </span>
    </span>
  );
}
