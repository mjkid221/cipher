"use client";

import { Search, X } from "lucide-react";

import { cn } from "~/lib/cn";
import {
  DEFAULT_FILTERS,
  PRESETS,
  type Filters,
  type PresetKey,
} from "./filters";

const CONFIDENCE_STEPS = [
  { value: 0, label: "Any" },
  { value: 0.35, label: "35%" },
  { value: 0.55, label: "55%" },
  { value: 0.7, label: "70%" },
] as const;

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
        <div
          role="group"
          aria-label="Screen preset"
          className="border-hairline bg-surface flex flex-wrap gap-1 rounded-full border p-1"
        >
          {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
            const active = filters.preset === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                title={PRESETS[key].description}
                onClick={() => set("preset", key)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-overlay text-ink"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                {PRESETS[key].label}
              </button>
            );
          })}
        </div>

        <label className="border-hairline bg-surface focus-within:border-ink-faint flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors">
          <Search className="text-ink-faint size-3.5" aria-hidden />
          <input
            value={filters.query}
            onChange={(event) => set("query", event.target.value)}
            placeholder="Find a chain"
            aria-label="Find a chain"
            className="placeholder:text-ink-faint w-32 bg-transparent text-[12.5px] outline-none"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => set("query", "")}
              aria-label="Clear search"
              className="text-ink-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <div className="border-hairline bg-surface flex items-center gap-2 rounded-full border px-3 py-1.5">
          <span className="text-ink-muted text-[11.5px]">Min confidence</span>
          <div className="flex gap-0.5">
            {CONFIDENCE_STEPS.map((step) => (
              <button
                key={step.value}
                type="button"
                aria-pressed={filters.minConfidence === step.value}
                onClick={() => set("minConfidence", step.value)}
                className={cn(
                  "tnum rounded-full px-2 py-0.5 text-[11.5px] transition-colors",
                  filters.minConfidence === step.value
                    ? "bg-overlay text-ink"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                {step.label}
              </button>
            ))}
          </div>
        </div>

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
        <span className="text-ink-faint">{PRESETS[filters.preset].description}</span>
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
