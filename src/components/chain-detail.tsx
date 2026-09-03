"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import { AlphaMap, type AlphaPoint } from "~/components/chart/alpha-map";
import { AreaChart } from "~/components/chart/area-chart";
import { PercentileBar, RatioMeter } from "~/components/chart/bars";
import { PageHeader } from "~/components/header";
import { SiteFooter } from "~/components/site-footer";
import { ChainAvatar, Delta, Panel, TierBadge } from "~/components/ui/primitives";
import {
  formatCount,
  formatMultiple,
  formatPercent,
  formatSigma,
  formatSigned,
  formatUsd,
} from "~/lib/format";
import { divergingHue, TIER_META } from "~/lib/palette";
import { api } from "~/trpc/react";
import type { ChainMultiples, ChainSnapshot } from "~/server/domain/types";

const MULTIPLE_ROWS: {
  key: keyof ChainMultiples;
  label: string;
  note: string;
}[] = [
  {
    key: "mcapToFees",
    label: "Market cap ÷ annualised fees",
    note: "What the market pays for a dollar of the chain's own fee income.",
  },
  {
    key: "mcapToRevenue",
    label: "Market cap ÷ annualised revenue",
    note: "Same, after the share of fees that is burned or paid out.",
  },
  {
    key: "mcapToTvl",
    label: "Market cap ÷ TVL",
    note: "Below 1 means the token is worth less than the capital it secures.",
  },
  {
    key: "mcapToStablecoins",
    label: "Market cap ÷ stablecoin float",
    note: "How richly the chain is valued against the settled money on it.",
  },
  {
    key: "mcapToDexVolume",
    label: "Market cap ÷ annualised DEX volume",
    note: "Valuation against trading throughput.",
  },
];

const METRIC_ROWS: {
  key: string;
  label: string;
  value: (chain: ChainSnapshot) => string;
  delta?: (chain: ChainSnapshot) => number | null;
}[] = [
  {
    key: "fees30d",
    label: "Chain fees, 30d",
    value: (c) => formatUsd(c.metrics.fees30d),
    delta: (c) => c.metrics.feesChange30d,
  },
  {
    key: "revenue30d",
    label: "Chain revenue, 30d",
    value: (c) => formatUsd(c.metrics.revenue30d),
    delta: (c) => c.metrics.revenueChange30d,
  },
  {
    key: "tvl",
    label: "Total value locked",
    value: (c) => formatUsd(c.metrics.tvl),
    delta: (c) => c.metrics.tvlChange30d,
  },
  {
    key: "stablecoins",
    label: "Stablecoin float",
    value: (c) => formatUsd(c.metrics.stablecoins),
  },
  {
    key: "dexVolume30d",
    label: "DEX volume, 30d",
    value: (c) => formatUsd(c.metrics.dexVolume30d),
    delta: (c) => c.metrics.dexVolumeChange30d,
  },
  {
    key: "protocols",
    label: "Protocols deployed",
    value: (c) => formatCount(c.metrics.protocols),
  },
  {
    key: "dau",
    label: "Daily active addresses",
    value: (c) => formatCount(c.metrics.dau),
    delta: (c) => c.metrics.dauChange30d,
  },
];

