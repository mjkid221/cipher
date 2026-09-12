import { cn } from "~/lib/cn";

/**
 * The two outbound brand marks, and where they point.
 *
 * Lucide ships neither, so both are inline paths. They live here rather than in
 * the footer that first needed them because the header carries the same pair —
 * and because the repository URL had already drifted once: it was still
 * `caliper` after the rename, which a second copy would have preserved.
 *
 * Each mark is decorative; every caller supplies the name in text or in an
 * `aria-label`, never colour or shape alone.
 */

export const SOCIAL = {
  github: {
    href: "https://github.com/mjkid221/alfa",
    label: "GitHub",
    title: "Source on GitHub",
  },
  x: {
    href: "https://x.com/mjkid0",
    label: "@mjkid0",
    title: "@mjkid0 on X",
  },
} as const;

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-3.5", className)}
      aria-hidden
      fill="currentColor"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.02 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

export function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-3.5", className)}
      aria-hidden
      fill="currentColor"
    >
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}
