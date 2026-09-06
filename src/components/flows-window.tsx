"use client";

import { ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { FlowMap } from "~/components/chart/flow-map";
import { FloatingWindow } from "~/components/window/floating-window";
import { cn } from "~/lib/cn";
import { formatList, formatUsd } from "~/lib/format";
import { api } from "~/trpc/react";
import type { AggregateMeta } from "~/server/domain/types";

/**
 * The capital-flow explorer.
 *
 * One dataset, not a menu. There used to be two selectable views — a wide
 * shallow source and a narrow complete one — which made the reader choose
 * between them. That is a decision, not an answer.
 *
 * Totals and routes are combined from four public sources — Artemis, Mayan,
 * Wormhole and deBridge — with each dollar counted once (the accounting is in
 * `buildFlows`). The selected chain shows what each source contributed, so a
 * reader can see that Monad's inflow is mostly Mayan and Hyperliquid's mostly
 * Artemis, rather than one undifferentiated number.
 *
 * The chain list on the left *is* the filter for the diagram on the right. Pick
 * a chain and the diagram narrows to its routes, so reading and navigating are
 * the same gesture and nothing needs repeating.
 */

type Flows = NonNullable<AggregateMeta["flows"]>;
type Row = Flows["byChain"][number];

export function FlowsWindow({
  open,
  minimized,
  onMinimize,
  onRestore,
  onClose,
}: {
  open: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const meta = api.chains.meta.useQuery(undefined, {
    staleTime: 60_000,
    enabled: open,
  });

  const flows = meta.data?.flows ?? null;

  return (
    <FloatingWindow
      title="Capital flow"
      subtitle={
        flows
          ? `${flows.byChain.length} chains · ${flows.windowDays}d`
          : undefined
      }
      open={open}
      minimized={minimized}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onClose={onClose}
      storageKey="par.flows.window"
      loading={meta.isFetching && !meta.data}
      loadEstimateMs={5000}
    >
      {meta.data ? (
        <FlowsExplorer flows={flows} />
      ) : (
        <div className="text-ink-muted grid h-full place-items-center px-8 text-center text-[13px]">
          {meta.isError
            ? "Capital flow could not be loaded. The upstream sources may be unreachable."
            : "Loading flows…"}
        </div>
      )}
    </FloatingWindow>
  );
}

function FlowsExplorer({ flows }: { flows: Flows | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    if (!flows) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return flows.byChain;
    return flows.byChain.filter((row) =>
      row.chain.toLowerCase().includes(needle),
    );
  }, [flows, query]);

  const shown = useMemo(() => {
    if (!flows) return [];
    return selected
      ? flows.corridors.filter(
          (corridor) => corridor.from === selected || corridor.to === selected,
        )
      : flows.corridors;
  }, [flows, selected]);

  const focused = selected
    ? (flows?.byChain.find((row) => row.chain === selected) ?? null)
    : null;

  const routeCoverage =
    flows && flows.totalVolumeUsd > 0
      ? `${Math.round((flows.routeVolumeUsd / flows.totalVolumeUsd) * 100)}%`
      : null;

  if (!flows) {
    return (
      <div className="text-ink-muted grid h-full place-items-center px-8 text-center text-[12.5px]">
        No flow data reachable this run.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* one toolbar, scoping everything below it */}
      <div className="border-hairline flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5">
        <span className="text-ink-secondary tnum text-[12px]">
          {formatUsd(flows.totalVolumeUsd)} moved across {flows.byChain.length}{" "}
          chains in {flows.windowDays} days
        </span>
        <span className="text-ink-faint text-[11px]">
          Combined from {formatList(flows.sources)}, each dollar counted once.
          Routes below trace {routeCoverage} of it. Volume is gross in both
          directions, so a heavy route with little net movement is capital
          cycling rather than arriving.
        </span>

        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="border-hairline text-ink-muted hover:text-ink ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
          >
            Showing {selected}
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* left: the chain list, which is also the filter */}
        <div className="border-hairline flex max-h-[42%] min-h-0 shrink-0 flex-col border-b lg:max-h-none lg:w-[300px] lg:border-r lg:border-b-0">
          <label className="border-hairline flex shrink-0 items-center gap-2 border-b px-4 py-2">
            <Search className="text-ink-faint size-3.5" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter chains"
              aria-label="Filter chains"
              className="placeholder:text-ink-faint w-full bg-transparent text-[12px] outline-none"
            />
          </label>

          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
            <ChainList
              rows={visible}
              selected={selected}
              onSelect={(chain) =>
                setSelected((current) => (current === chain ? null : chain))
              }
            />
          </div>
        </div>

        {/* right: the diagram, scoped by whatever is selected */}
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
          {focused && <FocusStrip row={focused} />}

          {shown.length > 0 ? (
            <FlowMap
              corridors={shown}
              // A chain with two routes should not get the same canvas as one
              // with twelve; ribbons stretched to fill it read as blocks. The
              // unselected view draws every chain's busiest route plus the
              // heaviest routes overall, and the diagram grows to fit them.
              height={
                selected
                  ? Math.min(520, 110 + Math.min(shown.length, 24) * 30)
                  : 460
              }
              maxCorridors={selected ? 24 : 56}
              highlight={selected}
            />
          ) : (
            <p className="text-ink-muted px-6 py-16 text-center text-[12.5px] leading-relaxed">
              {selected
                ? `${selected} moved capital, but no route through ${formatList(flows.routeSources, "or")} touches it — so there is no path to draw. Its totals are on the left.`
                : "No routes in this window."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces ---- */

function ChainList({
  rows,
  selected,
  onSelect,
}: {
  rows: readonly Row[];
  selected: string | null;
  onSelect: (chain: string) => void;
}) {
  const widest = Math.max(...rows.map((row) => Math.abs(row.netUsd)), 1);

  if (rows.length === 0) {
    return (
      <p className="text-ink-muted px-4 py-10 text-center text-[12px]">
        No chain by that name.
      </p>
    );
  }

  return (
    <ul>
      {rows.map((row) => {
        const gaining = row.netUsd >= 0;
        const magnitude = (Math.abs(row.netUsd) / widest) * 50;
        const isSelected = selected === row.chain;

        return (
          <li key={row.chain}>
            <button
              type="button"
              onClick={() => onSelect(row.chain)}
              aria-pressed={isSelected}
              className={cn(
                "border-hairline/50 w-full border-b px-4 py-2 text-left transition-colors",
                isSelected ? "bg-overlay" : "hover:bg-raised",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-[12.5px]",
                    isSelected ? "text-ink font-medium" : "text-ink-secondary",
                  )}
                >
                  {row.chain}
                  {!row.hasRoutes && (
                    <span
                      className="text-ink-faint ml-1.5 text-[10px]"
                      title="Capital moved, but no traceable route touches this chain."
                    >
                      totals only
                    </span>
                  )}
                </span>
                <span
                  className="tnum shrink-0 text-[12px] font-medium"
                  style={{
                    color: gaining ? "var(--color-under)" : "var(--color-over)",
                  }}
                >
                  {gaining ? "+" : ""}
                  {formatUsd(row.netUsd)}
                </span>
              </div>

              {/* diverging bar, centred on zero */}
              <div className="relative mt-1.5 h-[5px]">
                <span
                  className="absolute inset-y-0 w-px"
                  style={{ left: "50%", background: "var(--color-axis)" }}
                />
                <span
                  className="absolute top-0 h-full"
                  style={{
                    left: gaining ? "calc(50% + 1px)" : `${50 - magnitude}%`,
                    width: `${Math.max(0.5, magnitude - 0.5)}%`,
                    background: gaining
                      ? "var(--color-under)"
                      : "var(--color-over)",
                    opacity: 0.35 + (Math.abs(row.netUsd) / widest) * 0.65,
                    borderRadius: gaining
                      ? "1px 3px 3px 1px"
                      : "3px 1px 1px 3px",
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The selected chain's numbers, above its routes. */
function FocusStrip({ row }: { row: Row }) {
  return (
    <div className="border-hairline mb-4 flex flex-wrap items-center gap-x-7 gap-y-2 border-b pb-4">
      <div>
        <div className="text-ink-faint text-[10px] tracking-wide uppercase">
          Chain
        </div>
        <div className="mt-0.5 text-[15px] font-semibold">
          {row.slug ? (
            <Link
              href={`/chain/${row.slug}`}
              className="hover:text-series-1 inline-flex items-center gap-1.5 transition-colors"
            >
              {row.chain}
              <ArrowRight className="size-3.5 opacity-50" aria-hidden />
            </Link>
          ) : (
            row.chain
          )}
        </div>
      </div>

      <Figure label="Net" value={row.netUsd} signed />
      <Figure label="Arriving" value={row.inflowUsd} />
      <Figure label="Leaving" value={row.outflowUsd} />

      {row.parts.length > 0 && (
        <div className="basis-full">
          <div className="text-ink-faint text-[10px] tracking-wide uppercase">
            By source · arriving / leaving
          </div>
          <ul className="text-ink-secondary tnum mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px]">
            {row.parts.map((part) => (
              <li key={part.source}>
                <span className="text-ink-muted">{part.source}</span>{" "}
                {formatUsd(part.inflowUsd)} / {formatUsd(part.outflowUsd)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  signed,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const tone = signed
    ? value >= 0
      ? "var(--color-under)"
      : "var(--color-over)"
    : undefined;

  return (
    <div>
      <div className="text-ink-faint text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div
        className="tnum mt-0.5 text-[15px] font-medium"
        style={tone ? { color: tone } : undefined}
      >
        {signed && value >= 0 ? "+" : ""}
        {formatUsd(value)}
      </div>
    </div>
  );
}
