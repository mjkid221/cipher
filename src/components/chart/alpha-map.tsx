"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { cn } from "~/lib/cn";
import { formatSigma, formatUsd, formatUsdAxis } from "~/lib/format";
import { divergingFill, divergingHue } from "~/lib/palette";
import { useMeasure } from "./use-measure";

export interface AlphaPoint {
  slug: string;
  name: string;
  /** 0–100 log-scale index of economic size. */
  x: number;
  /** Market cap in USD. Plotted on a log axis. */
  marketCap: number;
  mispricing: number | null;
  confidence: number;
  trendResidual: number | null;
}

export interface AlphaRegression {
  slope: number;
  intercept: number;
  residualSd: number;
  rSquared: number;
  sampleSize: number;
}

const MARGIN = { top: 18, right: 22, bottom: 44, left: 62 };
const HEIGHT = 430;
/** Pointer distance, in px, within which a point is considered hovered. */
const HOVER_RADIUS = 44;

export function AlphaMap({
  points,
  regression,
  highlightSlug,
  /**
   * Market caps of the *whole* universe, used to fix the y domain.
   *
   * Without this the axis rescales every time a filter narrows the set, so
   * changing a filter reads as the chart moving rather than as points being
   * removed — and the trend line, which is fitted on every chain, would no
   * longer line up with the axis it is drawn against.
   */
  yDomain,
  className,
}: {
  points: readonly AlphaPoint[];
  regression: AlphaRegression | null;
  highlightSlug?: string;
  yDomain?: readonly number[];
  className?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);
  const clipId = useId().replace(/[^a-zA-Z0-9-]/g, "");

  const plotWidth = Math.max(320, width) - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const model = useMemo(() => {
    const usable = points.filter(
      (point) => Number.isFinite(point.x) && point.marketCap > 0,
    );
    if (usable.length === 0) return null;

    const domainSource =
      yDomain && yDomain.length > 0
        ? yDomain.filter((value) => value > 0)
        : usable.map((point) => point.marketCap);

    const logs = domainSource.map((value) => Math.log10(value));
    const yMin = Math.floor(Math.min(...logs) * 2) / 2 - 0.15;
    const yMax = Math.ceil(Math.max(...logs) * 2) / 2 + 0.15;

    const xScale = (value: number) => (value / 100) * plotWidth;
    const yScale = (log: number) =>
      plotHeight - ((log - yMin) / (yMax - yMin || 1)) * plotHeight;

    // Ticks at whole powers of ten inside the domain.
    const ticks: number[] = [];
    for (let power = Math.ceil(yMin); power <= Math.floor(yMax); power++) {
      ticks.push(power);
    }

    return { usable, yMin, yMax, xScale, yScale, ticks };
  }, [points, yDomain, plotWidth, plotHeight]);

  const positioned = useMemo(() => {
    if (!model) return [];
    return model.usable.map((point) => ({
      point,
      cx: model.xScale(point.x),
      cy: model.yScale(Math.log10(point.marketCap)),
      r: 3.5 + point.confidence * 5,
    }));
  }, [model]);

  /** Selective direct labels: the extremes at each end, plus the hovered point. */
  const labelled = useMemo(() => {
    const withResidual = positioned.filter(
      (entry) => entry.point.trendResidual !== null,
    );
    const sorted = [...withResidual].sort(
      (a, b) => (a.point.trendResidual ?? 0) - (b.point.trendResidual ?? 0),
    );
    const picks = new Set<string>();
    for (const entry of sorted.slice(0, 3)) picks.add(entry.point.slug);
    for (const entry of sorted.slice(-2)) picks.add(entry.point.slug);
    if (highlightSlug) picks.add(highlightSlug);
    return picks;
  }, [positioned, highlightSlug]);

  const trendPath = useMemo(() => {
    if (!model || !regression) return null;
    const toLog10 = (lnValue: number) => lnValue / Math.LN10;
    const at = (x: number) =>
      toLog10(regression.intercept + regression.slope * x);

    const line = `M0,${model.yScale(at(0)).toFixed(1)} L${plotWidth},${model.yScale(at(100)).toFixed(1)}`;
    const sd = toLog10(regression.residualSd);

    const upper = `M0,${model.yScale(at(0) + sd).toFixed(1)} L${plotWidth},${model.yScale(at(100) + sd).toFixed(1)}`;
    const lower = `M0,${model.yScale(at(0) - sd).toFixed(1)} L${plotWidth},${model.yScale(at(100) - sd).toFixed(1)}`;

    const band =
      `M0,${model.yScale(at(0) + sd).toFixed(1)} ` +
      `L${plotWidth},${model.yScale(at(100) + sd).toFixed(1)} ` +
      `L${plotWidth},${model.yScale(at(100) - sd).toFixed(1)} ` +
      `L0,${model.yScale(at(0) - sd).toFixed(1)} Z`;

    return { line, band, upper, lower };
  }, [model, regression, plotWidth]);

  const active = hovered ?? highlightSlug ?? null;
  // The tooltip follows the pointer only. A highlighted point gets its direct
  // label instead, so the mark it is describing never ends up underneath it.
  const tooltipEntry = positioned.find((entry) => entry.point.slug === hovered);

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;

    let best: { slug: string; distance: number } | null = null;
    for (const entry of positioned) {
      const distance = Math.hypot(entry.cx - px, entry.cy - py);
      if (!best || distance < best.distance) {
        best = { slug: entry.point.slug, distance };
      }
    }
    setHovered(best && best.distance <= HOVER_RADIUS ? best.slug : null);
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      {width > 0 && model && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Market capitalisation plotted against economic scale, with the peer trend line. The ranked table below carries the same values."
        >
          <defs>
            <clipPath id={`${clipId}-plot`}>
              <rect x={0} y={0} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* horizontal gridlines: solid hairlines, one shade off the surface */}
            {model.ticks.map((power) => (
              <g key={power}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={model.yScale(power)}
                  y2={model.yScale(power)}
                  stroke="var(--color-grid)"
                  strokeWidth={1}
                />
                <text
                  x={-12}
                  y={model.yScale(power)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="tnum"
                  fill="var(--color-ink-muted)"
                  fontSize={11}
                >
                  {formatUsdAxis(10 ** power)}
                </text>
              </g>
            ))}

            {/* x axis */}
            <line
              x1={0}
              x2={plotWidth}
              y1={plotHeight}
              y2={plotHeight}
              stroke="var(--color-axis)"
              strokeWidth={1}
            />
            {[0, 25, 50, 75, 100].map((tick) => (
              <text
                key={tick}
                x={model.xScale(tick)}
                y={plotHeight + 18}
                textAnchor="middle"
                className="tnum"
                fill="var(--color-ink-muted)"
                fontSize={11}
              >
                {tick}
              </text>
            ))}
            <text
              x={plotWidth / 2}
              y={plotHeight + 36}
              textAnchor="middle"
              fill="var(--color-ink-faint)"
              fontSize={11}
            >
              Economic scale index — fees, capital, stablecoins, volume (log)
            </text>

            {/* peer trend and its ±1σ band */}
            {trendPath && (
              <g clipPath={`url(#${clipId}-plot)`}>
                <path
                  d={trendPath.band}
                  fill="var(--color-ink)"
                  fillOpacity={0.03}
                />
                {[trendPath.upper, trendPath.lower].map((edge, index) => (
                  <path
                    key={index}
                    d={edge}
                    fill="none"
                    stroke="var(--color-grid)"
                    strokeWidth={1}
                  />
                ))}
                <path
                  d={trendPath.line}
                  fill="none"
                  stroke="var(--color-ink-faint)"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* region annotations */}
            <text
              x={plotWidth - 8}
              y={plotHeight - 10}
              textAnchor="end"
              fill="var(--color-ink-faint)"
              fontSize={10.5}
            >
              cheap for its size
            </text>
            <text x={8} y={16} fill="var(--color-ink-faint)" fontSize={10.5}>
              expensive for its size
            </text>

            {/* marks */}
            {positioned.map(({ point, cx, cy, r }) => {
              const isActive = point.slug === active;
              const dimmed = active !== null && !isActive;
              return (
                <g key={point.slug} opacity={dimmed ? 0.32 : 1}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r + 1.5}
                    fill="var(--color-surface)"
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={divergingFill(point.mispricing, 45)}
                    stroke={divergingHue(point.mispricing)}
                    strokeWidth={isActive ? 1.75 : 1}
                  />
                  {(labelled.has(point.slug) || isActive) && (
                    <text
                      x={cx + r + 5}
                      y={cy + 3.5}
                      fill={
                        isActive ? "var(--color-ink)" : "var(--color-ink-secondary)"
                      }
                      fontSize={11}
                      fontWeight={isActive ? 600 : 500}
                    >
                      {point.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* nearest-point hit layer, so an 8px dot is not a pinpoint target */}
            <rect
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        </svg>
      )}

      {/* tooltip */}
      {tooltipEntry && (
        <div
          className="panel pointer-events-none absolute z-20 min-w-[188px] px-3 py-2.5 shadow-2xl shadow-black/50"
          style={{
            left: Math.min(
              Math.max(tooltipEntry.cx + MARGIN.left - 94, 4),
              Math.max(width - 200, 4),
            ),
            top: Math.max(tooltipEntry.cy + MARGIN.top - 108, 4),
            background: "var(--color-overlay)",
          }}
        >
          <div className="text-[13px] font-semibold">{tooltipEntry.point.name}</div>
          <dl className="mt-1.5 space-y-1 text-[11.5px]">
            <Row label="Market cap" value={formatUsd(tooltipEntry.point.marketCap)} />
            <Row label="Scale index" value={tooltipEntry.point.x.toFixed(0)} />
            <Row
              label="Vs trend"
              value={formatSigma(tooltipEntry.point.trendResidual)}
              tone={
                tooltipEntry.point.trendResidual === null
                  ? undefined
                  : divergingHue(-tooltipEntry.point.trendResidual)
              }
            />
          </dl>
        </div>
      )}

      <Legend regression={regression} />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tnum font-medium" style={tone ? { color: tone } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function Legend({ regression }: { regression: AlphaRegression | null }) {
  return (
    <div className="border-hairline mt-1 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-ink-muted">Value gap</span>
        <span className="text-ink-faint">overvalued</span>
        <span
          className="h-[7px] w-24 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, var(--color-over), color-mix(in oklab, var(--color-mid) 60%, var(--color-surface)), var(--color-under))",
          }}
          aria-hidden
        />
        <span className="text-ink-faint">undervalued</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-ink-muted">Dot size</span>
        <span className="text-ink-faint">data confidence</span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="inline-block h-px w-6"
          style={{ background: "var(--color-ink-faint)" }}
          aria-hidden
        />
        <span className="text-ink-faint">
          peer trend
          {regression
            ? ` · R² ${regression.rSquared.toFixed(2)} · shaded band ±1σ`
            : " unavailable"}
        </span>
      </div>
    </div>
  );
}

/** Wraps a mark so the whole point is a link on the detail page. */
export function AlphaMapLink({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return <Link href={`/chain/${slug}`}>{children}</Link>;
}
