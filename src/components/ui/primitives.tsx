"use client";

import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/cn";
import { formatPercent } from "~/lib/format";
import { deltaTone, TIER_META, type TierKey } from "~/lib/palette";

/* ---------------------------------------------------------------- avatar ---- */

export function ChainAvatar({
  name,
  logoUrl,
  brandColor,
  size = 28,
  className,
}: {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        // The brand colour lives here, on identity, and nowhere in the data marks.
        background: brandColor
          ? `color-mix(in oklab, ${brandColor} 22%, var(--color-raised))`
          : "var(--color-raised)",
        boxShadow: brandColor
          ? `inset 0 0 0 1px color-mix(in oklab, ${brandColor} 55%, transparent)`
          : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      {logoUrl && !failed ? (
        <Image
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          unoptimized
        />
      ) : (
        <span
          className="text-[9px] font-semibold tracking-tight"
          style={{ color: brandColor ?? "var(--color-ink-secondary)" }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ tier ---- */

export function TierBadge({
  tier,
  detail,
  className,
  compact = false,
}: {
  tier: TierKey;
  /** A qualifier after the label, e.g. the fundamentals grade of a token-less chain. */
  detail?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const meta = TIER_META[tier];
  // A glyph alone can say "undervalued" once the reader knows the ladder; it
  // cannot say "no token" or "no market data". Those two keep their words.
  const wordy = tier === "no-token" || tier === "unrated";
  const showLabel = !compact || wordy;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium whitespace-nowrap",
        className,
      )}
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 26%, transparent)`,
      }}
      title={meta.description}
    >
      {/* Glyph plus label, so the state never rests on hue alone. */}
      <span aria-hidden className="text-[9px] leading-none">
        {meta.glyph}
      </span>
      {showLabel && meta.label}
      {showLabel && detail && (
        <span className="text-ink-muted font-normal">· {detail}</span>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------- delta ---- */

export function Delta({
  value,
  className,
  digits = 1,
  showGlyph = true,
}: {
  value: number | null;
  className?: string;
  digits?: number;
  showGlyph?: boolean;
}) {
  const tone = deltaTone(value);

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 text-[12px]",
        className,
      )}
      style={{ color: tone.color }}
    >
      {showGlyph && tone.glyph && (
        <span aria-hidden className="text-[7px] leading-none">
          {tone.glyph}
        </span>
      )}
      {formatPercent(value, { digits })}
    </span>
  );
}

/* ------------------------------------------------------------ stat tiles ---- */

/* ----------------------------------------------------------------- panel ---- */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title ?? actions) && (
        <header className="border-hairline flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && (
              <h2 className="text-[14px] font-semibold tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-ink-muted mt-1 max-w-2xl text-[12.5px] leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------- collapsible ----- */

/**
 * A panel that stays out of the way until asked for.
 *
 * Used for the material that is worth having but does not belong in the reading
 * path: the methodology, and the cross-chain flow detail. Both are things a
 * reader wants occasionally and nobody wants competing with the ranking.
 */
export function CollapsiblePanel({
  title,
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  title: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("panel overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-raised flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
      >
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
          {summary && (
            <p className="text-ink-muted mt-1 max-w-3xl text-[12.5px] leading-relaxed">
              {summary}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "text-ink-muted size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-hairline border-t px-5 py-5">{children}</div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- count-up ----- */
