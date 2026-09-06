"use client";

import { Search, X } from "lucide-react";

import { Segmented } from "~/components/ui/segmented";
import { cn } from "~/lib/cn";
import {
  DEFAULT_FILTERS,
  PRESETS,
  type Filters,
  type PresetKey,
} from "./filters";

/**
 * One filter row, above everything it scopes. Both the scatter and the table
 * re-render against the same slice, so they can never disagree.
 */
export function Controls({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  resultCount: number;
  totalCount: number;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <Segmented
          label="Screen preset"
          value={filters.preset}
          onChange={(preset) => set("preset", preset)}
          options={(Object.keys(PRESETS) as PresetKey[]).map((key) => ({
            value: key,
            label: PRESETS[key].label,
            hint: PRESETS[key].description,
          }))}
        />

        <Segmented
          label="Chain layer"
          value={filters.layer}
          onChange={(layer) => set("layer", layer)}
          options={[
            {
              value: "any",
              label: "All layers",
              hint: "Every chain, including the ones that are neither.",
            },
            {
              value: "L1",
              label: "L1",
              hint: "Only chains classified as layer 1.",
            },
            {
              value: "L2",
              label: "L2",
              hint: "Only chains classified as layer 2.",
            },
          ]}
        />

        <label className="border-hairline bg-surface focus-within:border-ink-faint flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors">
          <Search className="text-ink-faint size-3.5 shrink-0" aria-hidden />
          <input
            value={filters.query}
            onChange={(event) => set("query", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") set("query", "");
            }}
            placeholder="Find a chain"
            aria-label="Find a chain"
            className="placeholder:text-ink-muted text-ink w-[124px] bg-transparent text-[12.5px] outline-none"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => set("query", "")}
              aria-label="Clear search"
              className="text-ink-faint hover:text-ink shrink-0"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <Toggle
          label="Has native token"
          hint="Chains with no liquid asset cannot be valued, only described."
          checked={filters.onlyInvestable}
          onChange={(value) => set("onlyInvestable", value)}
        />

        <Toggle
          label="Hide value traps"
          hint="Excludes chains that are cheap while their activity contracts."
          checked={filters.excludeValueTraps}
          onChange={(value) => set("excludeValueTraps", value)}
        />
      </div>

      <div className="flex items-center gap-3 text-[12px]">
        <span className="text-ink-muted tnum">
          Showing {resultCount} of {totalCount} chains
        </span>
        <span className="text-ink-faint">
          {PRESETS[filters.preset].description}
        </span>
        {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-ink-muted hover:text-ink underline decoration-dotted underline-offset-2"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className={cn(
        "border-hairline bg-surface flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        checked ? "text-ink" : "text-ink-muted hover:text-ink-secondary",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-3 w-5 rounded-full transition-colors",
          checked ? "bg-series-1" : "bg-grid",
        )}
      >
        <span
          className={cn(
            "bg-ink absolute top-[2px] size-2 rounded-full transition-all",
            checked ? "left-[10px]" : "left-[2px]",
          )}
        />
      </span>
      {label}
    </button>
  );
}
