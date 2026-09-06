"use client";

import { useId } from "react";

import { cn } from "~/lib/cn";

interface SparklineProps {
  values: readonly number[];
  width?: number;
  height?: number;
  className?: string;
  /** `muted` renders the trend in ink rather than the trend hue. */
  tone?: "default" | "muted";
  "aria-label"?: string;
}

/**
 * Trailing trend for one series, no axes. A sparkline is context for the number
 * beside it, so every value it shows is also in the table row it sits in.
 *
 * Every sparkline uses the same single hue, deliberately. Colouring rising
 * green and falling red is the obvious move and the wrong one: green against
 * red measures ΔE 6.5 under protanopia, which is only legal alongside a second
 * encoding, and a bare sparkline has none. Direction is already carried by the
 * shape of the line and by the signed delta printed in the next column.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  className,
  tone = "default",
  ...rest
}: SparklineProps) {
  const gradientId = useId();

  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 3) {
    return (
      <div
        className={cn("flex items-center", className)}
        style={{ width, height }}
        aria-hidden
      >
        <span className="text-ink-faint text-[10px]">no history</span>
      </div>
    );
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = 2;

  const x = (index: number) =>
    (index / (clean.length - 1)) * (width - pad * 2) + pad;
  const y = (value: number) =>
    height - pad - ((value - min) / span) * (height - pad * 2);

  const line = clean
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`,
    )
    .join(" ");

  const area = `${line} L${x(clean.length - 1).toFixed(2)},${height} L${x(0).toFixed(2)},${height} Z`;

  const stroke =
    tone === "muted" ? "var(--color-ink-muted)" : "var(--color-series-3)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      role="img"
      {...rest}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(clean.length - 1)}
        cy={y(clean[clean.length - 1]!)}
        r="2.25"
        fill={stroke}
        stroke="var(--color-surface)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
