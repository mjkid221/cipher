import { NextResponse } from "next/server";

import { getSnapshot } from "~/server/domain/aggregate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Liveness plus a compact view of the model's output, useful for verifying a
 * deploy and for warming the cache from a cron job.
 */
export async function GET(request: Request) {
  const verbose = new URL(request.url).searchParams.has("verbose");
  const startedAt = Date.now();

  try {
    const { chains, meta } = await getSnapshot();

    const top = chains
      .filter((chain) => chain.investable && chain.scores.confidence >= 0.5)
      .slice(0, 10)
      .map((chain) => ({
        name: chain.name,
        tier: chain.tier,
        mispricing: round(chain.scores.mispricing),
        fundamental: round(chain.scores.fundamental),
        cheapness: round(chain.scores.cheapness),
        momentum: round(chain.scores.momentum),
        confidence: round(chain.scores.confidence, 2),
        marketCap: chain.metrics.marketCap,
        trendResidual: round(chain.trendResidual, 2),
        mcapToFees: round(chain.multiples.mcapToFees, 1),
        thesis: verbose ? chain.thesis : undefined,
      }));

    return NextResponse.json({
      ok: true,
      buildMs: Date.now() - startedAt,
      meta,
      coverage: {
        withMarketCap: chains.filter((c) => c.metrics.marketCap !== null).length,
        withFees: chains.filter((c) => c.metrics.fees30d !== null).length,
        withDexVolume: chains.filter((c) => c.metrics.dexVolume30d !== null).length,
        withStablecoins: chains.filter((c) => c.metrics.stablecoins !== null).length,
        withBridgeFlow: chains.filter((c) => c.metrics.bridgeNetUsd !== null).length,
        withActiveAddresses: chains.filter((c) => c.metrics.dau !== null).length,
        withArtemisIdentity: chains.filter((c) => c.keys.artemisId !== null).length,
      },
      top,
      /** Residual distribution, so the regression can be judged not assumed. */
      fitDiagnostics: (() => {
        const residuals = chains
          .map((c) => c.trendResidual)
          .filter((v): v is number => v !== null)
          .sort((a, b) => a - b);
        if (residuals.length === 0) return null;
        const at = (q: number) =>
          round(residuals[Math.floor(q * (residuals.length - 1))] ?? 0, 2);
        return {
          n: residuals.length,
          min: at(0),
          p25: at(0.25),
          median: at(0.5),
          p75: at(0.75),
          max: at(1),
          mean: round(
            residuals.reduce((s, v) => s + v, 0) / residuals.length,
            3,
          ),
        };
      })(),
      tiers: chains.reduce<Record<string, number>>((acc, c) => {
        acc[c.tier] = (acc[c.tier] ?? 0) + 1;
        return acc;
      }, {}),
      valueTraps: chains.filter((c) => c.valueTrapRisk).length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        buildMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}

function round(value: number | null, places = 0) {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
