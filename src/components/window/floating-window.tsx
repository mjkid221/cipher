"use client";

import { Maximize2, Minus, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "~/lib/cn";
import { WindowProgress } from "./window-progress";

/**
 * A draggable, minimisable window that floats over the page.
 *
 * The screen this app is built around is a single dense ranking, and anything
 * stacked underneath it goes unread — nobody scrolls past the table. Material
 * that is worth having but is not the main question therefore lives here
 * instead: summoned from the header, moved out of the way rather than closed,
 * and left open while the reader keeps working on the page behind it.
 *
 * Below `MOBILE_BREAKPOINT` it renders as a full-height sheet. Dragging a window
 * around a phone screen is a desktop metaphor imported somewhere it does not
 * work.
 */

const MOBILE_BREAKPOINT = 900;
const TITLE_BAR_HEIGHT = 38;
/** Keep at least this much of the title bar on screen when dragging. */
const KEEP_VISIBLE = 120;

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StoredState extends WindowGeometry {
  maximized: boolean;
}

function readStored(key: string): StoredState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
      maximized: Boolean(parsed.maximized),
    };
  } catch {
    // Private browsing, cleared storage, or a blocked accessor. Not worth
    // failing the window over.
    return null;
  }
}

export function FloatingWindow({
  title,
  subtitle,
  open,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  storageKey,
  defaultSize = { width: 1060, height: 660 },
  loading = false,
  loadEstimateMs,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  open: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  /** Where to remember position and size between visits. */
  storageKey: string;
  defaultSize?: { width: number; height: number };
  /**
   * True while this window's data is in flight. Every window gets the loading
   * bar from here rather than building its own, so a new window declares one
   * prop and is done.
   */
  loading?: boolean;
  /** Expected load time, used until this window has completed one. */
  loadEstimateMs?: number;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  /**
   * Whether this window is the thing being used.
   *
   * A real window manager dims what you are not working in, and the reason
   * translates: this floats over a dense ranking, and an opaque panel sitting on
   * top of the table you are trying to read is in the way. Interacting with the
   * page behind — a click, a focus, a
   * scroll — fades it back; touching the window brings it forward.
   */
  const [active, setActive] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [geometry, setGeometry] = useState<WindowGeometry | null>(null);

  const dragState = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  /**
   * A mirror of `geometry` that is always current.
   *
   * The drag and resize handlers are created once per render and close over the
   * geometry as it was when the gesture *started*, so persisting from them wrote
   * the pre-drag position back to storage and the window forgot every move.
   */
  const geometryRef = useRef<WindowGeometry | null>(null);
  geometryRef.current = geometry;

  /** Single writer for geometry, so the ref is correct before the next render. */
  const applyGeometry = useCallback((next: WindowGeometry) => {
    geometryRef.current = next;
    setGeometry(next);
  }, []);

  /* ---- mount, viewport class, restore remembered geometry ---- */

  useEffect(() => {
    setMounted(true);

    const applyViewport = () =>
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  useEffect(() => {
    if (!mounted || geometry) return;

    const stored = readStored(storageKey);
    const width = Math.min(
      stored?.width ?? defaultSize.width,
      window.innerWidth - 32,
    );
    const height = Math.min(
      stored?.height ?? defaultSize.height,
      window.innerHeight - 96,
    );

    setMaximized(stored?.maximized ?? false);
    applyGeometry({
      // Default position sits it below the header, right of centre, so the
      // ranking underneath stays partly readable.
      x: clamp(
        stored?.x ?? Math.max(16, window.innerWidth - width - 48),
        0,
        Math.max(0, window.innerWidth - KEEP_VISIBLE),
      ),
      y: clamp(stored?.y ?? 84, 0, Math.max(0, window.innerHeight - 60)),
      width,
      height,
    });
  }, [
    mounted,
    geometry,
    storageKey,
    defaultSize.width,
    defaultSize.height,
    applyGeometry,
  ]);

  const persist = useCallback(
    (next: WindowGeometry, isMaximized: boolean) => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ ...next, maximized: isMaximized }),
        );
      } catch {
        /* storage unavailable; the window still works, it just forgets */
      }
    },
    [storageKey],
  );

  /* ---- dragging, via pointer capture so it survives fast movement ---- */

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (maximized || isMobile || !geometry) return;
    // Let the control buttons in the title bar do their own thing.
    if ((event.target as HTMLElement).closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      dx: event.clientX - geometry.x,
      dy: event.clientY - geometry.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag?.pointerId !== event.pointerId) return;

    const current = geometryRef.current;
    if (!current) return;

    applyGeometry({
      ...current,
      x: clamp(
        event.clientX - drag.dx,
        KEEP_VISIBLE - current.width,
        window.innerWidth - KEEP_VISIBLE,
      ),
      y: clamp(
        event.clientY - drag.dy,
        0,
        window.innerHeight - TITLE_BAR_HEIGHT,
      ),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    const current = geometryRef.current;
    if (current) persist(current, maximized);
  };

  /* ---- keyboard ---- */

  useEffect(() => {
    if (!open || minimized) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMinimize();
    };

    // Pointer *down* rather than click: the window should fade the moment you
    // reach past it, not after whatever you clicked has finished.
    const onPointerDown = (event: Event) => {
      const inside = frameRef.current?.contains(event.target as Node) ?? false;
      setActive(inside);
    };
    const onFocusIn = (event: FocusEvent) => {
      const inside = frameRef.current?.contains(event.target as Node) ?? false;
      setActive(inside);
    };

    // Scrolling the page behind the window is reaching past it as much as a
    // click is. A wheel event whose target is outside the frame fades it;
    // scrolling inside the window's own body does not.
    const onWheel = (event: WheelEvent) => {
      const inside = frameRef.current?.contains(event.target as Node) ?? false;
      if (!inside) setActive(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("wheel", onWheel, {
      passive: true,
      capture: true,
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [open, minimized, onMinimize]);

  // Reopening should always come forward.
  useEffect(() => {
    if (open && !minimized) setActive(true);
  }, [open, minimized]);

  if (!mounted || !open) return null;

  /* ---- minimised: a dock strip at the bottom, the way a real one behaves ---- */

  if (minimized) {
    return createPortal(
      <button
        type="button"
        onClick={onRestore}
        className="panel fixed bottom-4 left-1/2 z-80 flex -translate-x-1/2 items-center gap-3 py-2 pr-2 pl-4 shadow-2xl shadow-black/60 transition-colors hover:bg-[var(--color-raised)]"
        style={{ background: "var(--color-overlay)" }}
      >
        <span className="flex items-center gap-2 text-[12.5px] font-medium">
          <span
            className="size-1.5 rounded-full"
            style={{ background: "var(--color-series-1)" }}
            aria-hidden
          />
          {title}
        </span>
        <span className="text-ink-faint text-[11px]">click to reopen</span>
        <span
          className="border-hairline text-ink-muted rounded-md border px-1.5 py-1"
          aria-hidden
        >
          <Maximize2 className="size-3" />
        </span>
      </button>,
      document.body,
    );
  }

  // Maximised means the whole viewport, header included: a window that leaves
  // the page visible around its edges is not maximised, it is merely large.
  const style: React.CSSProperties =
    isMobile || maximized
      ? { inset: isMobile ? "56px 0 0 0" : 0 }
      : {
          left: geometry?.x ?? 0,
          top: geometry?.y ?? 0,
          width: geometry?.width ?? defaultSize.width,
          height: geometry?.height ?? defaultSize.height,
        };

  return createPortal(
    <div
      ref={frameRef}
      role="dialog"
      aria-label={typeof title === "string" ? title : "Panel"}
      onPointerDown={() => setActive(true)}
      className={cn(
        "panel fixed z-80 flex flex-col overflow-hidden shadow-2xl shadow-black/70",
        "transition-[opacity,box-shadow] duration-200",
        isMobile && "rounded-t-[14px] rounded-b-none",
        // Full screen has no corners to round and must sit above the sticky
        // header, which otherwise shows through along the top edge.
        maximized && !isMobile && "z-100 rounded-none shadow-none",
        // Faded but still legible, and still fully interactive — one click
        // brings it back rather than having to re-open it.
        !active && !isMobile && "opacity-45 shadow-none hover:opacity-90",
      )}
      style={{ ...style, background: "var(--color-surface)" }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => {
          if (isMobile) return;
          const next = !maximized;
          setMaximized(next);
          const current = geometryRef.current;
          if (current) persist(current, next);
        }}
        className={cn(
          "border-hairline flex shrink-0 items-center gap-3 border-b px-3.5 select-none",
          !isMobile && !maximized && "cursor-grab active:cursor-grabbing",
        )}
        style={{ height: TITLE_BAR_HEIGHT, background: "var(--color-raised)" }}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate text-[12.5px] font-semibold tracking-tight">
            {title}
          </span>
          {subtitle && (
            <span className="text-ink-muted hidden truncate text-[11.5px] sm:block">
              {subtitle}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <TitleButton label="Minimise" onClick={onMinimize}>
            <Minus className="size-3.5" />
          </TitleButton>
          {!isMobile && (
            <TitleButton
              label={maximized ? "Restore size" : "Maximise"}
              onClick={() => {
                const next = !maximized;
                setMaximized(next);
                const current = geometryRef.current;
                if (current) persist(current, next);
              }}
            >
              {maximized ? (
                <Minimize2 className="size-3" />
              ) : (
                <Maximize2 className="size-3" />
              )}
            </TitleButton>
          )}
          <TitleButton label="Close" onClick={onClose} danger>
            <X className="size-3.5" />
          </TitleButton>
        </div>
      </div>

      <WindowProgress
        loading={loading}
        storageKey={storageKey}
        estimateMs={loadEstimateMs}
      />

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

      {/* resize grip, bottom-right, desktop only */}
      {!isMobile && !maximized && geometry && (
        <ResizeGrip
          onResize={(dx, dy) => {
            const current = geometryRef.current;
            if (!current) return;
            applyGeometry({
              ...current,
              width: clamp(current.width + dx, 520, window.innerWidth - 32),
              height: clamp(current.height + dy, 320, window.innerHeight - 32),
            });
          }}
          onCommit={() => {
            const current = geometryRef.current;
            if (current) persist(current, maximized);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function TitleButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "text-ink-muted grid size-6 place-items-center rounded-md transition-colors",
        danger
          ? "hover:bg-[color-mix(in_oklab,var(--color-critical)_22%,transparent)] hover:text-[var(--color-critical)]"
          : "hover:bg-overlay hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ResizeGrip({
  onResize,
  onCommit,
}: {
  onResize: (dx: number, dy: number) => void;
  onCommit: () => void;
}) {
  const last = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        last.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!last.current) return;
        onResize(
          event.clientX - last.current.x,
          event.clientY - last.current.y,
        );
        last.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        last.current = null;
        onCommit();
      }}
      className="absolute right-0 bottom-0 size-4 cursor-nwse-resize"
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="size-full opacity-40">
        <path
          d="M15 7 L7 15 M15 11 L11 15"
          stroke="var(--color-ink-muted)"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
