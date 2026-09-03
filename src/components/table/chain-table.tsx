"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DivergingBar, PercentileBar, RatioMeter } from "~/components/chart/bars";
import { Sparkline } from "~/components/chart/sparkline";
import { ChainAvatar, Delta, TierBadge } from "~/components/ui/primitives";
import { cn } from "~/lib/cn";
import {
  formatMultiple,
  formatPercent,
  formatUsd,
} from "~/lib/format";
import type { ChainSnapshot } from "~/server/domain/types";

type SortKey =
  | "rank"
  | "mispricing"
  | "fundamental"
  | "momentum"
  | "cheapness"
  | "marketCap"
  | "tvl"
  | "fees30d"
  | "mcapToFees"
  | "priceChange30d"
  | "confidence";

interface Column {
  key: SortKey;
  label: string;
  /** Shown on hover, explaining what the column actually measures. */
  hint?: string;
  align: "left" | "right";
  width: number;
  sticky?: boolean;
  value: (chain: ChainSnapshot) => number | null;
  render: (chain: ChainSnapshot, context: { median: number | null }) => React.ReactNode;
}

export function ChainTable({
  chains,
  feeMultipleMedian,
  className,
}: {
  chains: readonly ChainSnapshot[];
  feeMultipleMedian: number | null;
  className?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "mispricing",
    direction: "desc",
  });

  const columns = useMemo<Column[]>(
    () => [
      {
        key: "mispricing",
        label: "Value gap",
        hint: "Fundamental rank versus market-cap rank, blended with valuation multiples and momentum. Positive means underpriced.",
        align: "left",
        width: 152,
        value: (chain) => chain.scores.mispricing,
        render: (chain) => <DivergingBar value={chain.scores.mispricing} />,
      },
      {
        key: "fundamental",
        label: "Fundamentals",
        hint: "Percentile of fees, capital, stablecoin float, volume, users and ecosystem breadth.",
        align: "left",
        width: 112,
        value: (chain) => chain.scores.fundamental,
        render: (chain) => <PercentileBar value={chain.scores.fundamental} />,
      },
      {
        key: "momentum",
        label: "Momentum",
        hint: "Percentile of 30-day growth in fees, capital, volume and cross-chain inflow.",
        align: "left",
        width: 112,
        value: (chain) => chain.scores.momentum,
        render: (chain) => <PercentileBar value={chain.scores.momentum} />,
      },
      {
        key: "cheapness",
        label: "Cheapness",
        hint: "Percentile of the valuation ratios, inverted. High means cheap versus peers.",
        align: "left",
        width: 112,
        value: (chain) => chain.scores.cheapness,
        render: (chain) => <PercentileBar value={chain.scores.cheapness} />,
      },
      {
        key: "marketCap",
        label: "Market cap",
        align: "right",
        width: 104,
        value: (chain) => chain.metrics.marketCap,
        render: (chain) => (
          <span className="tnum text-[13px]">
            {formatUsd(chain.metrics.marketCap)}
          </span>
        ),
      },
      {
        key: "priceChange30d",
        label: "Token 30d",
        hint: "Native token price change over the last 30 days.",
        align: "right",
        width: 92,
        value: (chain) => chain.metrics.priceChange30d,
        render: (chain) => <Delta value={chain.metrics.priceChange30d} digits={0} />,
      },
      {
        key: "tvl",
        label: "TVL",
        align: "right",
        width: 176,
        value: (chain) => chain.metrics.tvl,
        render: (chain) => (
          <div className="flex items-center justify-end gap-3">
            <Sparkline
              values={chain.tvlSeries.slice(-30)}
              width={72}
              height={22}
              aria-label={`TVL trend for ${chain.name}`}
            />
            <span className="tnum w-[62px] text-right text-[13px]">
              {formatUsd(chain.metrics.tvl)}
            </span>
          </div>
        ),
      },
      {
        key: "fees30d",
        label: "Chain fees 30d",
        hint: "Fees earned by the chain itself, not by the apps deployed on it.",
        align: "right",
        width: 132,
        value: (chain) => chain.metrics.fees30d,
        render: (chain) => (
          <div className="flex flex-col items-end gap-0.5">
            <span className="tnum text-[13px]">
              {formatUsd(chain.metrics.fees30d)}
            </span>
            <Delta value={chain.metrics.feesChange30d} digits={0} />
          </div>
        ),
      },
      {
        key: "mcapToFees",
        label: "MC / fees",
        hint: "Market cap divided by annualised chain fees. The bar compares it with the peer median.",
        align: "right",
        width: 116,
        value: (chain) => chain.multiples.mcapToFees,
        render: (chain, { median }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="tnum text-[13px]">
              {formatMultiple(chain.multiples.mcapToFees)}
            </span>
            <RatioMeter
              value={chain.multiples.mcapToFees}
              reference={median}
              className="w-16"
            />
          </div>
        ),
      },
      {
        key: "confidence",
        label: "Confidence",
        hint: "Share of model inputs the chain supplied, damped by how small it is.",
        align: "right",
        width: 96,
        value: (chain) => chain.scores.confidence,
        render: (chain) => (
          <span
            className="tnum text-[12.5px]"
            style={{
              color:
                chain.scores.confidence >= 0.6
                  ? "var(--color-ink-secondary)"
                  : "var(--color-warning)",
            }}
          >
            {formatPercent(chain.scores.confidence * 100, {
              digits: 0,
              signed: false,
            })}
          </span>
        ),
      },
    ],
    [],
  );

  const sorted = useMemo(() => {
    const column = columns.find((entry) => entry.key === sort.key);
    if (!column) return chains;

    return [...chains].sort((a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1; // missing data always sinks
      if (right === null) return -1;
      return sort.direction === "desc" ? right - left : left - right;
    });
  }, [chains, columns, sort]);

  function toggleSort(key: SortKey) {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === "desc" ? "asc" : "desc" }
        : { key, direction: "desc" },
    );
  }

  if (chains.length === 0) {
    return (
      <div className="text-ink-muted px-5 py-16 text-center text-[13px]">
        No chain matches these filters. Loosen the confidence floor or clear the
        search.
      </div>
    );
  }

  return (
    <div className={cn("scroll-slim overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-hairline border-b">
            <th
              scope="col"
              className="bg-surface text-ink-muted sticky left-0 z-20 w-[248px] min-w-[248px] px-5 py-2.5 text-left text-[11px] font-medium tracking-wide uppercase"
            >
              Chain
            </th>
            {columns.map((column) => {
              const active = sort.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.direction === "desc"
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                  style={{ width: column.width, minWidth: column.width }}
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-medium tracking-wide uppercase",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    title={column.hint}
                    className={cn(
                      "inline-flex items-center gap-1 transition-colors",
                      column.align === "right" && "flex-row-reverse",
                      active
                        ? "text-ink"
                        : "text-ink-muted hover:text-ink-secondary",
                    )}
                  >
                    {column.label}
                    <span
                      aria-hidden
                      className={cn(
                        "text-[8px] transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    >
                      {sort.direction === "desc" ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((chain, index) => (
            <tr
              key={chain.slug}
              onClick={() => router.push(`/chain/${chain.slug}`)}
              className="border-hairline/60 group hover:bg-raised cursor-pointer border-b transition-colors last:border-b-0"
            >
              <th
                scope="row"
                className="bg-surface group-hover:bg-raised sticky left-0 z-10 px-5 py-2.5 text-left font-normal transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="tnum text-ink-faint w-5 shrink-0 text-right text-[11px]">
                    {index + 1}
                  </span>
                  <ChainAvatar
                    name={chain.name}
                    logoUrl={chain.logoUrl}
                    brandColor={chain.brandColor}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium">
                        {chain.name}
                      </span>
                      {chain.valueTrapRisk && (
                        <span
                          title="Cheap on the multiples but the underlying activity is contracting."
                          className="text-[9px] leading-none"
                          style={{ color: "var(--color-warning)" }}
                        >
                          ⚑
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      {chain.symbol && (
                        <span className="text-ink-faint text-[10.5px] tracking-wide uppercase">
                          {chain.symbol}
                        </span>
                      )}
                      <TierBadge tier={chain.tier} compact />
                    </div>
                  </div>
                </div>
              </th>

              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2.5 align-middle",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {column.render(chain, { median: feeMultipleMedian })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
