import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { EventPlayers } from "../../src/components/event-players";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/tournaments/[edition]/event-pages.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "light";
const players = Array.from({ length: 105 }, (_, index) => ({
  id: 841001 + index,
  name: `${index < 65 ? "Subset" : "Other"} Player ${String(index + 1).padStart(3, "0")}`,
  team: index < 65 ? "Synthetic Team A" : "Synthetic Team B",
  captain: false,
  rank: index + 1,
  pp: 10000 - index,
  bio: "Synthetic player biography for scroll regression.",
}));
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
createRoot(document.getElementById("root")!).render(
  <AppRouterContext value={router}>
    <SearchParamsContext value={params}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <main className="themed-site">
          <EventPlayers
            edition="synthetic"
            players={players}
            remote
            grouped
            preview={params.has("preview")}
          />
        </main>
      </NextIntlClientProvider>
    </SearchParamsContext>
  </AppRouterContext>,
);
