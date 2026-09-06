import { formatDateTime } from "~/lib/format";
import type { AggregateMeta } from "~/server/domain/types";

export function SiteFooter({ meta }: { meta: AggregateMeta }) {
  return (
    <footer className="border-hairline mt-14 border-t">
      <div className="mx-auto max-w-[1560px] px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 className="text-[12.5px] font-semibold">
              Where the data comes from
            </h2>
            <ul className="mt-3 space-y-2">
              {meta.sources.map((source) => (
                <li key={source.id} className="text-[12px] leading-relaxed">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink hover:text-series-1 font-medium underline decoration-dotted underline-offset-2 transition-colors"
                  >
                    {source.label}
                  </a>
                  <span className="text-ink-muted"> — {source.note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-ink-muted space-y-1.5 text-[11.5px] lg:text-right">
            {/* Where the code lives and who made it. Brand marks are inline
                because lucide ships none; each link carries its name in text. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:justify-end">
              <a
                href="https://github.com/mjkid221/caliper"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-series-1 inline-flex min-h-8 items-center gap-1.5 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  aria-hidden
                  fill="currentColor"
                >
                  <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.02 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
                </svg>
                GitHub
              </a>
              <a
                href="https://x.com/mjkid0"
                target="_blank"
                rel="noreferrer"
                className="text-ink hover:text-series-1 inline-flex min-h-8 items-center gap-1.5 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  aria-hidden
                  fill="currentColor"
                >
                  <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
                </svg>
                @mjkid0
              </a>
            </div>
            <div>Snapshot {formatDateTime(meta.generatedAt)} UTC</div>
            <div className="tnum">
              {meta.universeSize} chains · {meta.ratedCount} rated
            </div>
            <div>
              Cache{" "}
              {meta.cache.enabled
                ? "Upstash Redis"
                : "in-process only — add Upstash credentials"}
            </div>
          </div>
        </div>

        <p className="text-ink-faint border-hairline mt-8 border-t pt-5 text-[11.5px] leading-relaxed">
          A research screen, not investment advice. Scores are relative to the
          chains listed here and move as the underlying data moves. Verify
          anything you would act on against the primary sources linked above.
        </p>
      </div>
    </footer>
  );
}
