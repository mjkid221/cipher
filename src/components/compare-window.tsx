"use client";

import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Search,
} from "lucide-react";
import Link from "next/link";
import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";

import { FloatingWindow } from "~/components/window/floating-window";
import { Explain } from "~/components/ui/explain";
import { ChainAvatar } from "~/components/ui/primitives";
import { Segmented } from "~/components/ui/segmented";
import { cn } from "~/lib/cn";
import { compare, type CompareSide } from "~/lib/compare";
import {
  formatMonth,
  formatMultiple,
  formatPrice,
  formatUsd,
} from "~/lib/format";
import { SERIES } from "~/lib/palette";
import { useCompareStore, type CapBasis } from "~/stores/compare-store";
import { api } from "~/trpc/react";

/**
 * The comparison window: what one chain's token would cost at another's market
 * cap, and how far each sits below its own all-time high.
 *
 * ## Why a window rather than a page section
 *
 * The question is comparative, so it needs two chains and a place to swap them
 * without losing the ranking behind it. It also has to be reachable from a
 * chain page, which the header windows already are.
 *
 * ## Why it queries `chains.compare` and not `chains.list`
 *
 * Windows are mounted in the root layout, outside the page's `HydrateClient`.
 * A `useQuery` here for a key the page prefetched — `chains.list` is one —
 * makes TanStack treat the prefetched data as an existing query and defer
 * hydration to an effect that never runs during SSR. `chains.compare` exists
 * precisely so this window has a key of its own.
 *
 * ## Colour
 *
 * Nothing here uses the diverging blue-to-red pair. A larger market cap is not
 * "overvalued" — that scale is reserved for the value gap, and borrowing it
 * would assert a judgement this window does not make.
 *
 * The two chains are told apart by the categorical trio's first and *third*
 * hues, blue and green, skipping the second. That is deliberate: series-2 is a
 * warm orange sitting close to the diverging red, and blue-against-orange read
 * as "this one cheap, that one expensive" in exactly the way the paragraph
 * above forbids — the more so because series-1 and `--color-under` are the same
 * blue. Blue against green cannot be mistaken for a cheap-to-expensive axis,
 * because nothing in this app encodes value in green. Names sit beside every
 * bar regardless, so the colour is never the only cue.
 */

type CompareRow = CompareSide & {
  logoUrl: string | null;
  brandColor: string | null;
};

const BASIS_OPTIONS = [
  {
    value: "circulating" as const,
    label: "Circulating",
    hint: "Price × circulating supply. What the market values today.",
  },
  {
    value: "fdv" as const,
    label: "Fully diluted",
    hint: "Price × total supply, which is what CoinGecko's fully diluted value counts.",
  },
];

export function CompareWindow({
  open,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  seed,
  request,
}: {
  open: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  /** A chain to load into the left side, from a "Compare with…" link. */
  seed: { a: string } | null;
  /** Bumped per request, so asking for the same chain twice still re-seeds. */
  request: number;
}) {
  const query = api.chains.compare.useQuery(undefined, {
    staleTime: 60_000,
    enabled: open,
  });

  return (
    <FloatingWindow
      title="Compare"
      subtitle="Market caps, side by side"
      open={open}
      minimized={minimized}
      onMinimize={onMinimize}
      onRestore={onRestore}
      onClose={onClose}
      storageKey="par.compare.window"
      loading={query.isFetching && !query.data}
      loadEstimateMs={3000}
      defaultSize={{ width: 760, height: 660 }}
    >
      {query.data ? (
        <CompareBody rows={query.data.chains} seed={seed} request={request} />
      ) : (
        <div className="text-ink-muted grid h-full place-items-center px-8 text-center text-[13px]">
          {query.isError
            ? "The comparison data could not be loaded."
            : "Loading chains…"}
        </div>
      )}
    </FloatingWindow>
  );
}