export function ChainDetail({ slug }: { slug: string }) {
  const query = api.chains.detail.useQuery({ slug }, { staleTime: 60_000 });

  const points = useMemo<AlphaPoint[]>(
    () =>
      (query.data?.peers ?? [])
        .filter(
          (peer) => peer.marketCap !== null && peer.fundamentalIndex !== null,
        )
        .map((peer) => ({
          slug: peer.slug,
          name: peer.name,
          x: peer.fundamentalIndex!,
          marketCap: peer.marketCap!,
          mispricing: peer.mispricing,
          confidence: peer.confidence,
          trendResidual: peer.trendResidual,
        })),
    [query.data],
  );

  const marketCapDomain = useMemo(
    () =>
      (query.data?.peers ?? [])
        .map((peer) => peer.marketCap)
        .filter((value): value is number => value !== null && value > 0),
    [query.data],
  );

  if (query.isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-3xl items-center justify-center px-6">
        <span className="text-ink-muted text-[13px]">Loading chain…</span>
      </main>
    );
  }

  const chain = query.data?.chain;
  const meta = query.data?.meta;

  if (!chain || !meta) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[20px] font-semibold">Chain not in the universe</h1>
        <p className="text-ink-muted mt-3 max-w-md text-[13px] leading-relaxed">
          Only chains with enough on-chain footprint to score are included. This
          one either fell below the entry floor or is not tracked by the sources.
        </p>
        <Link
          href="/"
          className="border-hairline mt-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to the screen
        </Link>
      </main>
    );
  }

  const medians = query.data?.medians;
  const tone = divergingHue(chain.scores.mispricing);

  const links = [
    { label: "Website", href: chain.website },
    { label: "Explorer", href: chain.explorer },
    { label: "GitHub", href: chain.github },
    { label: "X", href: chain.twitter },
    {
      label: "DefiLlama",
      href: chain.keys.llamaName
        ? `https://defillama.com/chain/${encodeURIComponent(chain.keys.llamaName)}`
        : null,
    },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  return (
    <>
      <PageHeader meta={meta} />

      <main className="mx-auto max-w-[1560px] space-y-6 px-6 py-7">
        <Link
          href="/"
          className="text-ink-muted hover:text-ink inline-flex items-center gap-2 text-[12.5px] transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to the screen
        </Link>

        {/* identity + verdict */}
        <section className="panel relative overflow-hidden">
          <span
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
            }}
            aria-hidden
          />
          <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <ChainAvatar
                  name={chain.name}
                  logoUrl={chain.logoUrl}
                  brandColor={chain.brandColor}
                  size={44}
                />
                <h1 className="text-[32px] leading-none font-semibold tracking-tight">
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

              {chain.description && (
                <p className="text-ink-secondary mt-4 max-w-3xl text-[13.5px] leading-relaxed">
                  {chain.description}
                </p>
              )}

              <div className="text-ink-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                {chain.founded && <span>Founded {chain.founded}</span>}
                {chain.founders && <span>· {chain.founders}</span>}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="border-hairline bg-surface text-ink-secondary hover:text-ink inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors"
                  >
                    {link.label}
                    <ArrowUpRight className="size-3 opacity-50" aria-hidden />
                  </a>
                ))}
              </div>

              <ul className="mt-6 space-y-2.5">
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
            </div>

            <div className="lg:border-hairline flex flex-col justify-center lg:border-l lg:pl-7">
              <div className="text-ink-muted text-[11px] font-medium tracking-wide uppercase">
                Value gap
              </div>
              <div
                className="mt-1 text-[64px] leading-none font-semibold tracking-tighter"
                style={{ color: tone }}
              >
                {formatSigned(chain.scores.mispricing)}
              </div>
              <p className="text-ink-muted mt-2 text-[12px] leading-relaxed">
                {TIER_META[chain.tier].description}
              </p>

              <dl className="mt-5 space-y-3">
                <ScoreRow label="Fundamentals" value={chain.scores.fundamental} />
                <ScoreRow label="Momentum" value={chain.scores.momentum} />
                <ScoreRow label="Cheapness" value={chain.scores.cheapness} />
                <ScoreRow
                  label="Data confidence"
                  value={chain.scores.confidence * 100}
                />
              </dl>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* valuation multiples */}
          <Panel
            title="What the market pays"
            subtitle="Each ratio against the peer median. The meter runs on a log scale — left of centre is cheaper than the median, right is dearer."
            bodyClassName="p-0"
          >
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-hairline text-ink-muted border-b text-[10.5px] tracking-wide uppercase">
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">
                    Ratio
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    This chain
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">
                    Peer median
                  </th>
                  <th scope="col" className="w-[110px] px-5 py-2.5 text-left font-medium">
                    Versus peers
                  </th>
                </tr>
              </thead>
              <tbody>
                {MULTIPLE_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className="border-hairline/60 border-b last:border-b-0"
                  >
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-ink-muted mt-0.5 text-[11.5px] leading-snug">
                        {row.note}
                      </div>
                    </th>
                    <td className="tnum px-3 py-3 text-right font-medium">
                      {formatMultiple(chain.multiples[row.key])}
                    </td>
                    <td className="tnum text-ink-muted px-3 py-3 text-right">
                      {formatMultiple(medians?.[row.key] ?? null)}
                    </td>
                    <td className="px-5 py-3">
                      <RatioMeter
                        value={chain.multiples[row.key]}
                        reference={medians?.[row.key] ?? null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* metric profile */}
          <Panel
            title="What the chain actually does"
            subtitle="Each input to the model, with the chain's percentile against every other chain on the screen."
            bodyClassName="p-0"
          >
            <table className="w-full text-[12.5px]">
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className="border-hairline/60 border-b last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="text-ink-secondary px-5 py-3 text-left font-normal"
                    >
                      {row.label}
                    </th>
                    <td className="tnum px-3 py-3 text-right font-medium">
                      {row.value(chain)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {row.delta && <Delta value={row.delta(chain)} digits={0} />}
                    </td>
                    <td className="w-[120px] px-5 py-3">
                      <PercentileBar
                        value={chain.percentiles[row.key] ?? null}
                        label={`${row.label} percentile`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel
            title="Capital on the chain"
            subtitle={`Total value locked over the last ${chain.tvlSeries.length} days.`}
          >
            <AreaChart
              values={chain.tvlSeries}
              label={`Total value locked on ${chain.name} over the last ${chain.tvlSeries.length} days`}
            />
            <dl className="border-hairline mt-3 grid grid-cols-3 gap-4 border-t pt-3">
              <SmallStat label="Now" value={formatUsd(chain.metrics.tvl)} />
              <SmallStat
                label="7d"
                value={formatPercent(chain.metrics.tvlChange7d, { digits: 1 })}
              />
              <SmallStat
                label="30d"
                value={formatPercent(chain.metrics.tvlChange30d, { digits: 1 })}
              />
            </dl>
          </Panel>

          <Panel
            title="Cross-chain routing"
            subtitle="Transfers into and out of this chain across Mayan in the sampled window."
          >
            {chain.metrics.bridgeInboundTransfers === null ? (
              <p className="text-ink-muted text-[12.5px] leading-relaxed">
                Mayan does not route to this chain, so there is no flow to
                report. It is one of about a dozen destinations the explorer
                covers.
              </p>
            ) : (
              <dl className="space-y-3.5">
                <SmallStat
                  label="Transfers in"
                  value={formatCount(chain.metrics.bridgeInboundTransfers)}
                  inline
                />
                <SmallStat
                  label="Transfers out"
                  value={formatCount(chain.metrics.bridgeOutboundTransfers)}
                  inline
                />
                <SmallStat
                  label="Distinct traders"
                  value={formatCount(chain.metrics.bridgeTraders)}
                  inline
                />
                <SmallStat
                  label="Estimated net flow, 24h"
                  value={formatUsd(chain.metrics.bridgeNetUsd)}
                  inline
                  tone={
                    (chain.metrics.bridgeNetUsd ?? 0) >= 0
                      ? "var(--color-good)"
                      : "var(--color-critical)"
                  }
                />
                <p className="text-ink-faint border-hairline border-t pt-3 text-[11.5px] leading-relaxed">
                  Net flow is an estimate. Mayan&rsquo;s per-swap prices are
                  unreliable, so chain shares are taken from transfer counts and
                  applied to the protocol&rsquo;s reported 24h volume.
                </p>
              </dl>
            )}
          </Panel>
        </div>

        <Panel
          title="Position against peers"
          subtitle={`Where ${chain.name} sits on the same map as every other chain. ${
            chain.trendResidual !== null
              ? `It is ${formatSigma(chain.trendResidual)} from the trend line.`
              : ""
          }`}
          bodyClassName="px-4 pt-2 pb-4"
        >
          <AlphaMap
            points={points}
            yDomain={marketCapDomain}
            highlightSlug={chain.slug}
            regression={
              meta.regression
                ? {
                    slope: meta.regression.slope,
                    intercept: meta.regression.intercept,
                    residualSd: meta.regression.residualSd,
                    rSquared: meta.regression.rSquared,
                    sampleSize: meta.regression.sampleSize,
                  }
                : null
            }
          />
        </Panel>
      </main>

      <SiteFooter meta={meta} />
    </>
  );
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted text-[12px]">{label}</dt>
      <dd>
        <PercentileBar value={value} width={64} />
      </dd>
    </div>
  );
}

function SmallStat({
  label,
  value,
  inline,
  tone,
}: {
  label: string;
  value: string;
  inline?: boolean;
  tone?: string;
}) {
  if (inline) {
    return (
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-muted text-[12px]">{label}</dt>
        <dd
          className="tnum text-[14px] font-medium"
          style={tone ? { color: tone } : undefined}
        >
          {value}
        </dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-ink-muted text-[10.5px] tracking-wide uppercase">
        {label}
      </dt>
      <dd className="tnum mt-1 text-[15px] font-medium">{value}</dd>
    </div>
  );
}
