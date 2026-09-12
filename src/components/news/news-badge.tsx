import {
  NEWS_CATEGORIES,
  type NewsCategory,
} from "~/server/domain/news-classify";

/**
 * What kind of news a headline is.
 *
 * The badge names the event — "Exploit", "Listing", "Price up" — rather than
 * calling the headline bullish or bearish. That is not hedging: a headline
 * reliably says what happened and unreliably says what it means for the price,
 * and the classifier was measured doing both. Naming the event is the half it
 * gets right, and the tint carries the direction without the interface claiming
 * to have read the article.
 *
 * Tone uses the **status** tokens, not the diverging pair. Blue and red are
 * reserved across this app for cheap and expensive, and a headline is neither.
 * Status colour is allowed here because the badge always carries its own words,
 * so nothing rests on the colour alone.
 */
export function NewsBadge({ category }: { category: NewsCategory | null }) {
  if (!category) return null;

  const { label, tone } = NEWS_CATEGORIES[category];
  const color =
    tone === "negative" ? "var(--color-critical)" : "var(--color-good)";

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      <span
        className="size-1 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
