import { formatDateTime } from "~/lib/format";
import { GitHubMark, SOCIAL, XMark } from "~/components/ui/brand-marks";
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
              {[
                { ...SOCIAL.github, Mark: GitHubMark },
                { ...SOCIAL.x, Mark: XMark },
              ].map(({ href, label, Mark }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink hover:text-series-1 inline-flex min-h-8 items-center gap-1.5 transition-colors"
                >
                  <Mark />
                  {label}
                </a>
              ))}
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
