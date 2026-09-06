"use client";

import {
  rainbowBandFill,
  RAINBOW_BAND_COUNT,
  sequentialFill,
} from "~/lib/palette";

/**
 * Two micro-visuals for the indicator rail.
 *
 * `Gauge` is a linear 0–100 track, not an arc: at tile scale an arc wastes half
 * its height on empty space and its needle is a few pixels long. A track with
 * quartile ticks reads the same "where on the scale" at a glance and lines up
 * with the sparklines beside it.
 *
 * In `marker` mode the fill is neutral and an ink tick shows the value. That is
 * deliberate for Fear & Greed and Altcoin Season: colouring "fear" blue would
 * assert a buy signal in the hue this app reserves for "fundamentals say
 * cheap", and the index makes no such claim. The word beside the tile carries
 * the meaning. `fill` mode paints progress in the sequential blue, for the one
 * gauge that genuinely is progress — the halving cycle.
 */
export function Gauge({
  value,
  min = 0,
  max = 100,
  width = 64,
  mode = "marker",
  label,
}: {
  value: number | null;
  min?: number;
  max?: number;
  width?: number;
  mode?: "marker" | "fill";
  label: string;
}) {
  const height = 10;
  const pct =
    value === null
      ? null
      : Math.max(0, Math.min(1, (value - min) / (max - min || 1)));

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={
        value === null
          ? `${label}: unavailable`
          : `${label}: ${Math.round(value)} of ${max}`
      }
      className="shrink-0"
    >
      <rect
        x={0}
        y={2}
        width={width}
        height={6}
        rx={3}
        fill="var(--color-grid)"
      />
      {[0.25, 0.5, 0.75].map((q) => (
        <line
          key={q}
          x1={q * width}
          x2={q * width}
          y1={2}
          y2={8}
          stroke="var(--color-axis)"
          strokeWidth={1}
        />
      ))}
      {pct !== null && mode === "fill" && (
        <rect
          x={0}
          y={2}
          width={Math.max(3, pct * width)}
          height={6}
          rx={3}
          fill={sequentialFill(pct * 100)}
        />
      )}
      {pct !== null && mode === "marker" && (
        <rect
          x={Math.max(0, Math.min(width - 2, pct * width - 1))}
          y={0}
          width={2}
          height={height}
          rx={1}
          fill="var(--color-ink-secondary)"
        />
      )}
    </svg>
  );
}

/** Nine ordered bands, one lit. The rainbow ramp by construction. */
export function BandStrip({
  index,
  count = RAINBOW_BAND_COUNT,
  width = 64,
  height = 8,
  label,
}: {
  index: number | null;
  count?: number;
  width?: number;
  height?: number;
  label: string;
}) {
  const gap = 2;
  const segment = (width - gap * (count - 1)) / count;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={
        index === null
          ? `${label}: unavailable`
          : `${label}: band ${index + 1} of ${count}`
      }
      className="shrink-0"
    >
      {Array.from({ length: count }, (_, i) => {
        const active = i === index;
        return (
          <rect
            key={i}
            x={i * (segment + gap)}
            y={active ? 0 : 1.5}
            width={segment}
            height={active ? height : height - 3}
            rx={1.5}
            fill={rainbowBandFill(i)}
            opacity={index === null ? 0.35 : active ? 1 : 0.4}
            stroke={active ? "var(--color-surface)" : "none"}
            strokeWidth={active ? 1 : 0}
          />
        );
      })}
    </svg>
  );
}
