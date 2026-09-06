/**
 * Candidate models for where Bitcoin's cycle tops fall over time.
 *
 * Shared by the server (which fits and backtests them) and the client (which
 * draws them), so one evaluator serves both. Pure functions; no imports.
 *
 * Every model is a function of `x = ln(days since genesis)`; the premium model
 * also uses calendar time and the curve through the bottoms.
 *
 *   power-all      ln P = a + b·x                    straight line in log-log
 *   power-recent   the same, fitted to the last three tops only
 *   power-bend     ln P = a + b·x + c·x²             a line allowed to curve
 *   premium-decay  ln P = ln(bottom curve) + p + q·t  the top's premium over
 *                  the curve through the bottoms, decaying linearly in years
 */

export type TopModelId =
  "power-all" | "power-recent" | "power-bend" | "premium-decay";

export interface TopModel {
  id: TopModelId;
  label: string;
  /** Plain-English description of what the curve assumes. */
  assumes: string;
  formula: string;
  params: number[];
  /** Tops the final fit used. */
  fittedThrough: string[];
  /** Fit on tops before the fold's date, predict that top, compare. */
  backtests: {
    fold: string;
    predicted: number;
    actual: number;
    ratio: number;
  }[];
  /** Estimate at the next-top window, from the final fit. */
  nextTop: { priceLow: number; priceHigh: number } | null;
}

export interface BottomFitLike {
  a: number;
  b: number;
}

const GENESIS_MS = Date.parse("2009-01-03");
const DAY_MS = 86_400_000;

export function daysSinceGenesis(date: string | number): number {
  const ms = typeof date === "number" ? date : Date.parse(date);
  return (ms - GENESIS_MS) / DAY_MS;
}

/** Price the model gives on a day, given days since genesis. */
export function evalTopModel(
  model: { id: TopModelId; params: number[] },
  days: number,
  bottomFit: BottomFitLike | null,
): number | null {
  const x = Math.log(days);
  const [p0 = 0, p1 = 0, p2 = 0] = model.params;
  switch (model.id) {
    case "power-all":
    case "power-recent":
      return Math.exp(p0 + p1 * x);
    case "power-bend":
      return Math.exp(p0 + p1 * x + p2 * x * x);
    case "premium-decay":
      if (!bottomFit) return null;
      return Math.exp(
        bottomFit.a + bottomFit.b * x + p0 + (p1 * days) / 365.25,
      );
  }
}
