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

import {
  ALTCOIN_SEASON_ZONES,
  FEAR_GREED_ZONES,
  zoneOf,
  type ZoneStep,
} from "~/lib/market-zones";

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
    label: "Fairly valued",
    glyph: "○",
    color: "var(--color-ink-muted)",
    description: "Fundamentals and valuation sit close to peer averages.",
  },
  rich: {
    label: "Richly valued",
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
  "no-token": {
    label: "No token",
    glyph: "◌",
    color: "var(--color-ink-muted)",
    description:
      "No native asset to price, so there is no value gap. Its fundamentals and momentum are real and ranked with everyone else's.",
  },
  unrated: {
    label: "No market data",
    glyph: "◌",
    color: "var(--color-ink-faint)",
    description:
      "Has a token, but no market cap came back for it this run, so nothing can be valued yet.",
  },
} as const;

export type TierKey = keyof typeof TIER_META;

/* ------------------------------------------------------------ rainbow ---- */

export const RAINBOW_BAND_COUNT = 9;

/**
 * Fill for rainbow band `index` (0 = cheapest, 8 = most expensive).
 *
 * This is the one place the app paints an ordered scale in many hues, and it
 * does so on purpose: the spectrum *is* the rainbow chart. A first version
 * used the screen's blue-to-red pair mixed toward neutral, and it read as two
 * dim tints, not nine bands. The classic order is kept — cool for cheap, warm
 * for expensive, so the two poles still agree with the rest of the screen —
 * and every band is named at the chart's edge and in the tooltip, so the
 * reading never rests on hue alone (adjacent greens and yellows are the pairs
 * colour-vision deficiency merges).
 *
 * Hues are set in OKLCH so they sit at a similar perceived lightness on the
 * dark surface; the yellow is lifted, as yellow must be to stay yellow.
 */
const RAINBOW_HUES: readonly string[] = [
  "oklch(0.62 0.2 278)", // Basically a fire sale — violet
  "oklch(0.66 0.19 255)", // BUY! — blue
  "oklch(0.74 0.14 220)", // Accumulate — cyan
  "oklch(0.76 0.15 172)", // Still cheap — teal
  "oklch(0.78 0.18 138)", // HODL! — green
  "oklch(0.86 0.17 95)", // Is this a bubble? — yellow
  "oklch(0.76 0.17 62)", // FOMO intensifies — orange
  "oklch(0.67 0.2 36)", // Sell. Seriously, sell! — red-orange
  "oklch(0.58 0.21 22)", // Maximum bubble territory — red
];

export function rainbowBandFill(index: number): string {
  return (
    RAINBOW_HUES[Math.max(0, Math.min(RAINBOW_HUES.length - 1, index))] ??
    NEUTRAL
  );
}

/* -------------------------------------------------------- index zones ---- */

/**
 * Stroke for a line painted by a second variable's zone. The neutral zone is
 * the muted ink rather than the neutral chart grey, so a line that spends most
 * of its time there stays legible on the surface and only the zones carry hue.
 * The inner steps are the pole mixed toward that ink, so each arm is one hue
 * moving toward saturation.
 */
export function zoneStroke(step: ZoneStep): string {
  if (step === 0) return "var(--color-ink-muted)";
  const pole = step < 0 ? UNDER : OVER;
  return Math.abs(step) === 2
    ? pole
    : `color-mix(in oklab, ${pole} 58%, var(--color-ink-muted))`;
}

/** Stroke for a Fear & Greed value; null where the index has no value. */
export function fearGreedStroke(value: number | null): string | null {
  return value === null
    ? null
    : zoneStroke(zoneOf(FEAR_GREED_ZONES, value).step);
}

/** Stroke for an altcoin season value; null where too few coins were priced. */
export function altcoinSeasonStroke(value: number | null): string | null {
  return value === null
    ? null
    : zoneStroke(zoneOf(ALTCOIN_SEASON_ZONES, value).step);
}
