"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The comparison window's selection, kept across refreshes.
 *
 * Which two chains you were comparing, and on which basis, is a setting rather
 * than a gesture — the same reasoning that persists the table's filters and not
 * its search box. See `filters-store.ts` for why rehydration is deferred to
 * after mount.
 *
 * Only slugs are stored, never a snapshot of the chains. A slug that has left
 * the universe (its TVL fell below the entry floor, say) is not sanitised away
 * here: the window resolves both slugs against the live payload and falls back
 * to the largest chain, which keeps this store ignorant of the universe.
 */

export type CapBasis = "circulating" | "fdv";

const BASES: readonly CapBasis[] = ["circulating", "fdv"];

interface CompareState {
  /** Left side: the chain being repriced. */
  a: string | null;
  /** Right side: the chain lending its market cap. */
  b: string | null;
  basis: CapBasis;
  setA: (slug: string) => void;
  setB: (slug: string) => void;
  swap: () => void;
  setBasis: (basis: CapBasis) => void;
}

function sanitiseSlug(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sanitiseBasis(value: unknown): CapBasis {
  return BASES.includes(value as CapBasis)
    ? (value as CapBasis)
    : "circulating";
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set) => ({
      a: null,
      b: null,
      basis: "circulating",
      setA: (slug) => set({ a: slug }),
      setB: (slug) => set({ b: slug }),
      swap: () => set((state) => ({ a: state.b, b: state.a })),
      setBasis: (basis) => set({ basis }),
    }),
    {
      name: "par.compare",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ a: state.a, b: state.b, basis: state.basis }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<
          Record<keyof CompareState, unknown>
        >;
        return {
          ...current,
          a: sanitiseSlug(saved.a),
          b: sanitiseSlug(saved.b),
          basis: sanitiseBasis(saved.basis),
        };
      },
    },
  ),
);
