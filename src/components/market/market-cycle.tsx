"use client";

import { useMemo, useState } from "react";

import { dailyAxis, LineChart } from "~/components/chart/line-chart";
import { Explain } from "~/components/ui/explain";
import { Panel } from "~/components/ui/primitives";
import { Segmented } from "~/components/ui/segmented";
import { cn } from "~/lib/cn";
import {
  formatAxisDate,
  formatMonth,
  formatUsd,
  formatUsdAxis,
} from "~/lib/format";
import {
  ALTCOIN_SEASON_ZONES,
  FEAR_GREED_ZONES,
  zoneOf,
  type IndexZone,
} from "~/lib/market-zones";
import {
  altcoinSeasonStroke,
  fearGreedStroke,
  zoneStroke,
} from "~/lib/palette";
import type { RouterOutputs } from "~/trpc/react";

type Cycle = RouterOutputs["market"]["cycle"];
type Range = "1y" | "2y" | "4y" | "all";

const RANGE_DAYS: Record<Range, number | null> = {
  "1y": 365,
  "2y": 730,
  "4y": 1461,
  all: null,
};
const DAY_MS = 86_400_000;
/** Stroke for the altcoin line on days too few coins were compared. */
const UNCOVERED = "var(--color-ink-faint)";

/**
 * The market cycle in two panels: Bitcoin's price painted by Fear & Greed, and
 * the altcoin market cap painted by the altcoin season index. Since 2018, one
 * time axis, one crosshair.
 *
 * ## Why colour, not a second axis
 *
 * The question is "what was sentiment doing when price did this", and the
 * honest way to put both in one panel is to let the second variable ride on
 * the first as colour: each panel keeps a single y-axis, and a stretch of red
 * near a peak or blue near a trough is read directly off the line. A chart
 * with two y-scales can be made to say anything by choosing where the scales
 * meet, which is why it is not done here.
 *
 * The colours are the app's diverging pair — fear and Bitcoin season cool,
 * greed and altcoin season warm — describing the index, not issuing a signal.
 * Every zone is named in a legend under each panel and in the readout, so the
 * reading is never colour alone.
 */
