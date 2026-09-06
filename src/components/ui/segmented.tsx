"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/cn";

/**
 * A segmented control: one selection, N options, and a single indicator that
 * travels between them.
 *
 * ## Why the indicator moves rather than being repainted
 *
 * The obvious build is to give the selected item a background and let the
 * others be transparent. It looks identical at rest and it is much simpler —
 * but selection then happens by two things blinking at once, and the reader has
 * to re-find where the selection went. One object sliding is *continuous*: the
 * eye tracks it, so you never lose your place, and the control reads as a
 * physical switch rather than a set of buttons that recolour.
 *
 * The indicator is a single absolutely-positioned element whose transform is
 * measured from the real DOM, which is what makes it correct for labels of
 * uneven width and through a resize or a font swap. Measuring is done in a
 * `ResizeObserver` rather than on selection, so the geometry is already known
 * before the transition starts and the first click animates like every
 * subsequent one.
 *
 * Keyboard behaviour follows the radio-group pattern, which is what this is:
 * arrows move *and* select, Home and End jump to the ends, and only the
 * selected option is in the tab order.
 *
 * ## Narrow screens
 *
 * The control scrolls sideways rather than wrapping. Wrapping is what the row
 * of chips this replaced used to do, and it cannot work here: the indicator is
 * positioned by horizontal offset alone, so a second line would leave it
 * stranded on the first. Scrolling also keeps the options in one continuous
 * sequence, which is what makes a segmented control readable as a single
 * choice. Without this the five presets were 531px wide inside a 414px
 * viewport and pushed the whole page sideways.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Native tooltip. Kept short; long explanations belong in an Explain popover. */
  hint?: string;
}

interface Indicator {
  left: number;
  width: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the group for assistive technology. */
  label: string;
  size?: "default" | "compact";
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<T, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const active = itemRefs.current.get(value);
    if (!list || !active) return;

    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    if (activeBox.width === 0) return;

    // The indicator is anchored at the list's padding edge (`left-0`), and the
    // rects are measured from its border edge, so the border width is removed.
    // Without both, the highlight sat one padding-plus-border to the right of
    // the option it marked and every label read off-centre.
    setIndicator({
      left: activeBox.left - listBox.left - list.clientLeft,
      width: activeBox.width,
    });
  }, [value]);

  useEffect(() => {
    measure();

    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;

    // Watching the list covers a viewport change, and watching each item covers
    // a label reflowing or a webfont arriving after first paint.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const node of itemRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [measure, options]);

  const move = (delta: number) => {
    const index = options.findIndex((option) => option.value === value);
    if (index === -1) return;
    const next = options[(index + delta + options.length) % options.length];
    if (next) {
      onChange(next.value);
      itemRefs.current.get(next.value)?.focus();
    }
  };

  const jump = (edge: "first" | "last") => {
    const next = edge === "first" ? options[0] : options[options.length - 1];
    if (next) {
      onChange(next.value);
      itemRefs.current.get(next.value)?.focus();
    }
  };

  return (
    <div className={cn("hide-scrollbar max-w-full overflow-x-auto", className)}>
      <div
        ref={listRef}
        role="radiogroup"
        aria-label={label}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
              event.preventDefault();
              move(1);
              break;
            case "ArrowLeft":
            case "ArrowUp":
              event.preventDefault();
              move(-1);
              break;
            case "Home":
              event.preventDefault();
              jump("first");
              break;
            case "End":
              event.preventDefault();
              jump("last");
              break;
          }
        }}
        className="border-hairline bg-surface relative isolate inline-flex rounded-full border p-[3px]"
      >
        {/* the travelling indicator */}
        {indicator && (
          <span
            aria-hidden
            className="bg-overlay absolute top-[3px] bottom-[3px] left-0 -z-10 rounded-full"
            style={{
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              width: indicator.width,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, #fff 7%, transparent), 0 1px 2px -1px rgb(0 0 0 / 0.5)",
              transition:
                "transform var(--dur-standard) var(--ease-emphasised), width var(--dur-standard) var(--ease-emphasised)",
            }}
          />
        )}

        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) itemRefs.current.set(option.value, node);
                else itemRefs.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={option.hint}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative rounded-full font-medium whitespace-nowrap transition-colors",
                size === "compact"
                  ? "px-2.5 py-1 text-[11.5px] max-sm:py-1.5"
                  : "px-3.5 py-1.5 text-[12.5px] max-sm:py-2",
                active ? "text-ink" : "text-ink-muted hover:text-ink-secondary",
              )}
              style={{ transitionDuration: "var(--dur-micro)" }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
