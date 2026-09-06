"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The loading bar for floating windows.
 *
 * **This bar is driven by elapsed time, not by server progress.** Nothing
 * upstream reports how far along a load is: a cold capital-flow build fans out
 * to dozens of third-party endpoints inside one request and returns when it
 * returns. So the percentage is a projection of how long this window's data
 * usually takes, not a count of work completed.
 *
 * What keeps it from being pure theatre is that the projection is calibrated
 * against reality. Each window records how long its last successful load
 * actually took and blends that into the estimate, so the second visit is
 * paced by the reader's own connection and cache state rather than by a
 * hardcoded guess. It also never runs past `CEILING` while waiting, which means
 * it cannot sit at 100% with nothing on screen — the one failure mode that
 * makes a progress bar actively misleading.
 */

/** Highest share the bar will show before the data has actually arrived. */
const CEILING = 0.9;
/** How long the completed bar stays at 100% before fading out. */
const SETTLE_MS = 340;
/**
 * Shape of the approach curve. The bar reaches ~82% of `CEILING` at exactly the
 * estimated duration, then keeps creeping, so an unusually slow load still
 * looks alive instead of stalling.
 */
const CURVE = 2.2;
/** Weight given to the newest observation when updating the estimate. */
const BLEND = 0.5;
/** Bounds on the remembered estimate, so one freak load cannot poison it. */
const MIN_ESTIMATE_MS = 400;
const MAX_ESTIMATE_MS = 30_000;

function readEstimate(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_ESTIMATE_MS, Math.max(MIN_ESTIMATE_MS, parsed));
  } catch {
    // Private browsing or a blocked accessor. The default estimate is fine.
    return fallback;
  }
}

function writeEstimate(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* best effort */
  }
}

export function WindowProgress({
  loading,
  storageKey,
  estimateMs = 6000,
}: {
  loading: boolean;
  /** Namespaced per window, so each one learns its own timing. */
  storageKey: string;
  /** Used until this window has completed a load once. */
  estimateMs?: number;
}) {
  const [percent, setPercent] = useState(0);
  const [visible, setVisible] = useState(false);

  const startedAt = useRef<number | null>(null);
  const estimate = useRef(estimateMs);
  const frame = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = `${storageKey}.loadMs`;

  useEffect(() => {
    estimate.current = readEstimate(key, estimateMs);
  }, [key, estimateMs]);

  useEffect(() => {
    const cancelFrame = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
    const cancelSettle = () => {
      if (settle.current !== null) clearTimeout(settle.current);
      settle.current = null;
    };

    if (loading) {
      cancelSettle();
      setVisible(true);
      startedAt.current = performance.now();

      const step = () => {
        const started = startedAt.current;
        if (started === null) return;
        const elapsed = performance.now() - started;
        const share =
          CEILING * (1 - Math.exp((-CURVE * elapsed) / estimate.current));
        setPercent(Math.min(CEILING, share));
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);

      return () => {
        cancelFrame();
      };
    }

    cancelFrame();

    // Nothing was in flight, so there is no completion to animate.
    if (startedAt.current === null) {
      setVisible(false);
      setPercent(0);
      return;
    }

    const took = performance.now() - startedAt.current;
    startedAt.current = null;
    writeEstimate(key, estimate.current * (1 - BLEND) + took * BLEND);

    setPercent(1);
    settle.current = setTimeout(() => {
      setVisible(false);
      setPercent(0);
    }, SETTLE_MS);

    return () => {
      cancelSettle();
    };
  }, [loading, key]);

  if (!visible) return null;

  const shown = Math.round(percent * 100);

  return (
    <div
      className="border-hairline flex shrink-0 items-center gap-2.5 border-b px-3.5 py-1.5"
      style={{ background: "var(--color-raised)" }}
    >
      <div
        className="bg-grid relative h-[3px] flex-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-label="Loading"
      >
        <div
          className="bg-series-1 absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${shown}%`,
            // Eased so the bar glides between animation frames rather than
            // stepping, and snaps quickly when the data finally lands.
            transition: percent === 1 ? "width 180ms ease-out" : "width 120ms linear",
          }}
        />
      </div>
      <span className="text-ink-faint tnum w-8 text-right text-[10.5px]">
        {shown}%
      </span>
    </div>
  );
}
