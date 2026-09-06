import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import {
  summariseCorridors,
  WORMHOLE_CHAIN_NAMES,
  type BridgeSource,
  type Corridor,
} from "./shared";

/**
 * Wormhole adapter — the widest complete corridor matrix available, net of
 * Mayan.
 *
 * `/x-chain-activity` returns, for every source chain, the notional volume out
 * to each destination: around 39 chains and 275 directed routes, free and
 * unauthenticated.
 *
 * ## Mayan, and why part of it is subtracted here
 *
 * Mayan's swaps partly ride Wormhole messages, so some of Mayan's volume shows
 * up in this matrix tagged with the MAYAN app id — about $240M of $720M in a
 * recent month, which is roughly 40% of what Mayan itself reports. The rest of
 * Mayan settles through its own solvers and never touches Wormhole. So neither
 * "Mayan is inside Wormhole" nor "the two are independent" is true, and an
 * earlier version that excluded Mayan altogether, on the strength of one
 * corridor that happened to match, lost most of Mayan's flow; Monad, where
 * Mayan carries three times what Artemis sees, is what exposed it.
 *
 * The combined view therefore counts Mayan from Mayan's own matrix and removes
 * the Mayan-tagged share from this one, per source chain, read from the
 * `/x-chain-activity/tops` endpoint with and without `appId=MAYAN`. If that
 * read fails the matrix is used whole and the note says so.
 */

const API = "https://api.wormholescan.io/api/v1";
const WINDOW_DAYS = 30;

interface RawDestination {
  chain?: number | string;
  volume?: string | number;
}

interface RawSource {
  chain?: number | string;
  volume?: string | number;
  destinations?: RawDestination[];
}

interface RawTop {
  emitter_chain?: number | string;
  volume?: string | number;
}

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Share of each source chain's Wormhole volume that is tagged as Mayan, 0–1.
 * Both reads use the same unit, whatever it is, so only the ratio is trusted.
 */
async function fetchMayanShareBySource(
  from: Date,
  to: Date,
): Promise<Record<string, number>> {
  const range = `from=${iso(from)}&to=${iso(to)}&timespan=1d&by=notional`;
  const [all, tagged] = await Promise.all([
    fetchJson<RawTop[]>(`${API}/x-chain-activity/tops?${range}`, {
      timeoutMs: 30_000,
    }),
    fetchJson<RawTop[]>(`${API}/x-chain-activity/tops?${range}&appId=MAYAN`, {
      timeoutMs: 30_000,
    }),
  ]);
  const sum = (rows: RawTop[] | null | undefined) => {
    const out = new Map<string, number>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row.emitter_chain ?? "");
      const volume = Number(row.volume);
      if (!id || !Number.isFinite(volume)) continue;
      out.set(id, (out.get(id) ?? 0) + volume);
    }
    return out;
  };
  const total = sum(all);
  const mayan = sum(tagged);
  const share: Record<string, number> = {};
  for (const [id, volume] of total) {
    if (volume > 0) share[id] = Math.min(1, (mayan.get(id) ?? 0) / volume);
  }
  return share;
}

export function fetchWormholeFlows() {
  return cachedValue(
    "bridge:wormhole",
    { ttlSeconds: 1800, staleSeconds: 21_600 },
    async (): Promise<BridgeSource> => {
      const end = new Date();
      const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
      const [raw, mayanShare] = await Promise.all([
        fetchJson<{ txs?: RawSource[] }>(
          `${API}/x-chain-activity?timeSpan=${WINDOW_DAYS}d&by=notional`,
          { timeoutMs: 30_000 },
        ),
        fetchMayanShareBySource(start, end).catch((error: unknown) => {
          console.warn(
            "[source:wormhole] Mayan share unavailable —",
            error instanceof Error ? error.message : error,
          );
          return null;
        }),
      ]);

      const corridors: Corridor[] = [];
      let grossUsd = 0;
      let removedUsd = 0;

      for (const source of raw.txs ?? []) {
        const from = WORMHOLE_CHAIN_NAMES[String(source.chain)];
        if (!from) continue;
        const keep = 1 - (mayanShare?.[String(source.chain)] ?? 0);

        for (const destination of source.destinations ?? []) {
          const to = WORMHOLE_CHAIN_NAMES[String(destination.chain)];
          if (!to || to === from) continue;

          const gross = Number(destination.volume);
          if (!Number.isFinite(gross) || gross <= 0) continue;
          grossUsd += gross;
          removedUsd += gross * (1 - keep);

          const volumeUsd = gross * keep;
          if (volumeUsd > 0) corridors.push({ from, to, volumeUsd });
        }
      }

      corridors.sort((a, b) => b.volumeUsd - a.volumeUsd);
      const { byChain, totalVolumeUsd } = summariseCorridors(corridors);

      return {
        id: "wormhole",
        label: "Wormhole",
        note: mayanShare
          ? `Transfers carried by Wormhole messaging, less the ${grossUsd > 0 ? Math.round((100 * removedUsd) / grossUsd) : 0}% tagged as Mayan's, which is counted under Mayan.`
          : "Transfers carried by Wormhole messaging. The Mayan-tagged share could not be read this run, so Mayan's Wormhole legs may be counted twice.",
        windowDays: WINDOW_DAYS,
        totalVolumeUsd,
        corridors,
        byChain,
        chainCount: byChain.length,
        partialMatrix: false,
      };
    },
  );
}
