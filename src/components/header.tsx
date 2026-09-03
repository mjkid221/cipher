"use client";

import Link from "next/link";
import { ArrowUpRight, Command, RefreshCw } from "lucide-react";

import { cn } from "~/lib/cn";
import { formatAge } from "~/lib/format";
import type { AggregateMeta } from "~/server/domain/types";

const STATUS_TONE = {
  ok: "var(--color-good)",
  degraded: "var(--color-warning)",
  unavailable: "var(--color-critical)",
} as const;

export function PageHeader({
  meta,
  onRefresh,
  refreshing,
  onOpenPalette,
}: {
  meta: AggregateMeta;
  onRefresh?: () => void;
  refreshing?: boolean;
  onOpenPalette?: () => void;
}) {
  return (
    <header className="border-hairline bg-canvas/80 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">
            Chainbase
          </span>
          <span className="text-ink-faint hidden text-[12px] sm:inline">
            chain valuation screen
          </span>
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          <SourceHealth meta={meta} />

          <span
            className="text-ink-muted flex items-center gap-1.5 text-[11.5px]"
            title={`Snapshot generated ${meta.generatedAt}. Cache tier: ${meta.cache.tier}. Upstash Redis ${meta.cache.enabled ? "enabled" : "not configured"}.`}
          >
            <span
              className="size-1.5 rounded-full"
              style={{
                background: meta.cache.stale
                  ? "var(--color-warning)"
                  : "var(--color-good)",
              }}
              aria-hidden
            />
            {formatAge(meta.cache.ageSeconds)}
          </span>

          {onOpenPalette && (
            <button
              type="button"
              onClick={onOpenPalette}
              className="border-hairline bg-surface text-ink-muted hover:text-ink hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors md:flex"
            >
              <Command className="size-3" aria-hidden />K
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="border-hairline bg-surface text-ink-muted hover:text-ink flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3", refreshing && "animate-spin")}
                aria-hidden
              />
              {refreshing ? "Rebuilding" : "Refresh"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function SourceHealth({ meta }: { meta: AggregateMeta }) {
  return (
    <div className="flex items-center gap-3">
      {meta.sources.map((source) => (
        <a
          key={source.id}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          title={`${source.label}: ${source.note}`}
          className="text-ink-muted hover:text-ink group flex items-center gap-1.5 text-[11.5px] transition-colors"
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: STATUS_TONE[source.status] }}
            aria-hidden
          />
          {source.label}
          <ArrowUpRight className="size-2.5 opacity-0 transition-opacity group-hover:opacity-60" />
        </a>
      ))}
    </div>
  );
}

/** A small diverging glyph: the product's whole thesis in 18 pixels. */
function Mark() {
  return (
    <span
      className="relative grid size-6 place-items-center rounded-[7px]"
      style={{
        background:
          "linear-gradient(140deg, color-mix(in oklab, var(--color-under) 32%, var(--color-surface)), var(--color-surface))",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
      aria-hidden
    >
      <svg width="13" height="13" viewBox="0 0 13 13">
        <path
          d="M1.5 9.5 L4.5 6 L7 8 L11.5 2.5"
          fill="none"
          stroke="var(--color-under)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="11.5" cy="2.5" r="1.5" fill="var(--color-under)" />
      </svg>
    </span>
  );
}
