/**
 * Data-encoding colour helpers.
 *
 * These wrap the validated tokens from `globals.css`. Two rules hold everywhere
 * in this app:
 *
 *   1. A chain's brand colour never encodes a value. It appears on the avatar
 *      ring and the logo, where it carries identity, not magnitude.
 *   2. Magnitude within an arm of the diverging scale is expressed by mixing the
 *      pole hue toward the chart surface in OKLab. That keeps each arm a single
 *      hue moving light-to-dark, and keeps the midpoint neutral.
 */

export const SURFACE = "var(--color-surface)";
export const UNDER = "var(--color-under)";
export const OVER = "var(--color-over)";
export const NEUTRAL = "var(--color-mid)";

export const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The pole hue for a signed score. Zero and null read neutral. */
export function divergingHue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NEUTRAL;
  }
  if (value > 0) return UNDER;
  if (value < 0) return OVER;
  return NEUTRAL;
}

/**
 * Fill for a signed score, mixed toward the surface by magnitude.
 * `domain` is the value at which the arm reaches full saturation.
 */
export function divergingFill(
  value: number | null | undefined,
  domain = 60,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return `color-mix(in oklab, ${NEUTRAL} 55%, ${SURFACE})`;
  }
  const strength = 28 + clamp01(Math.abs(value) / domain) * 72;
  return `color-mix(in oklab, ${divergingHue(value)} ${strength.toFixed(1)}%, ${SURFACE})`;
}

/** Sequential blue for a 0–100 percentile. One hue, light to dark. */
export function sequentialFill(percentile: number | null | undefined): string {
  if (
    percentile === null ||
    percentile === undefined ||
    !Number.isFinite(percentile)
  ) {
    return `color-mix(in oklab, ${NEUTRAL} 40%, ${SURFACE})`;
  }
  const strength = 30 + clamp01(percentile / 100) * 70;
  return `color-mix(in oklab, var(--color-seq-400) ${strength.toFixed(1)}%, ${SURFACE})`;
}

/** Status token for a growth rate. Always paired with a glyph or label. */
export function deltaTone(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { color: "var(--color-ink-muted)", glyph: "" } as const;
  }
  if (value > 0.5) return { color: "var(--color-good)", glyph: "▲" } as const;
  if (value < -0.5) {
    return { color: "var(--color-critical)", glyph: "▼" } as const;
  }
  return { color: "var(--color-ink-muted)", glyph: "—" } as const;
}

export const TIER_META = {
  "deep-value": {
    label: "Deep value",
    glyph: "◉",
    color: "var(--color-under)",
    description:
      "Large gap between fundamentals and price, on data complete enough to act on.",
  },
  undervalued: {
    label: "Undervalued",
    glyph: "●",
    color: "var(--color-under)",
    description: "Priced below what its activity supports, versus peers.",
  },
  fair: {
    label: "Fair",
    glyph: "○",
    color: "var(--color-ink-muted)",
    description: "Fundamentals and valuation sit close to peer averages.",
  },
  rich: {
    label: "Rich",
    glyph: "●",
    color: "var(--color-over)",
    description: "Priced above what its current activity supports.",
  },
  overvalued: {
    label: "Overvalued",
    glyph: "◉",
    color: "var(--color-over)",
    description: "Large premium to peers on every valuation ratio.",
  },
  unrated: {
    label: "Unrated",
    glyph: "◌",
    color: "var(--color-ink-faint)",
    description:
      "No liquid native asset, or too few valuation ratios to score honestly.",
  },
} as const;

export type TierKey = keyof typeof TIER_META;
