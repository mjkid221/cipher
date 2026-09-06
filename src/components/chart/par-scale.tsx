"use client";

import { formatSigned } from "~/lib/format";
import { divergingHue } from "~/lib/palette";

/**
 * Where one chain sits on the value scale, against every other rated chain.
 *
 * ## The question this exists to answer
 *
 * A headline of "55 points undervalued" means nothing on its own. Fifty-five out
 * of a hundred *sounds* large, but whether it is remarkable depends entirely on
 * the spread of the field — if half the universe were past forty it would be
 * ordinary. So the hero states the figure and this states the distribution:
 * every rated chain as a tick, the subject as a labelled marker.
 *
 * ## Why it is vertical
 *
 * Because then the words are the geometry. Fair value is a line across the middle, and
 * undervalued chains are drawn *below* it, so the label cannot be
 * misread and no axis legend is needed. It also matches the alpha map elsewhere
 * on the page, where the points under the trend line are the underpriced ones —
 * one mental model for the whole screen.
 */

const WIDTH = 200;
const HEIGHT = 372;
const PAD = 24;

/**
 * Where the spine sits, and how far the marks reach from it.
 *
 * The ticks were originally 36 units wide in a 200-unit frame, which rendered
 * as a thin column of dashes rather than a field. They now use most of the
 * width, which is what makes the density of the distribution legible.
 */
const SPINE = 30;
const TICK_END = 108;
const MARKER_END = 126;

/**
 * The scale is clamped here rather than at ±100. Scores past seventy do not
 * occur in practice, and drawing to the full range would squeeze the entire
 * field into the middle third of the chart.
 */
const DOMAIN = 70;

export function ParScale({
  value,
  peers,
  className,
}: {
  value: number | null;
  /** Every rated chain's score, this one included. */
  peers: readonly number[];
  className?: string;
}) {
  if (value === null || peers.length < 4) return null;

  const tone = divergingHue(value);
  const inner = HEIGHT - PAD * 2;

  /**
   * Score to y. Positive scores mean undervalued, so they map *downward* — that
   * inversion is the point of the chart, not an oversight.
   */
  const y = (score: number) => {
    const clamped = Math.max(-DOMAIN, Math.min(DOMAIN, score));
    return PAD + ((clamped + DOMAIN) / (DOMAIN * 2)) * inner;
  };

  const parY = y(0);
  const markerY = y(value);
  const further = peers.filter((score) => score > value).length;

  return (
    <figure className={className}>
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${formatSigned(value)} on the value scale. ${further} of ${peers.length} rated chains are more undervalued.`}
      >
        {/* the spine: the full extent of the scale */}
        <line
          x1={SPINE}
          x2={SPINE}
          y1={PAD}
          y2={HEIGHT - PAD}
          stroke="var(--color-grid)"
          strokeWidth={1}
        />

        {/* the field, one tick per rated chain */}
        {peers.map((score, index) => {
          if (score === value) return null;
          const ty = y(score);
          return (
            <line
              key={`${score}-${index}`}
              x1={SPINE + 1}
              x2={TICK_END}
              y1={ty}
              y2={ty}
              stroke="var(--color-axis)"
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.75}
            />
          );
        })}

        {/* fair value: the only labelled reference on the chart */}
        <line
          x1={SPINE - 12}
          x2={MARKER_END + 44}
          y1={parY}
          y2={parY}
          stroke="var(--color-ink-faint)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <text
          x={SPINE - 12}
          y={parY - 8}
          fill="var(--color-ink-muted)"
          fontSize={9.5}
          fontWeight={500}
          letterSpacing="0.14em"
        >
          FAIR
        </text>

        {/* the two directions, stated where they happen */}
        <text
          x={SPINE - 12}
          y={PAD + 4}
          fill="var(--color-ink-faint)"
          fontSize={9.5}
          letterSpacing="0.1em"
        >
          ABOVE
        </text>
        <text
          x={SPINE - 12}
          y={HEIGHT - PAD + 4}
          fill="var(--color-ink-faint)"
          fontSize={9.5}
          letterSpacing="0.1em"
        >
          BELOW
        </text>

        {/* the subject */}
        <line
          x1={SPINE + 1}
          x2={MARKER_END}
          y1={markerY}
          y2={markerY}
          stroke={tone}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle
          cx={SPINE}
          cy={markerY}
          r={4.5}
          fill={tone}
          stroke="var(--color-surface)"
          strokeWidth={2}
        />
        <text
          x={MARKER_END + 7}
          y={markerY + 4.5}
          fill={tone}
          fontSize={13}
          fontWeight={600}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatSigned(value)}
        </text>
      </svg>

      <figcaption className="text-ink-faint mt-3 text-[11.5px] leading-relaxed">
        Every rated chain on the value scale.{" "}
        <span className="text-ink-secondary">
          {further === 0
            ? "None sit further from fair value."
            : `${further} of ${peers.length} sit further below.`}
        </span>
      </figcaption>
    </figure>
  );
}
