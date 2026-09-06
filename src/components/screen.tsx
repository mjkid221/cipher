"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlphaMap, type AlphaPoint } from "~/components/chart/alpha-map";
import {
  CommandPalette,
  useCommandShortcut,
} from "~/components/command-palette";
import { Controls } from "~/components/controls";
import { applyFilters } from "~/components/filters";
import { PageHeader } from "~/components/header";
import { HeadlineCall } from "~/components/headline-call";
import { MarketRail } from "~/components/market/market-rail";
import { MethodologyPanel } from "~/components/methodology";
import { SiteFooter } from "~/components/site-footer";
import { ChainTable } from "~/components/table/chain-table";
import { Panel } from "~/components/ui/primitives";
import { cn } from "~/lib/cn";
import { useFiltersStore } from "~/stores/filters-store";
import { api } from "~/trpc/react";

export function Screen() {
  // Filters live in a persisted store so the last configuration survives a
  // refresh. Rehydrated after mount, so the server-rendered defaults and the
  // first client render agree; see the store for why.
  const filters = useFiltersStore((state) => state.filters);
  const setFilters = useFiltersStore((state) => state.setFilters);
  useEffect(() => {
    void useFiltersStore.persist.rehydrate();
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useCommandShortcut(useCallback(() => setPaletteOpen((open) => !open), []));

  const list = api.chains.list.useQuery(
    {
      minConfidence: 0,
      onlyInvestable: false,
      sort: "mispricing",
      direction: "desc",
    },
    {
      staleTime: 60_000,
      // Hold the previous render during a refetch rather than flashing a
      // skeleton and jumping the layout.
      placeholderData: (previous) => previous,
    },
  );
  const methodology = api.chains.methodology.useQuery(undefined, {
    staleTime: Infinity,
  });
  // The indicator rail. Prefetched on the server; re-polled while any source
  // is still warming or answered badly when the page was built, so a tile that
  // came up "unavailable" recovers without a reload.
  const brief = api.market.brief.useQuery(undefined, {
    staleTime: 60_000,
    placeholderData: (previous) => previous,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const degraded =
        data.warming || data.sources.some((source) => source.status !== "ok");
      return degraded ? 15_000 : false;
    },
  });

  const chains = useMemo(() => list.data?.chains ?? [], [list.data]);
  const meta = list.data?.meta;

  const visible = useMemo(
    () => applyFilters(chains, filters),
    [chains, filters],
  );

  /** Peer median of the headline multiple, for the table's comparison meter. */
  const feeMultipleMedian = useMemo(() => {
    const values = chains
      .map((chain) => chain.multiples.mcapToFees)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    return values[Math.floor(values.length / 2)] ?? null;
  }, [chains]);

  /** The chain the hero leads with: widest gap among the trustworthy ones. */
  const headline = useMemo(
    () =>
      chains.find(
        (chain) =>
          chain.investable &&
          !chain.valueTrapRisk &&
          chain.scores.confidence >= 0.6 &&
          (chain.scores.mispricing ?? 0) > 0,
      ) ?? chains[0],
    [chains],
  );

  /** Fixed y domain: every market cap in the universe, filtered or not. */
  const marketCapDomain = useMemo(
    () =>
      chains
        .map((chain) => chain.metrics.marketCap)
        .filter((value): value is number => value !== null && value > 0),
    [chains],
  );

  const points = useMemo<AlphaPoint[]>(
    () =>
      // Only priced chains. A token-less chain has nothing on the y-axis but a
      // number borrowed from the trend line, which drew a dot that could only
      // ever sit on the line; it belongs in the table, not here.
      visible
        .filter(
          (chain) =>
            chain.metrics.marketCap !== null &&
            chain.scores.fundamentalIndex !== null,
        )
        .map((chain) => ({
          slug: chain.slug,
          name: chain.name,
          x: chain.scores.fundamentalIndex!,
          marketCap: chain.metrics.marketCap!,
          mispricing: chain.scores.mispricing,
          confidence: chain.scores.confidence,
          trendResidual: chain.trendResidual,
          logoUrl: chain.logoUrl,
        })),
    [visible],
  );

  if (list.isLoading || !meta) {
    return <BuildingState error={list.error?.message} />;
  }

  const deepValue = chains.filter(
    (chain) => chain.tier === "deep-value" || chain.tier === "undervalued",
  ).length;

  return (
    <>
      <PageHeader meta={meta} onOpenPalette={() => setPaletteOpen(true)} />

      <main
        className={cn(
          "mx-auto max-w-[1560px] space-y-6 px-6 py-7 transition-opacity",
          list.isFetching && "opacity-70",
        )}
      >
        {/*
          Hero, rail, alpha map. Row one is `auto`, so the hero keeps its natural
          height; the rail spans both rows, so at `xl` it runs the full height of
          hero plus alpha map and its tiles stretch to fill. In the DOM the rail
          comes second, which is where it lands below `xl`: under the hero.
        */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:grid-rows-[auto_1fr]">
          {headline && (
            <HeadlineCall
              id="headline"
              chain={headline}
              universeSize={meta.universeSize}
              belowPar={deepValue}
              className="xl:col-start-1 xl:row-start-1"
            />
          )}

          <MarketRail
            id="market-rail"
            brief={brief.data}
            className="xl:col-start-2 xl:row-span-2 xl:row-start-1"
          />

          <Panel
            title="The alpha map"
            subtitle="Every chain plotted by what it earns against what it costs. The line is the peer trend; the shaded band is one standard deviation of the residuals. Points below the line are priced under what their economics support."
            bodyClassName="px-4 pt-2 pb-4"
            className="xl:col-start-1 xl:row-start-2 xl:self-start"
          >
            <AlphaMap
              points={points}
              yDomain={marketCapDomain}
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
        </section>

        <Controls
          filters={filters}
          onChange={setFilters}
          resultCount={visible.length}
          totalCount={chains.length}
        />

        <Panel bodyClassName="p-0">
          <ChainTable chains={visible} feeMultipleMedian={feeMultipleMedian} />
        </Panel>

        <MethodologyPanel
          methodology={methodology.data}
          meta={meta}
          example={headline}
        />
      </main>

      <SiteFooter meta={meta} />

      {paletteOpen && (
        <CommandPalette chains={chains} open onOpenChange={setPaletteOpen} />
      )}
    </>
  );
}

function BuildingState({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1560px] flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <h1 className="text-[20px] font-semibold">
            Could not build the screen
          </h1>
          <p className="text-ink-muted mt-3 max-w-md text-[13px] leading-relaxed">
            {error}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="bg-series-1 size-1.5 animate-pulse rounded-full"
                style={{ animationDelay: `${index * 140}ms` }}
              />
            ))}
          </div>
          <h1 className="mt-5 text-[17px] font-medium">Building the screen</h1>
          <p className="text-ink-muted mt-2 max-w-sm text-[13px] leading-relaxed">
            Pulling capital and revenue from DefiLlama, the chain universe from
            Artemis, and live routing flow from Mayan.
          </p>
        </>
      )}
    </main>
  );
}
