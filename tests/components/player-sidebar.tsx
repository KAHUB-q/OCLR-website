import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { TournamentShell } from "../../src/components/tournament-navigation";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";

const params = new URLSearchParams(location.search);
const locale = (params.get("locale") || "en") as "en" | "zh-Hans" | "zh-Hant";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance = "default";

function Preview() {
  const [path, setPath] = useState(
    params.get("path") || "/tournaments/s11/player/practice",
  );
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {},
    push: setPath,
    replace: setPath,
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value={path}>
        <SearchParamsContext.Provider value={params}>
          <NextIntlClientProvider
            locale={locale}
            messages={{ en, "zh-Hans": hans, "zh-Hant": hant }[locale]}
            timeZone="UTC"
          >
            <div
              className="themed-site private-site"
              onClickCapture={(event) => {
                // Simulate client routing without Next's complete browser runtime.
                const link = (event.target as Element).closest("a[href]");
                if (link) {
                  event.preventDefault();
                  setPath(link.getAttribute("href")!);
                }
              }}
            >
              <TournamentShell
                slug="s11"
                name={
                  params.has("longName")
                    ? "Synthetic tournament with a very long edition name"
                    : "OCLR Season 11"
                }
                liveDraft
                playerWorkspace={!params.has("captainOnly")}
                captainWorkspace={
                  params.has("captain") || params.has("captainOnly")
                    ? { scheduleRequests: true }
                    : undefined
                }
              >
                <h1>Workspace content</h1>
                <p data-pathname>{path}</p>
                <label className="field">
                  Unsaved input
                  <input defaultValue="Keep this draft" />
                </label>
                <button
                  type="button"
                  data-route-change
                  onClick={() =>
                    setPath("/tournaments/s11/player/availability")
                  }
                >
                  Simulate client navigation
                </button>
                {params.has("presenter") && <div className="presenter-view" />}
                {path.endsWith("/draft/overlay") && <div data-broadcast />}
              </TournamentShell>
            </div>
          </NextIntlClientProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
