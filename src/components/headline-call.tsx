"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { ChainAvatar, TierBadge } from "~/components/ui/primitives";
import {
  formatPercent,
  formatSigned,
  formatUsd,
} from "~/lib/format";
import { divergingHue } from "~/lib/palette";
import type { ChainSnapshot } from "~/server/domain/types";

/**
 * The answer, stated once, at the top: the chain with the widest gap between
 * what it earns and what it costs, among those with data solid enough to act on.
 *
 * A hero figure rather than a chart — this is one number, and eight categorical
 * hues would bury it.
 */
export function HeadlineCall({
  chain,
  universeSize,
}: {
  chain: ChainSnapshot;
  universeSize: number;
}) {
  const gap = chain.scores.mispricing;
  const tone = divergingHue(gap);

  return (
    <div className="panel relative overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-24 -left-16 size-[340px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: tone }}
        aria-hidden
      />

      <div className="relative grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-7">
        <div className="min-w-0">
          <p className="text-ink-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Widest value gap · {universeSize} chains screened
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ChainAvatar
              name={chain.name}
              logoUrl={chain.logoUrl}
              brandColor={chain.brandColor}
              size={40}
            />
            <h1 className="text-[34px] leading-none font-semibold tracking-tight">
              {chain.name}
            </h1>
            {chain.symbol && (
              <span className="text-ink-faint text-[13px] tracking-wide uppercase">
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
          </div>

          <ul className="mt-5 space-y-2.5">
            {chain.thesis.map((line) => (
              <li
                key={line}
                className="text-ink-secondary flex gap-2.5 text-[13.5px] leading-relaxed"
              >
                <span
                  className="mt-[7px] size-1 shrink-0 rounded-full"
                  style={{ background: tone }}
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>

          <Link
            href={`/chain/${chain.slug}`}
            className="text-ink hover:border-ink-faint border-hairline bg-surface mt-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors"
          >
            Full breakdown
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <div className="lg:border-hairline flex flex-col justify-center lg:border-l lg:pl-7">
          <div className="text-ink-muted text-[11px] font-medium tracking-wide uppercase">
            Value gap
          </div>
          <div
            className="mt-1 text-[68px] leading-none font-semibold tracking-tighter"
            style={{ color: tone }}
          >
            {formatSigned(gap)}
          </div>
          <p className="text-ink-muted mt-2 text-[12px] leading-relaxed">
            On a −100 to +100 scale. Positive means the market prices the chain
            below what its activity supports.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3.5">
            <Metric label="Market cap" value={formatUsd(chain.metrics.marketCap)} />
            <Metric label="TVL" value={formatUsd(chain.metrics.tvl)} />
            <Metric
              label="Chain fees 30d"
              value={formatUsd(chain.metrics.fees30d)}
              note={formatPercent(chain.metrics.feesChange30d, { digits: 0 })}
              noteTone={
                (chain.metrics.feesChange30d ?? 0) >= 0
                  ? "var(--color-good)"
                  : "var(--color-critical)"
              }
            />
            <Metric
              label="Token 30d"
              value={formatPercent(chain.metrics.priceChange30d, { digits: 0 })}
              valueTone={
                (chain.metrics.priceChange30d ?? 0) >= 0
                  ? "var(--color-good)"
                  : "var(--color-critical)"
              }
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  noteTone,
  valueTone,
}: {
  label: string;
  value: string;
  note?: string;
  noteTone?: string;
  valueTone?: string;
}) {
  return (
    <div>
      <dt className="text-ink-muted text-[10.5px] tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className="tnum mt-1 text-[16px] font-medium"
        style={valueTone ? { color: valueTone } : undefined}
      >
        {value}
        {note && (
          <span className="ml-1.5 text-[11.5px]" style={{ color: noteTone }}>
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}
