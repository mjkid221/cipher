import type { ChainMetrics, ChainMultiples } from "./types";
import type { ScoreOutput } from "./score";

/**
 * The plain-language case for or against a chain.
 *
 * Pure by design, and deliberately outside `aggregate.ts`: the home screen can
 * re-rank the universe on fully diluted valuation without a round trip, and
 * when it does, the copy has to move with the numbers. Extracting this is what
 * stops a thesis reading "looks cheap on circulating supply" underneath a
 * ranking that is already pricing all of the supply.
 *
 * It takes the same figures the score does, so the words can never drift from
 * the model.
 */

export interface ThesisInput {
  name: string;
  metrics: ChainMetrics;
  multiples: ChainMultiples;
  score: ScoreOutput;
  medians: Record<string, number | null>;
  fundamentalRank: number | null;
  mcapRank: number | null;
  universeSize: number;
  /**
   * What the valuation is called, for the two lines that name it. Defaults to
   * the circulating basis the model ships with; the home screen passes "fully
   * diluted value" when it has re-priced the universe, so the copy cannot claim
   * to be reading a market cap the ranking is no longer using.
   */
  capNoun?: string;
}

const pct = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}%`;

const money = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

/**
 * The plain-language case for (or against) each chain. Deliberately built from
 * the same numbers the score uses, so the copy can never drift from the model.
 */
export function buildThesis({
  metrics,
  multiples,
  score,
  medians,
  fundamentalRank,
  mcapRank,
  universeSize,
  capNoun = "market cap",
}: ThesisInput): string[] {
  const lines: string[] = [];
  const { scores } = score;

  if (!score.investable) {
    lines.push(
      "No liquid native asset, so there is nothing to value. Shown for its fundamentals only.",
    );
  }

  if (
    fundamentalRank !== null &&
    mcapRank !== null &&
    score.investable &&
    mcapRank - fundamentalRank >= 4
  ) {
    lines.push(
      `Ranks #${fundamentalRank} of ${universeSize} on fundamentals but only #${mcapRank} by ${capNoun}.`,
    );
  }

  if (
    metrics.feesChange30d !== null &&
    metrics.priceChange30d !== null &&
    metrics.feesChange30d > 15 &&
    metrics.priceChange30d < 0
  ) {
    lines.push(
      `Fees ${pct(metrics.feesChange30d)} over 30 days while the token moved ${pct(metrics.priceChange30d)} — the divergence this screen looks for.`,
    );
  } else if (metrics.feesChange30d !== null && metrics.feesChange30d > 40) {
    lines.push(
      `Fee revenue ${pct(metrics.feesChange30d)} versus the prior 30 days.`,
    );
  }

  const feeMultiple = multiples.mcapToFees;
  const feeMedian = medians.mcapToFees ?? null;
  if (feeMultiple !== null && feeMedian !== null) {
    if (feeMultiple < feeMedian * 0.6) {
      lines.push(
        `Trades at ${feeMultiple.toFixed(0)}× annualised fees against a peer median of ${feeMedian.toFixed(0)}×.`,
      );
    } else if (feeMultiple > feeMedian * 2.5) {
      lines.push(
        `Trades at ${feeMultiple.toFixed(0)}× annualised fees, well above the ${feeMedian.toFixed(0)}× peer median.`,
      );
    }
  }

  if (multiples.mcapToTvl !== null && multiples.mcapToTvl < 1) {
    lines.push(
      `${capNoun[0]!.toUpperCase()}${capNoun.slice(1)} sits below the capital secured on the chain, at ${multiples.mcapToTvl.toFixed(2)}× TVL.`,
    );
  }

  if (metrics.rwaValue !== null && metrics.rwaValue > 100_000_000) {
    const growth =
      metrics.rwaChange30d !== null && Math.abs(metrics.rwaChange30d) > 10
        ? `, ${pct(metrics.rwaChange30d)} over 30 days`
        : "";
    lines.push(
      `Holds ${money(metrics.rwaValue)} of tokenised real-world assets${growth}.`,
    );
  }

  if (
    metrics.bridgeVolumeChange30d !== null &&
    metrics.bridgeVolumeChange30d > 50 &&
    (metrics.bridgeVolume30d ?? 0) > 10_000_000
  ) {
    lines.push(
      `Cross-chain volume into the chain ${pct(metrics.bridgeVolumeChange30d)} over 30 days, on ${money(metrics.bridgeVolume30d!)} bridged.`,
    );
  }

  if (
    metrics.routingNetUsd !== null &&
    Math.abs(metrics.routingNetUsd) > 500_000
  ) {
    lines.push(
      metrics.routingNetUsd > 0
        ? `Net ${money(metrics.routingNetUsd)} of cross-chain capital arrived over the last 30 days.`
        : `Net ${money(Math.abs(metrics.routingNetUsd))} of cross-chain capital left over the last 30 days.`,
    );
  }

  if (
    metrics.dilutionOverhang !== null &&
    metrics.dilutionOverhang >= 2 &&
    (scores.mispricing ?? 0) > 0
  ) {
    lines.push(
      `Looks cheap on circulating supply, but fully diluted value is ${metrics.dilutionOverhang.toFixed(1)}× the market cap, so most of the float is still to come.`,
    );
  }

  if (score.valueTrapRisk) {
    lines.push(
      "Cheap on the multiples, but the underlying activity is contracting. Classic value-trap shape.",
    );
  }

  if (
    scores.momentum !== null &&
    scores.momentum >= 75 &&
    scores.fundamental !== null &&
    scores.fundamental >= 60
  ) {
    lines.push(
      "Top-quartile growth on an already-large base, which is the rarer combination.",
    );
  }

  if (score.trendResidual !== null && Math.abs(score.trendResidual) >= 0.75) {
    const sigma = Math.abs(score.trendResidual).toFixed(1);
    lines.push(
      score.trendResidual < 0
        ? `Priced ${sigma}σ below the peer trend for its economic scale, on a fit that leaves wide error bars.`
        : `Priced ${sigma}σ above the peer trend for its economic scale.`,
    );
  }

  if (scores.confidence < 0.45) {
    lines.push(
      "Thin or incomplete data. Treat the score as directional rather than actionable.",
    );
  }

  if (lines.length === 0) {
    lines.push(
      "Fundamentals and valuation sit close to peer averages. No clear dislocation.",
    );
  }

  return lines.slice(0, 5);
}
