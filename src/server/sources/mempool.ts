import "server-only";

import { cachedValue } from "~/server/cache/cached";
import { fetchJson } from "~/server/lib/http";

/**
 * Bitcoin chain tip, from public block explorers. Both return a bare integer
 * with no key; two explorers are tried so one being down does not blank the
 * halving countdown.
 */

const TIP_SOURCES = [
  { id: "mempool", url: "https://mempool.space/api/blocks/tip/height" },
  { id: "blockstream", url: "https://blockstream.info/api/blocks/tip/height" },
] as const;

export function fetchBlockHeight() {
  return cachedValue(
    "btc:tip",
    // A block every ten minutes; five minutes keeps the countdown honest to
    // within a block without hammering the explorer.
    { ttlSeconds: 300, staleSeconds: 3600 },
    async (): Promise<{ height: number; source: string }> => {
      let lastError: unknown;
      for (const source of TIP_SOURCES) {
        try {
          const raw = await fetchJson<number | string>(source.url, {
            timeoutMs: 8000,
            retries: 0,
          });
          const height = Number(raw);
          if (Number.isFinite(height) && height > 800_000) {
            return { height, source: source.id };
          }
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("block height unavailable");
    },
  );
}
