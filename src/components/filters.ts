import type { ChainSnapshot } from "~/server/domain/types";

/**
 * One filter definition, shared by the chart and the table.
 *
 * Keeping this a pure function of (chains, filters) is what guarantees the
 * scatter and the ranking always describe the same slice — the most common way
 * a screen like this ends up quietly lying to its reader.
 */

export const PRESETS = {
  all: {
    label: "All chains",
    description: "Every chain in the universe, ranked by value gap.",
  },
  conviction: {
    label: "High conviction",
    description:
      "Undervalued, growing, and with enough data behind it to act on: at least 10 points undervalued, momentum in the top half, confidence ≥ 60%.",
  },
  value: {
    label: "Deep value",
    description: "The widest gaps between fundamentals and price.",
  },
  growth: {
    label: "Fastest growing",
    description: "Top-quartile 30-day growth in fees, capital and volume.",
  },
  expensive: {
    label: "Priced ahead",
    description: "Chains the market values well above their current activity.",
  },
} as const;

export type PresetKey = keyof typeof PRESETS;

/** Layer filter. "any" leaves unclassified chains in. */
export type LayerFilter = "any" | "L1" | "L2";

export interface Filters {
  preset: PresetKey;
  layer: LayerFilter;
  excludeValueTraps: boolean;
  onlyInvestable: boolean;
  query: string;
}

export const DEFAULT_FILTERS: Filters = {
  preset: "all",
  layer: "any",
  excludeValueTraps: false,
  // Off by default: chains without a token are shown with their own badge
  // rather than hidden, since their fundamentals are the point of showing them.
  onlyInvestable: false,
  query: "",
};

function matchesPreset(chain: ChainSnapshot, preset: PresetKey): boolean {
  const { mispricing, momentum, confidence } = chain.scores;

  switch (preset) {
    case "all":
      return true;
    case "conviction":
      return (
        chain.investable &&
        !chain.valueTrapRisk &&
        (mispricing ?? -Infinity) >= 10 &&
        (momentum ?? 0) >= 50 &&
        confidence >= 0.6
      );
    case "value":
      return (
        (chain.tier === "deep-value" || chain.tier === "undervalued") &&
        confidence >= 0.5
      );
    case "growth":
      return (momentum ?? 0) >= 70;
    case "expensive":
      return (mispricing ?? Infinity) <= -15;
  }
}

export function applyFilters(
  chains: readonly ChainSnapshot[],
  filters: Filters,
): ChainSnapshot[] {
  const needle = filters.query.trim().toLowerCase();

  return chains.filter((chain) => {
    // A chain CoinGecko does not classify is excluded from both sides rather
    // than being guessed into one. Appchains and validiums genuinely fit
    // neither label.
    if (filters.layer !== "any" && chain.layer !== filters.layer) return false;
    if (filters.onlyInvestable && !chain.investable) return false;
    if (filters.excludeValueTraps && chain.valueTrapRisk) return false;
    if (!matchesPreset(chain, filters.preset)) return false;

    if (needle) {
      const haystack = [chain.name, chain.symbol, chain.keys.llamaName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    return true;
  });
}
