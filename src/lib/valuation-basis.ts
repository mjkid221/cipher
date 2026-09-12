/**
 * What "fully diluted" means in this app, in one place.
 *
 * Every ratio in the model divides *circulating* market cap, which is what you
 * can buy today and is also what quietly flatters any chain with a large unlock
 * ahead. This lets a reader ask the other question — what the ranking looks
 * like once every token that will exist is priced in — and get a complete
 * answer rather than a recoloured column.
 *
 * This file is the definition only, with no dependency on the scorer, so the
 * Compare window can share it without pulling the model into its bundle. The
 * re-ranking itself lives in `rebase-universe.ts`.
 *
 * ## What "fully diluted" means here, and what it does not
 *
 * CoinGecko's own `fully_diluted_valuation` is price × **total** supply, not the
 * hard cap, so for a capped token it understates the dilution it claims to
 * describe. Measured 12 September 2026: BNB Chain reads $97B against $147B at
 * its 200M cap, Aptos $0.74B against $1.28B, Morph 2.2× apart. So where a chain
 * publishes a maximum supply this uses price × max supply, and falls back to
 * CoinGecko's figure only where there is no cap to use.
 *
 * That mixes two denominators, and the interface says so per chain rather than
 * hiding it: 41 of the 69 tokened chains have a cap, and the other 28 —
 * Ethereum, Solana, Monad, TON among them — have no maximum supply at all, so
 * no fully diluted number exists for them and total supply is the honest floor.
 * `supplyOf` is what a label reads to say which one a row used.
 */

export type CapBasis = "circulating" | "diluted";

export const BASIS_META: Record<
  CapBasis,
  { label: string; short: string; hint: string }
> = {
  circulating: {
    label: "Circulating",
    short: "Circulating",
    hint: "Price × the tokens in circulation today. The float you can actually buy, and the basis the model ships with.",
  },
  diluted: {
    label: "Fully diluted",
    short: "Diluted",
    hint: "Price × every token that will exist — the maximum supply where a chain has one, total supply where it does not. Re-ranks the whole screen.",
  },
};

/**
 * What to call the valuation on screen.
 *
 * Every label that names the numerator reads this rather than hard-coding
 * "Market cap", so a screen priced on all of the supply cannot describe itself
 * as if it were priced on the float.
 */
export function capLabel(basis: CapBasis): string {
  return basis === "diluted" ? "Fully diluted value" : "Market cap";
}

/** The same, abbreviated, for a table header with a column to fit. */
export function capShort(basis: CapBasis): string {
  return basis === "diluted" ? "FDV" : "MC";
}

/** Which supply produced a chain's diluted valuation. */
export type DilutedSupply = "max" | "total";

export interface DilutedCap {
  value: number | null;
  supply: DilutedSupply | null;
}

/**
 * A chain's fully diluted valuation, and which supply it came from.
 *
 * Max supply first, because that is what "fully diluted" means. CoinGecko's
 * `fdv` is the fallback and counts total supply, which for an uncapped token is
 * every token that exists today rather than a promise about the end state.
 */
export function dilutedCapOf(source: {
  price: number | null;
  maxSupply: number | null;
  fdv: number | null;
}): DilutedCap {
  const { price, maxSupply, fdv } = source;

  if (price !== null && price > 0 && maxSupply !== null && maxSupply > 0) {
    return { value: price * maxSupply, supply: "max" };
  }
  if (fdv !== null && fdv > 0) return { value: fdv, supply: "total" };
  return { value: null, supply: null };
}
