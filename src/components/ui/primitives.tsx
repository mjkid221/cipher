"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
  const initials = name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();

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
  className,
  compact = false,
}: {
  tier: TierKey;
  className?: string;
  compact?: boolean;
}) {
  const meta = TIER_META[tier];

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
      {!compact && meta.label}
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
      className={cn("tnum inline-flex items-center gap-1 text-[12px]", className)}
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

export function StatTile({
  label,
  value,
  hint,
  accent,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel relative overflow-hidden p-4", className)}>
      {accent && (
        <span
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          }}
          aria-hidden
        />
      )}
      <div className="text-ink-muted text-[11px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-2 text-[26px] leading-none font-semibold tracking-tight">
        {value}
      </div>
      {hint && <div className="text-ink-muted mt-2 text-[12px]">{hint}</div>}
      {children}
    </div>
  );
}

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
              <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
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

/* ------------------------------------------------------------- count-up ----- */

/**
 * Eases a number toward its target on first paint. Reduced-motion users get the
 * final value immediately.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }

    const from = 0;
    const start = performance.now();
    const duration = 700;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