export function MarketCycle({
  cycle,
  isLoading,
  isError,
  id,
  className,
}: {
  cycle: Cycle | undefined;
  isLoading: boolean;
  isError: boolean;
  id?: string;
  className?: string;
}) {
  const [range, setRange] = useState<Range>("4y");
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    if (!cycle) return null;
    const want = RANGE_DAYS[range];
    const days = want === null ? cycle.days : Math.min(want, cycle.days);
    const from = cycle.days - days;
    const slice = <T,>(s: readonly T[]) => s.slice(from);
    const start = new Date(Date.parse(cycle.start) + from * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const fearGreed = slice(cycle.fearGreed);
    const altcoinSeason = slice(cycle.altcoinSeason);
    const btcPrice = slice(cycle.btcPriceUsd);

    // The readout defaults to the newest day with a price.
    let latest = days - 1;
    while (latest > 0 && btcPrice[latest] == null) latest--;

    return {
      x: dailyAxis(start, days),
      days,
      latest,
      fearGreed,
      altcoinSeason,
      coverage: slice(cycle.altcoinCoverage),
      btcPrice,
      altCap: slice(cycle.altMarketCapUsd),
      btcColors: fearGreed.map((v) => fearGreedStroke(v)),
      altColors: altcoinSeason.map((v) => altcoinSeasonStroke(v) ?? UNCOVERED),
      halvings: cycle.halvings.map((d) => Date.parse(d)),
    };
  }, [cycle, range]);

  const at = (
    series: readonly (number | null)[] | undefined,
    i: number | null,
  ) => (i === null || !series ? null : (series[i] ?? null));
  const readIndex = hover ?? view?.latest ?? null;

  const fng = at(view?.fearGreed, readIndex);
  const season = at(view?.altcoinSeason, readIndex);
  const coverage = at(view?.coverage, readIndex);

  return (
    <section id={id} className="scroll-mt-2">
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            The market cycle
            <Explain term="marketCycle" side="bottom" />
          </span>
        }
        subtitle="Bitcoin's price coloured by Fear & Greed; the altcoin market cap coloured by the altcoin season index. One time axis, one crosshair, since 2018."
        actions={
          <Segmented<Range>
            label="Range"
            size="compact"
            value={range}
            onChange={setRange}
            options={[
              { value: "1y", label: "1 year" },
              { value: "2y", label: "2 years" },
              { value: "4y", label: "4 years" },
              { value: "all", label: "Since 2018" },
            ]}
          />
        }
        className={className}
        bodyClassName="px-4 pt-3 pb-4"
      >
        {!view ? (
          <div className="text-ink-muted grid h-[520px] place-items-center text-[12.5px]">
            {isError
              ? "The market cycle could not be loaded."
              : isLoading
                ? "Loading the market cycle…"
                : "No data."}
          </div>
        ) : (
          <div>
            {/* one readout for the hovered day, across both panels */}
            <div className="text-ink-secondary mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 px-1 text-[12px]">
              <span className="text-ink-faint tnum min-w-[7ch]">
                {readIndex === null
                  ? ""
                  : formatAxisDate(view.x[readIndex]!, "days")}
                {hover === null && (
                  <span className="text-ink-faint"> · latest</span>
                )}
              </span>
              <Read
                label="Bitcoin"
                value={formatUsd(at(view.btcPrice, readIndex))}
              />
              <Read
                label="Fear & Greed"
                value={fng === null ? "—" : fng.toFixed(0)}
                zone={fng === null ? null : zoneOf(FEAR_GREED_ZONES, fng)}
              />
              <Read
                label="Altcoins"
                value={formatUsd(at(view.altCap, readIndex))}
                note={coverage === null ? null : `${coverage} coins`}
              />
              <Read
                label="Altcoin season"
                value={season === null ? "—" : season.toFixed(0)}
                zone={
                  season === null ? null : zoneOf(ALTCOIN_SEASON_ZONES, season)
                }
                note={
                  season === null && coverage !== null ? "too few coins" : null
                }
              />
            </div>

            <Strip
              label="Bitcoin"
              legendTitle="Fear & Greed"
              zones={FEAR_GREED_ZONES}
            >
              <LineChart
                x={view.x}
                series={[
                  {
                    id: "btc",
                    label: "Bitcoin",
                    values: view.btcPrice,
                    color: "var(--color-ink-secondary)",
                    colors: view.btcColors,
                    width: 1.6,
                  },
                ]}
                events={view.halvings.map((at) => ({
                  at,
                  label: "Halving",
                  placement: "bottom" as const,
                }))}
                yScale="log"
                formatY={formatUsdAxis}
                height={240}
                label="Bitcoin price on a log scale, each day coloured by its Fear & Greed zone"
                hoverIndex={hover}
                onHoverChange={setHover}
                tooltip={false}
                xAxis={false}
              />
            </Strip>

            <Strip
              label="Altcoins · today's top 100, without Bitcoin"
              legendTitle="Altcoin season index"
              zones={ALTCOIN_SEASON_ZONES}
              extra={{
                color: UNCOVERED,
                label: "fewer than 40 coins compared",
              }}
            >
              <LineChart
                x={view.x}
                series={[
                  {
                    id: "alt",
                    label: "Altcoin market cap",
                    values: view.altCap,
                    color: UNCOVERED,
                    colors: view.altColors,
                    width: 1.6,
                  },
                ]}
                yScale="log"
                formatY={formatUsdAxis}
                height={240}
                label="Market cap of the top-100 altcoins on a log scale, each day coloured by its altcoin season zone"
                hoverIndex={hover}
                onHoverChange={setHover}
                tooltip={false}
              />
            </Strip>

            <p className="text-ink-faint mt-3 px-1 text-[11px] leading-relaxed">
              {cycle?.marketCapNote}
              {cycle?.dailyFrom
                ? ` Altcoin prices are daily from ${formatMonth(cycle.dailyFrom)} and weekly, carried forward, before that.`
                : ""}
              {cycle?.method
                ? ` Today the index compares ${cycle.method.sampleSize} coins; ${cycle.method.excluded} of the top 100 were removed as pegs, wrapped tokens or funds.`
                : ""}
            </p>
          </div>
        )}
      </Panel>
    </section>
  );
}

function Strip({
  label,
  legendTitle,
  zones,
  extra,
  children,
}: {
  label: string;
  legendTitle: string;
  zones: readonly IndexZone[];
  extra?: { color: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="border-hairline mt-2 border-t pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <div className="text-ink-faint text-[10px] font-medium tracking-[0.1em] uppercase">
          {label}
        </div>
        <div className="text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
          <span className="text-ink-faint">{legendTitle}</span>
          {zones.map((zone) => (
            <span key={zone.label} className="inline-flex items-center gap-1.5">
              <span
                className="h-[3px] w-3 rounded-full"
                style={{ backgroundColor: zoneStroke(zone.step) }}
                aria-hidden
              />
              {zone.label}
            </span>
          ))}
          {extra && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-[3px] w-3 rounded-full"
                style={{ backgroundColor: extra.color }}
                aria-hidden
              />
              {extra.label}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Read({
  label,
  value,
  zone,
  note,
}: {
  label: string;
  value: string;
  /** The zone the value sits in; drawn as its swatch and name. */
  zone?: IndexZone | null;
  note?: string | null;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn(
          "tnum font-medium",
          value === "—" ? "text-ink-faint" : "text-ink",
        )}
      >
        {value}
      </span>
      {zone && (
        <span className="text-ink-secondary inline-flex items-baseline gap-1.5">
          {/* the swatch centres itself so the label's baseline, not the swatch's bottom edge, aligns with the value */}
          <span
            className="h-[3px] w-2.5 self-center rounded-full"
            style={{ backgroundColor: zoneStroke(zone.step) }}
            aria-hidden
          />
          {zone.label}
        </span>
      )}
      {note && <span className="text-ink-faint">· {note}</span>}
    </span>
  );
}
