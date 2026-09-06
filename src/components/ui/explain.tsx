"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "~/lib/cn";
import {
  GLOSSARY,
  type GlossaryEntry,
  type GlossaryTerm,
} from "~/lib/glossary";

const PANEL_WIDTH = 300;
const GAP = 8;
const EDGE = 10;

/** Long enough that sweeping the pointer across a row does not flash panels. */
const OPEN_DELAY = 120;
/** Long enough to cross the gap between the icon and the panel. */
const CLOSE_DELAY = 180;

/**
 * The definition affordance.
 *
 * Every piece of jargon in the interface carries one of these. It opens on
 * hover for a mouse, on focus for a keyboard, and on tap for touch — where
 * there is no hover to use.
 *
 * The close delay is the part that matters. There is a gap between the icon and
 * the panel, and the panel is worth reaching: it holds the formula and a worked
 * example, and its text is selectable. Closing on the first `pointerleave` would
 * make it unreachable, so trigger and panel share one timer and entering either
 * one cancels a pending close.
 *
 * The panel is portalled to the body because these sit inside cards with
 * `overflow-hidden` and inside the table's horizontal scroll container, both of
 * which clipped it in half when it rendered inline.
 */
export function Explain({
  term,
  className,
  side = "bottom",
}: {
  term: GlossaryTerm;
  className?: string;
  /** Preferred side. Flips automatically when there is no room. */
  side?: "top" | "bottom";
}) {
  // Widen from the `as const` literal type, so optional fields are readable
  // on every entry rather than only the ones that happen to declare them.
  const entry: GlossaryEntry = GLOSSARY[term];

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  useEffect(() => setMounted(true), []);

  /* ---- one timer, shared by the trigger and the panel ---- */

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  }, [cancel]);

  const scheduleClose = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, [cancel]);

  const closeNow = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  // Dropping the coordinates on close stops a fast re-hover painting one frame
  // at the previous position.
  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);

  /* ---- placement ---- */

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = panelRef.current?.offsetHeight ?? 280;

    const roomBelow = window.innerHeight - rect.bottom;
    const openDown =
      side === "bottom"
        ? roomBelow > estimatedHeight + GAP || roomBelow > rect.top
        : rect.top < estimatedHeight + GAP;

    setPosition({
      top: openDown
        ? rect.bottom + GAP
        : Math.max(EDGE, rect.top - estimatedHeight - GAP),
      left: Math.min(
        Math.max(EDGE, rect.left + rect.width / 2 - PANEL_WIDTH / 2),
        window.innerWidth - PANEL_WIDTH - EDGE,
      ),
    });
  }, [side]);

  useEffect(() => {
    if (!open) return;

    place();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNow();
    };
    // Still needed for the tap-to-open path, which has no pointerleave.
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeNow();
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place, closeNow]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Definition: ${entry.title}`}
        aria-describedby={open ? panelId : undefined}
        onPointerEnter={(event) => {
          // Touch fires pointerenter immediately before the tap; letting it
          // through would open and then the click would close it again.
          if (event.pointerType === "mouse") scheduleOpen();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
        onFocus={() => {
          cancel();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          cancel();
          setOpen((value) => !value);
        }}
        className={cn(
          "text-ink-faint hover:text-ink-secondary inline-flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors",
          open && "text-ink",
          className,
        )}
      >
        <Info className="size-3" aria-hidden />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            onPointerEnter={cancel}
            onPointerLeave={scheduleClose}
            onClick={(event) => event.stopPropagation()}
            className="panel fixed z-100 cursor-default p-3.5 text-left font-normal tracking-normal normal-case shadow-2xl shadow-black/70"
            style={{
              width: PANEL_WIDTH,
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              background: "var(--color-overlay)",
              visibility: position ? "visible" : "hidden",
            }}
          >
            <p className="text-ink text-[12.5px] font-semibold tracking-tight">
              {entry.title}
            </p>
            <p className="text-ink-secondary mt-1.5 text-[12px] leading-relaxed">
              {entry.short}
            </p>

            {entry.long.split("\n\n").map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="text-ink-muted mt-2 text-[11.5px] leading-relaxed"
              >
                {paragraph}
              </p>
            ))}

            {entry.formula && (
              <div className="border-hairline mt-2.5 border-t pt-2">
                <p className="text-ink-faint text-[10px] tracking-wide uppercase">
                  How it is worked out
                </p>
                <p className="text-ink-secondary mt-1 text-[11.5px] leading-relaxed">
                  {entry.formula}
                </p>
              </div>
            )}

            {entry.example && (
              <div className="border-hairline mt-2.5 border-t pt-2">
                <p className="text-ink-faint text-[10px] tracking-wide uppercase">
                  For example
                </p>
                <p className="text-ink-secondary mt-1 text-[11.5px] leading-relaxed">
                  {entry.example}
                </p>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A label with its definition attached. Keeps the pairing consistent. */
export function LabelWithExplain({
  children,
  term,
  side,
  className,
}: {
  children: React.ReactNode;
  term: GlossaryTerm;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {children}
      <Explain term={term} side={side} />
    </span>
  );
}
