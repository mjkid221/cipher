import { Screen } from "~/components/screen";
import { api, HydrateClient } from "~/trpc/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Home() {
  // Awaited, not streamed. Letting the prefetch resolve after the shell renders
  // means the server emits the loading state while the client — which receives
  // the resolved data with the payload — renders the table, and the two do not
  // match. Waiting costs nothing once the snapshot is cached and gives the first
  // paint real data.
  await Promise.all([
    api.chains.list.prefetch({
      minConfidence: 0,
      onlyInvestable: false,
      sort: "mispricing",
      direction: "desc",
    }),
    api.chains.methodology.prefetch(),
    // The indicator rail. Its sources carry a four-second deadline, so a cold
    // one degrades a tile rather than delaying the page.
    api.market.brief.prefetch(),
  ]);

  return (
    <HydrateClient>
      <Screen />
    </HydrateClient>
  );
}
