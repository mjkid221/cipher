"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { Explain } from "~/components/ui/explain";
import { ChainAvatar, TierBadge } from "~/components/ui/primitives";
import { cn } from "~/lib/cn";
import { formatPercent, formatUsd } from "~/lib/format";
import { useCountUp, useReducedMotion } from "~/lib/motion";
import { divergingHue } from "~/lib/palette";
import type { ChainSnapshot } from "~/server/domain/types";

/**
 * The answer, stated once, at the top: the most undervalued chain.
 *
 * A single dense strip. An earlier version spent ~640px on this — five thesis
 * lines, a 372px distribution chart, a specs band, and two sidebar tiles that
 * stretched to match — for one chain and one number. The strip carries the
 * same finding in a third of the height: identity, the figure set large inside
 * its own sentence, the two strongest reasons, and the specs on one line. The
 * distribution chart moved to the chain page, where the figure it explains is
 * the subject rather than the headline.
 */

/** Thesis lines shown here. The rest are one click away. */
const MAX_THESIS = 2;

export function HeadlineCall({
  chain,
  universeSize,
  belowPar,
  id,
  className,
}: {
  chain: ChainSnapshot;
  universeSize: number;
  /** How many chains are undervalued — the count the rail used to carry. */
  belowPar: number;
  id?: string;
  className?: string;
}) {
  const gap = chain.scores.mispricing;
  const tone = divergingHue(gap);

  const reduced = useReducedMotion();
  const counted = useCountUp(gap, { enabled: !reduced });

  const magnitude = counted === null ? null : Math.abs(Math.round(counted));
  // Direction comes from the settled value, never the animating one, so the
  // wording cannot flicker as the figure climbs.
  const direction =
    gap === null || Math.round(gap) === 0
      ? "fairly valued"
      : gap > 0
        ? "undervalued"
        : "overvalued";

  const shown = chain.thesis.slice(0, MAX_THESIS);
  const hidden = chain.thesis.length - shown.length;

  return (
    <div
      id={id}
      className={cn("panel relative flex flex-col overflow-hidden", className)}
    >
      <span
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full opacity-[0.11] blur-3xl"
        style={{ background: tone }}
        aria-hidden
      />

      <div className="relative px-5 pt-4 pb-4 lg:px-6">
        {/* identity, with the way out on the right */}
        <div
          className="settle flex flex-wrap items-center gap-x-3 gap-y-2"
          style={{ "--settle-delay": "0ms" } as React.CSSProperties}
        >
          <ChainAvatar
            name={chain.name}
            logoUrl={chain.logoUrl}
            brandColor={chain.brandColor}
            size={24}
          />
          <h1 className="text-display text-[20px] leading-none">
            {chain.name}
          </h1>
          {chain.symbol && (
            <span className="text-ink-faint text-[11px] tracking-[0.1em] uppercase">
              {chain.symbol}
            </span>
          )}
          <TierBadge tier={chain.tier} />
          {chain.valueTrapRisk && (
            <span
              className="inline-flex items-center gap-1.5 text-[11.5px]"
              style={{ color: "var(--color-warning)" }}
            >
              <TriangleAlert className="size-3.5" aria-hidden />
              Value-trap shape
            </span>
          )}

          <Link
            href={`/chain/${chain.slug}`}
            aria-label={`Full breakdown of ${chain.name}${hidden > 0 ? `, including ${hidden} more reasons` : ""}`}
            className="group/cta bg-overlay text-ink border-hairline elev-1 hover:bg-raised rounded-control ml-auto inline-flex items-center gap-2 border px-3 py-1.5 text-[12px] font-medium transition-colors"
            style={{ transitionDuration: "var(--dur-micro)" }}
          >
            Full breakdown
            {hidden > 0 && (
              <span className="text-ink-muted font-normal">
                · {hidden} more
              </span>
            )}
            <ArrowRight
              className="size-3.5 transition-transform group-hover/cta:translate-x-0.5"
              aria-hidden
              style={{
                transitionDuration: "var(--dur-standard)",
                transitionTimingFunction: "var(--ease-emphasised)",
              }}
            />
          </Link>
        </div>

        {/* the finding */}
        <p
          className="settle mt-2 flex flex-wrap items-baseline gap-x-2.5"
          style={{ "--settle-delay": "60ms" } as React.CSSProperties}
        >
          <span
            className="text-figure text-[clamp(44px,3.6vw,56px)] leading-[0.9]"
            style={{
              color: tone,
              textShadow: `0 0 40px color-mix(in oklab, ${tone} 22%, transparent)`,
            }}
          >
            {magnitude ?? "—"}
          </span>
          <span className="text-display text-ink-secondary text-[17px] leading-tight">
            {magnitude === null ? "unrated" : `points ${direction}`}
          </span>
          <Explain term="valueGap" side="bottom" />
          <span className="text-ink-faint text-[12px]">
            · widest gap of {universeSize} chains reviewed, {belowPar} of them
            undervalued
          </span>
        </p>

        {/* the two strongest reasons; the rest are behind the link */}
        <ul className="mt-2.5 max-w-[80ch] space-y-1.5">
          {shown.map((line, index) => (
            <li
              key={line}
              className="settle text-ink-secondary flex gap-2.5 text-[13px] leading-snug"
              style={
                {
                  "--settle-delay": `${120 + index * 40}ms`,
                } as React.CSSProperties
              }
            >
              <span
                className="mt-1.75 size-1 shrink-0 rounded-full"
                style={{ background: tone }}
                aria-hidden
              />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <Specs chain={chain} />
    </div>
  );
}

/** Four figures on one line, hairline-separated, label and value together. */
function Specs({ chain }: { chain: ChainSnapshot }) {
  const items = [
    { label: "Market cap", value: formatUsd(chain.metrics.marketCap) },
    { label: "TVL", value: formatUsd(chain.metrics.tvl) },
    {
      label: "Chain fees 30d",
      value: formatUsd(chain.metrics.fees30d),
      note: formatPercent(chain.metrics.feesChange30d, { digits: 0 }),
      noteTone:
        (chain.metrics.feesChange30d ?? 0) >= 0
          ? "var(--color-good)"
          : "var(--color-critical)",
    },
    {
      label: "Token 30d",
      value: formatPercent(chain.metrics.priceChange30d, { digits: 0 }),
      valueTone:
        (chain.metrics.priceChange30d ?? 0) >= 0
          ? "var(--color-good)"
          : "var(--color-critical)",
    },
  ];

  return (
    <dl
      className="settle border-hairline grid grid-cols-2 border-t sm:flex sm:flex-wrap"
      style={{ "--settle-delay": "200ms" } as React.CSSProperties}
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "border-hairline flex items-baseline gap-2 px-5 py-2.5 lg:px-6",
            index % 2 === 1 && "border-l",
            index >= 2 && "border-t sm:border-t-0",
            index === 2 && "sm:border-l",
          )}
        >
          <dt className="text-ink-faint text-[10px] font-medium tracking-[0.1em] uppercase">
            {item.label}
          </dt>
          <dd
            className="tnum text-[14px] font-medium"
            style={item.valueTone ? { color: item.valueTone } : undefined}
          >
            {item.value}
            {item.note && (
              <span
                className="ml-1.5 text-[11px] font-normal"
                style={{ color: item.noteTone }}
              >
                {item.note}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
