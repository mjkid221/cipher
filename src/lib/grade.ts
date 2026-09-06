/**
 * One word for a 0–100 fundamentals percentile, for the chains that have no
 * value gap to show. A number alone reads as a score out of a hundred; the
 * word says what the number means against the rest of the screen.
 */
export function fundamentalsGrade(
  score: number | null | undefined,
): string | null {
  if (score === null || score === undefined || !Number.isFinite(score))
    return null;
  if (score >= 80) return "strong fundamentals";
  if (score >= 60) return "solid fundamentals";
  if (score >= 40) return "moderate fundamentals";
  return "thin fundamentals";
}
