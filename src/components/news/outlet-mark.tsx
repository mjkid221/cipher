"use client";

import { useState } from "react";

/**
 * An outlet's mark beside a headline: its favicon at 32px, from Google's
 * keyless favicon endpoint, keyed by the publisher's domain.
 *
 * Google's RSS carries no article image and links through its own redirects,
 * so article photos would mean scraping a thousand publisher pages every
 * refresh; the outlet's mark is the one picture available per headline that
 * can be shown honestly. It is a plain `<img>` on purpose: the icons come from
 * hundreds of domains, are tiny, and must not pass through the Next image
 * optimiser, which would need every domain allow-listed and would re-encode
 * 64px icons on the server. When there is no domain, or the icon fails to
 * load, the outlet's initial keeps the row's shape.
 */
export function OutletMark({
  domain,
  name,
  className,
}: {
  domain: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "·").toUpperCase();

  return (
    <span
      className={`bg-raised border-hairline grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border ${className ?? ""}`}
      aria-hidden
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- hundreds of publisher domains, 64px icons: deliberately not routed through the Next image optimiser
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
          width={20}
          height={20}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-5"
        />
      ) : (
        <span className="text-ink-muted text-[12px] font-semibold">
          {initial}
        </span>
      )}
    </span>
  );
}