function CompareBody({
  rows,
  seed,
  request,
}: {
  rows: readonly CompareRow[];
  seed: { a: string } | null;
  request: number;
}) {
  const storedA = useCompareStore((state) => state.a);
  const storedB = useCompareStore((state) => state.b);
  const basis = useCompareStore((state) => state.basis);
  const setA = useCompareStore((state) => state.setA);
  const setB = useCompareStore((state) => state.setB);
  const swap = useCompareStore((state) => state.swap);
  const setBasis = useCompareStore((state) => state.setBasis);
  const [picking, setPicking] = useState<"a" | "b" | null>(null);

  useEffect(() => {
    void useCompareStore.persist.rehydrate();
  }, []);

  // A slug from a deep link wins over whatever was stored, and `request` is in
  // the deps so clicking "Compare with…" twice re-seeds rather than doing
  // nothing the second time.
  useEffect(() => {
    if (seed) setA(seed.a);
  }, [seed, request, setA]);

  /**
   * Both sides resolved against the live payload. A stored slug that has left
   * the universe falls back to the largest chain rather than blanking the
   * window, and the two sides can never be the same chain.
   */
  const { a, b } = useMemo(() => {
    const byslug = new Map(rows.map((row) => [row.slug, row]));
    const first = rows[0]!;
    const left = (storedA ? byslug.get(storedA) : null) ?? first;
    const right =
      (storedB ? byslug.get(storedB) : null) ??
      rows.find((row) => row.slug !== left.slug) ??
      first;
    return {
      a: left,
      b:
        right.slug === left.slug
          ? (rows.find((r) => r.slug !== left.slug) ?? right)
          : right,
    };
  }, [rows, storedA, storedB]);

  const result = useMemo(() => compare(a, b, basis), [a, b, basis]);
  const missingFdv =
    basis === "fdv"
      ? [a, b].filter((side) => side.fdv === null).map((side) => side.name)
      : [];

  return (
    <div className="relative h-full">
      <div className="scroll-slim h-full space-y-5 overflow-y-auto p-4">
        {/* who against whom, and on what basis */}
        <div className="flex flex-wrap items-center gap-2">
          <PickerButton
            side={a}
            label="Chain being repriced"
            onClick={() => setPicking("a")}
          />
          <button
            type="button"
            onClick={swap}
            aria-label="Swap the two chains"
            title="Swap"
            className="border-hairline text-ink-muted hover:text-ink hover:bg-raised rounded-control grid size-9 shrink-0 place-items-center border transition-colors"
          >
            <ArrowLeftRight className="size-3.5" aria-hidden />
          </button>
          <PickerButton
            side={b}
            label="Chain lending its market cap"
            onClick={() => setPicking("b")}
          />
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Segmented<CapBasis>
              label="Valuation basis"
              size="compact"
              value={basis}
              onChange={setBasis}
              options={BASIS_OPTIONS}
            />
            <Explain term="capBasis" side="bottom" />
          </span>
        </div>

        {/* the answer */}
        <div className="border-hairline border-t pt-4">
          <h3 className="text-ink-muted inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
            {a.name} with the market cap of {b.name}
            <Explain term="capComparison" side="bottom" />
          </h3>

          {missingFdv.length > 0 ? (
            <p className="text-ink-secondary mt-2 text-[12.5px] leading-relaxed">
              CoinGecko publishes no total supply for {missingFdv.join(" or ")},
              so a fully diluted comparison cannot be made. Switch to
              circulating.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tnum text-[32px] leading-none font-semibold tracking-tight">
                {formatPrice(result.priceAtB)}
              </span>
              <span className="text-ink-secondary tnum text-[15px]">
                {formatMultiple(result.multiple)} its price today
              </span>
              <span className="text-ink-faint text-[12px]">
                · {a.symbol ?? a.name} trades at {formatPrice(a.price)}
              </span>
            </div>
          )}

          {result.sameChain && (
            <p className="text-ink-faint mt-2 text-[11.5px]">
              Both sides are the same chain. Pick a different one to compare.
            </p>
          )}
        </div>

        <CapBars a={a} b={b} result={result} />

        {/* against its own high */}
        <div className="border-hairline border-t pt-4">
          <h3 className="text-ink-muted inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
            {a.name} against its own high
            <Explain term="allTimeHigh" side="bottom" />
          </h3>
          {a.athPrice === null ? (
            <p className="text-ink-secondary mt-2 text-[12.5px]">
              No all-time high on record for {a.name}.
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Figure
                label="All-time high"
                value={formatPrice(a.athPrice)}
                note={a.athDate ? formatMonth(a.athDate) : null}
              />
              <Figure
                label={result.atOwnHigh ? "At its high" : "To reclaim it"}
                value={
                  result.atOwnHigh ? "—" : formatMultiple(result.athMultipleA)
                }
                note={
                  result.atOwnHigh ? "trading at or above it" : "from today"
                }
              />
              <Figure
                label="Market cap at that high"
                value={formatUsd(result.athCapA)}
                note="at today's supply"
              />
            </dl>
          )}
        </div>

        {/* against the other chain's high */}
        {result.priceAtBAth !== null && (
          <div className="border-hairline border-t pt-4">
            <h3 className="text-ink-muted text-[11px] font-medium tracking-wide uppercase">
              {a.name} at {b.name}&rsquo;s all-time-high market cap
            </h3>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
              <span className="tnum text-[22px] leading-none font-semibold tracking-tight">
                {formatPrice(result.priceAtBAth)}
              </span>
              <span className="text-ink-secondary tnum text-[13px]">
                {formatMultiple(result.multipleAtBAth)} its price today
              </span>
              <span className="text-ink-faint text-[12px]">
                · {b.name} peaked around {formatUsd(result.athCapB)}
              </span>
            </div>
          </div>
        )}

        {/* what these numbers are, and are not */}
        <div className="border-hairline space-y-2 border-t pt-4">
          <p className="text-ink-faint text-[11px] leading-relaxed">
            Prices and circulating market caps come from DefiLlama; supply,
            fully diluted value and all-time highs from CoinGecko. Circulating
            is price × circulating supply; fully diluted is price × total
            supply, not a hard cap.
          </p>
          <p className="text-ink-faint text-[11px] leading-relaxed">
            All-time-high market caps use today&rsquo;s supply, not the supply
            on the day of the high. For a token whose supply has grown since,
            they overstate what the market actually paid.
          </p>
          <p className="text-ink-faint text-[11px] leading-relaxed">
            A hypothetical, not a target: holding one chain&rsquo;s supply fixed
            and borrowing another&rsquo;s valuation says nothing about whether
            either is fairly valued. Nothing here feeds the ranking.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {[a, b].map((side) => (
              <Link
                key={side.slug}
                href={`/chain/${side.slug}`}
                className="text-ink-secondary hover:text-series-1 inline-flex items-center gap-1 text-[11.5px] transition-colors"
              >
                Open {side.name}
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {picking && (
        <ChainPicker
          rows={rows}
          exclude={picking === "a" ? b.slug : a.slug}
          onSelect={(slug) => {
            if (picking === "a") setA(slug);
            else setB(slug);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** The trigger that opens the picker, showing which chain is currently chosen. */
function PickerButton({
  side,
  label,
  onClick,
}: {
  side: CompareRow;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${side.name}. Change it.`}
      aria-haspopup="listbox"
      className="border-hairline bg-surface hover:bg-raised rounded-control flex min-h-9 min-w-0 flex-1 items-center gap-2 border px-2.5 py-1.5 text-left transition-colors max-sm:basis-full"
    >
      <ChainAvatar
        name={side.name}
        logoUrl={side.logoUrl}
        brandColor={side.brandColor}
        size={20}
      />
      <span className="truncate text-[12.5px] font-medium">{side.name}</span>
      {side.symbol && (
        <span className="text-ink-faint shrink-0 text-[10px] tracking-wide uppercase">
          {side.symbol}
        </span>
      )}
      <ChevronDown
        className="text-ink-faint ml-auto size-3 shrink-0"
        aria-hidden
      />
    </button>
  );
}

/**
 * The chain picker, as an overlay filling the window body.
 *
 * Not a dropdown: `FloatingWindow` clips its children, so a menu escaping the
 * frame would be cut off. Escape stops propagating, or the window would
 * minimise instead of the picker closing.
 */
function ChainPicker({
  rows,
  exclude,
  onSelect,
  onClose,
}: {
  rows: readonly CompareRow[];
  exclude: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="bg-surface absolute inset-0 z-10 flex flex-col"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <Command label="Choose a chain" className="flex min-h-0 flex-1 flex-col">
        <div className="border-hairline flex items-center gap-2 border-b px-4 py-2.5">
          <Search className="text-ink-faint size-3.5 shrink-0" aria-hidden />
          <Command.Input
            autoFocus
            placeholder="Search chains by name or ticker…"
            className="placeholder:text-ink-faint w-full bg-transparent text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink shrink-0 text-[11.5px]"
          >
            Cancel
          </button>
        </div>
        <Command.List className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
          <Command.Empty className="text-ink-muted px-3 py-8 text-center text-[13px]">
            No chain by that name has a token to price.
          </Command.Empty>
          {rows.map((row) => (
            <Command.Item
              key={row.slug}
              value={`${row.name} ${row.symbol ?? ""}`}
              disabled={row.slug === exclude}
              onSelect={() => onSelect(row.slug)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                "data-[selected=true]:bg-raised",
                "data-[disabled=true]:cursor-default data-[disabled=true]:opacity-40",
              )}
            >
              <ChainAvatar
                name={row.name}
                logoUrl={row.logoUrl}
                brandColor={row.brandColor}
                size={24}
              />
              <span className="truncate text-[13px] font-medium">
                {row.name}
              </span>
              {row.symbol && (
                <span className="text-ink-faint shrink-0 text-[10.5px] tracking-wide uppercase">
                  {row.symbol}
                </span>
              )}
              <span className="tnum text-ink-muted ml-auto shrink-0 text-[11.5px]">
                {row.slug === exclude
                  ? "on the other side"
                  : formatUsd(row.marketCap)}
              </span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}

/**
 * The four market caps on one log axis.
 *
 * Log, because the pairs a reader picks are routinely three orders of magnitude
 * apart and a linear axis would draw the smaller one as nothing. Bars are
 * labelled with their own figures, so the axis is a sense of scale rather than
 * something to read values off. The two all-time-high bars are outlined rather
 * than filled — the same "not confirmed" idiom the cycle chart uses for a peak
 * that has not been ratified.
 */
function CapBars({
  a,
  b,
  result,
}: {
  a: CompareRow;
  b: CompareRow;
  result: ReturnType<typeof compare>;
}) {
  const bars = [
    {
      key: "a",
      label: `${a.name} today`,
      value: result.capA,
      colour: SERIES[0],
      outline: false,
    },
    {
      key: "aAth",
      label: `${a.name} at its high`,
      value: result.athCapA,
      colour: SERIES[0],
      outline: true,
    },
    {
      key: "b",
      label: `${b.name} today`,
      value: result.capB,
      colour: SERIES[2],
      outline: false,
    },
    {
      key: "bAth",
      label: `${b.name} at its high`,
      value: result.athCapB,
      colour: SERIES[2],
      outline: true,
    },
  ].filter((bar) => bar.value !== null && bar.value > 0);

  if (bars.length < 2) return null;

  const max = Math.max(...bars.map((bar) => bar.value!));
  const min = Math.min(...bars.map((bar) => bar.value!));
  // A floor two decades below the largest bar keeps a small chain visible
  // without pretending the gap is smaller than it is.
  const floor = Math.min(min, max / 100) / 2;
  const width = (value: number) =>
    Math.max(
      1.5,
      ((Math.log10(value) - Math.log10(floor)) /
        (Math.log10(max) - Math.log10(floor) || 1)) *
        100,
    );

  return (
    <div
      className="space-y-1.5"
      role="img"
      aria-label={bars
        .map((bar) => `${bar.label}, ${formatUsd(bar.value)}`)
        .join("; ")}
    >
      {bars.map((bar) => (
        <div key={bar.key} className="flex items-center gap-3">
          <span className="text-ink-muted w-[38%] shrink-0 truncate text-[11.5px]">
            {bar.label}
          </span>
          <span className="relative h-[9px] flex-1">
            <span
              className="absolute inset-y-0 left-0 rounded-[2px]"
              style={{
                width: `${width(bar.value!).toFixed(3)}%`,
                backgroundColor: bar.outline ? "transparent" : bar.colour,
                boxShadow: bar.outline
                  ? `inset 0 0 0 1.5px ${bar.colour}`
                  : undefined,
                opacity: bar.outline ? 0.9 : 0.75,
              }}
            />
          </span>
          <span className="tnum text-ink-secondary w-[74px] shrink-0 text-right text-[11.5px]">
            {formatUsd(bar.value)}
          </span>
        </div>
      ))}
      <p className="text-ink-faint pt-1 text-[10.5px]">
        Log scale · outlined bars are all-time highs at today&rsquo;s supply
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-faint text-[10px] tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-0.5">
        <span
          className={cn(
            "tnum text-[15px] font-medium",
            value === "—" && "text-ink-faint",
          )}
        >
          {value}
        </span>
        {note && (
          <span className="text-ink-faint ml-1.5 text-[11px]">{note}</span>
        )}
      </dd>
    </div>
  );
}
