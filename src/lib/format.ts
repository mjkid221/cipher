/** Number and date formatting. Kept in one place so the UI reads consistently. */

const MINUS = "−"; // true minus sign, not a hyphen

export function formatUsd(
  value: number | null | undefined,
  options: { precise?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";

  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";

  if (options.precise && abs < 1000) {
    return `${sign}$${abs.toLocaleString("en-US", {
      maximumFractionDigits: abs < 1 ? 4 : 2,
    })}`;
  }

  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e11 ? 0 : 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Axis ticks on a log scale sit on exact powers of ten, where the general
 * formatter's two decimal places read as noise ("$1.00B" instead of "$1B").
 */
export function formatUsdAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(abs / 1e12).toFixed(0)}T`;
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(0)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatPercent(
  value: number | null | undefined,
  options: { digits?: number; signed?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  const { digits = 1, signed = true } = options;
  const sign = value > 0 ? (signed ? "+" : "") : value < 0 ? MINUS : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/** Valuation multiples: `184×`, `1.2k×`, `0.32×`. */
export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k×`;
  if (value >= 100) return `${value.toFixed(0)}×`;
  if (value >= 10) return `${value.toFixed(1)}×`;
  return `${value.toFixed(2)}×`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return value.toFixed(0);
}

/** Signed value gap: `+58`, `−31`. */
export function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded)}`;
}

export function formatSigma(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  const sign = value > 0 ? "+" : value < 0 ? MINUS : "";
  return `${sign}${Math.abs(value).toFixed(2)}σ`;
}

export function formatAge(seconds: number): string {
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 7200) return "1 hour ago";
  return `${Math.round(seconds / 3600)} hours ago`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Join names into readable prose: "a", "a and b", "a, b and c".
 *
 * `Array.join(" and ")` gives "a and b and c" once there are three, which is
 * what the flow panel was printing for its three route sources.
 */
export function formatList(
  items: readonly string[],
  conjunction: "and" | "or" = "and",
): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

/** Days to a readable span: "today", "38d", "7mo", "1y 4mo". */
export function formatDuration(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return "—";
  if (days < 1) return "today";
  if (days < 60) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30.44)}mo`;
  const years = Math.floor(days / 365.25);
  const months = Math.round((days - years * 365.25) / 30.44);
  if (months >= 12) return `${years + 1}y`;
  return months === 0 ? `${years}y` : `${years}y ${months}mo`;
}

/** A chart x-axis label for an epoch-ms timestamp, at the given span. */
export function formatAxisDate(
  ms: number,
  span: "years" | "months" | "days",
): string {
  const date = new Date(ms);
  const options: Intl.DateTimeFormatOptions =
    span === "years"
      ? { year: "numeric", timeZone: "UTC" }
      : span === "months"
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

/** Plain integer with thousands separators: "84,463". */
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(
    value,
  );
}

/** "Oct–Nov 2026", "Sep 2029 – Feb 2030", or "Oct 2026" when from and to agree. */
export function formatMonthRange(fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC",
    }).format(d);
  const fy = f.getUTCFullYear();
  const ty = t.getUTCFullYear();
  if (fy === ty && f.getUTCMonth() === t.getUTCMonth())
    return `${month(f)} ${fy}`;
  if (fy === ty) return `${month(f)}–${month(t)} ${fy}`;
  return `${month(f)} ${fy} – ${month(t)} ${ty}`;
}

/** "Oct 2025". */
export function formatMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}
