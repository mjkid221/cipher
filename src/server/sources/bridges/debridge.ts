import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";
import {
  DEBRIDGE_NAME_FIXES,
  summariseCorridors,
  type BridgeSource,
  type Corridor,
} from "./shared";

/**
 * deBridge adapter — a second complete matrix, from a protocol that does not
 * touch Wormhole.
 *
 * That independence is the point. Wormhole already contains Mayan, so those two
 * cannot be added together; deBridge's DLN settles its own orders, so its
 * volume is genuinely additional and the combined view is Wormhole + deBridge.
 *
 * The statistics endpoint returns one row per (source chain, destination chain,
 * day), which aggregates into a matrix. Chain ids are deBridge's own — EVM
 * chains keep their real id, everything else gets a synthetic one above
 * 100000000 — so the names come from their own registry rather than a table
 * here.
 */

const STATS = "https://stats-api.dln.trade/api";
const REGISTRY = "https://dln.debridge.finance/v1.0";
const WINDOW_DAYS = 30;

interface RawChainId {
  stringValue?: string;
}

interface RawDailyRow {
  giveChainId?: RawChainId;
  takeChainId?: RawChainId;
  totalAmountGivenUsd?: number;
}

/** deBridge chain id to its own chain name. */
function fetchChainNames() {
  return cachedValue(
    "bridge:debridge:chains",
    { ttlSeconds: 86_400, staleSeconds: 172_800 },
    async (): Promise<Record<string, string>> => {
      const raw = await fetchJson<{
        chains?: { chainId?: number | string; chainName?: string }[];
      }>(`${REGISTRY}/supported-chains-info`, { timeoutMs: 25_000 });

      const out: Record<string, string> = {};
      for (const chain of raw.chains ?? []) {
        if (chain.chainId === undefined || !chain.chainName) continue;
        const name = chain.chainName.trim();
        out[String(chain.chainId)] = DEBRIDGE_NAME_FIXES[name] ?? name;
      }
      return out;
    },
  );
}

export function fetchDebridgeFlows() {
  return cachedValue(
    "bridge:debridge",
    { ttlSeconds: 1800, staleSeconds: 21_600 },
    async (): Promise<BridgeSource> => {
      const end = new Date();
      const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);

      const [names, raw] = await Promise.all([
        fetchChainNames().catch((): Record<string, string> => ({})),
        fetchJson<{ dailyData?: RawDailyRow[] }>(
          `${STATS}/Satistics/getDaily?dateFrom=${start.toISOString()}&dateTo=${end.toISOString()}`,
          { timeoutMs: 60_000 },
        ),
      ]);

      const totals = new Map<string, Corridor>();

      for (const row of raw.dailyData ?? []) {
        const from = names[row.giveChainId?.stringValue ?? ""];
        const to = names[row.takeChainId?.stringValue ?? ""];
        if (!from || !to || from === to) continue;

        const volumeUsd = row.totalAmountGivenUsd;
        if (typeof volumeUsd !== "number" || !(volumeUsd > 0)) continue;

        const key = `${from} ${to}`;
        const existing = totals.get(key);
        if (existing) existing.volumeUsd += volumeUsd;
        else totals.set(key, { from, to, volumeUsd });
      }

      const corridors = [...totals.values()].sort(
        (a, b) => b.volumeUsd - a.volumeUsd,
      );
      const { byChain, totalVolumeUsd } = summariseCorridors(corridors);

      return {
        id: "debridge",
        label: "deBridge",
        note: "deBridge's DLN orders. Settles independently of Wormhole, so this volume is additional rather than overlapping.",
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
