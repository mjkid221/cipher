import type { CapBasis } from "~/stores/compare-store";

/**
 * The arithmetic behind the comparison window: what one chain's token would
 * cost at another chain's market cap, and how far each sits below its own high.
 *
 * Pure functions over two rows, so every figure on screen can be recomputed by
 * hand from the payload. Nothing here is scored; it is all hypothetical.
 *
 * ## Which numbers come from where, and why it matters
 *
 * Price and circulating market cap come from DefiLlama; supply, fully diluted
 * value and the all-time high come from CoinGecko. The two are fetched on
 * different schedules, so figures that mix them carry a little skew.
 *
 * `priceAtCap` is therefore written as `price × otherCap ÷ ownCap` rather than
 * `otherCap ÷ ownSupply`. Algebraically the same thing, but both factors then
 * come from the same source and the ratio is exact by construction. CoinGecko
 * supply is used only where there is no alternative: the market cap implied by
 * a past all-time high.
 *
 * ## The approximation that has to be labelled
 *
 * An all-time-high market cap is `athPrice × today's supply`. The supply on the
 * day of the high is not published by any free source, and for a token that has
 * been unlocking since, today's supply is larger — so the figure overstates
 * what the market actually paid at the time. Callers must say so; see the
 * captions in `compare-window.tsx`.
 */

export interface CompareSide {
  slug: string;
  name: string;
  symbol: string | null;
  price: number;
  marketCap: number;
  fdv: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  athPrice: number | null;
  athDate: string | null;
}

export interface Comparison {
  /** The valuation each side is measured on. */
  basis: CapBasis;
  capA: number | null;
  capB: number | null;
  /** B's valuation as a multiple of A's: what A's price would be multiplied by. */
  multiple: number | null;
  /** A's price if A were valued at B's market cap. */
  priceAtB: number | null;
  /** What A's price must be multiplied by to reclaim its own high. */
  athMultipleA: number | null;
  /** A's high priced at today's supply. An approximation; see the docblock. */
  athCapA: number | null;
  athCapB: number | null;
  /** A's price at the market cap B's own high implies. */
  priceAtBAth: number | null;
  multipleAtBAth: number | null;
  /** True when A has already passed the high CoinGecko has on record. */
  atOwnHigh: boolean;
  /** True when both sides are the same chain, so every multiple is 1. */
  sameChain: boolean;
}

const positive = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/** The valuation of one side on the chosen basis. */
export function capOf(side: CompareSide, basis: CapBasis): number | null {
  return positive(basis === "circulating" ? side.marketCap : side.fdv);
}

/** The supply the chosen basis counts. */
export function supplyOf(side: CompareSide, basis: CapBasis): number | null {
  return positive(
    basis === "circulating" ? side.circulatingSupply : side.totalSupply,
  );
}

/** A's price if A were valued at `cap`. Null when either valuation is missing. */
function priceAtCap(
  side: CompareSide,
  cap: number | null,
  basis: CapBasis,
): number | null {
  const own = capOf(side, basis);
  if (own === null || cap === null) return null;
  return (side.price * cap) / own;
}

/** The market cap a past high implies at today's supply. An approximation. */
function athCapOf(side: CompareSide, basis: CapBasis): number | null {
  const ath = positive(side.athPrice);
  const supply = supplyOf(side, basis);
  return ath === null || supply === null ? null : ath * supply;
}

export function compare(
  a: CompareSide,
  b: CompareSide,
  basis: CapBasis,
): Comparison {
  const capA = capOf(a, basis);
  const capB = capOf(b, basis);
  const athCapB = athCapOf(b, basis);
  const ath = positive(a.athPrice);

  return {
    basis,
    capA,
    capB,
    multiple: capA !== null && capB !== null ? capB / capA : null,
    priceAtB: priceAtCap(a, capB, basis),
    // The live price against the recorded high, rather than CoinGecko's own
    // percentage, which is up to six hours behind the price beside it.
    athMultipleA: ath === null ? null : ath / a.price,
    athCapA: athCapOf(a, basis),
    athCapB,
    priceAtBAth: priceAtCap(a, athCapB, basis),
    multipleAtBAth: capA !== null && athCapB !== null ? athCapB / capA : null,
    atOwnHigh: ath !== null && ath <= a.price,
    sameChain: a.slug === b.slug,
  };
}
