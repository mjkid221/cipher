"use client";

import { cn } from "~/lib/cn";
import { formatScore, formatSigned } from "~/lib/format";
import { divergingFill, divergingHue, sequentialFill } from "~/lib/palette";

/**
 * A 0–100 percentile as a thin sequential bar. Magnitude is one hue moving
 * light-to-dark; the number is always printed beside it so the bar is never the
 * only way to read the value.
 */
export function PercentileBar({
  value,
  label,
  className,
  width = 56,
}: {
  value: number | null;
  label?: string;
  className?: string;
  width?: number;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="bg-grid relative h-[6px] shrink-0 overflow-hidden rounded-full"
        style={{ width }}
        role="img"
        aria-label={
          label ?? `${value === null ? "no data" : `${pct.toFixed(0)} of 100`}`
        }
      >
        {value !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: sequentialFill(value) }}
          />
        )}
      </div>
      <span className="tnum text-ink-secondary w-[22px] text-right text-[12px]">
        {formatScore(value)}
      </span>
    </div>
  );
}

/**
 * A signed score as a diverging bar centred on zero: undervalued grows right in
 * blue, overvalued grows left in red, with a neutral midline. The sign is also
 * printed, so hue is never carrying the meaning alone.
 */
export function DivergingBar({
  value,
  domain = 60,
  width = 92,
  className,
}: {
  value: number | null;
  domain?: number;
  width?: number;
  className?: string;
}) {
  const half = width / 2;
  const magnitude =
    value === null ? 0 : Math.min(1, Math.abs(value) / domain) * half;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative shrink-0" style={{ width, height: 18 }}>
        {/* neutral midline */}
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: half, background: "var(--color-axis)" }}
        />
        {value !== null && magnitude > 0 && (
          <div
            className="absolute top-1/2 h-[7px] -translate-y-1/2"
            style={{
              // 2px gap either side of the midline keeps the two arms separate
              // without drawing a border around the mark.
              left: value >= 0 ? half + 2 : half - magnitude,
              width: Math.max(2, magnitude - 2),
              background: divergingFill(value, domain),
              borderRadius: value >= 0 ? "2px 4px 4px 2px" : "4px 2px 2px 4px",
            }}
          />
        )}
      </div>
      <span
        className="tnum w-[34px] text-right text-[13px] font-medium"
        style={{ color: value === null ? "var(--color-ink-muted)" : divergingHue(value) }}
      >
        {formatSigned(value)}
      </span>
    </div>
  );
}

/** A single ratio against a peer reference, as a meter on the same ramp. */
export function RatioMeter({
  value,
  reference,
  className,
}: {
  value: number | null;
  reference: number | null;
  className?: string;
}) {
  // The value itself is printed above this meter; a second em dash there would
  // just be noise.
  if (value === null || reference === null || reference <= 0) return null;

  // Ratios are log-distributed; a linear meter would pin almost everything left.
  const relative = Math.log10(value / reference);
  const clamped = Math.max(-1, Math.min(1, relative));
  const cheaper = clamped < 0;
  const magnitude = Math.abs(clamped) * 50;

  return (
    <div className={cn("relative h-[6px] w-full min-w-[64px]", className)}>
      <div className="bg-grid absolute inset-0 rounded-full" />
      <div
        className="absolute inset-y-0 w-px"
        style={{ left: "50%", background: "var(--color-axis)" }}
      />
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          left: cheaper ? `${50 - magnitude}%` : "calc(50% + 1px)",
          width: `${Math.max(1.5, magnitude - 0.5)}%`,
          background: cheaper ? "var(--color-under)" : "var(--color-over)",
          opacity: 0.32 + Math.abs(clamped) * 0.68,
        }}
      />
    </div>
  );
}
