import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PickemAdmin } from "../../src/components/pickem-admin";
import en from "../../messages/en.json";
import "../../src/app/globals.css";

const active = new URLSearchParams(location.search).has("active");

createRoot(document.getElementById("root")!).render(
  <AppRouterContext value={{ refresh() {} } as AppRouterInstance}>
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Taipei">
      <PickemAdmin
        slug="synthetic-test"
        data={{
          title: "Synthetic Cup",
          published: true,
          settings: { enabled: true, version: 1 },
          rows: [
            {
              id: "fixture",
              label: "M1",
              roundId: "round",
              round: "Final",
              fixtureVersion: 3,
              timeZone: "Asia/Taipei",
              scheduledAt: "2040-01-05T20:00:00+08:00",
              home: "Home",
              away: "Away",
              reason: null,
              lastVoid: null,
              rules: {
                series: { type: "first_to", wins: 5 },
                tiedMapPolicy: "require_replay",
              },
              window: active
                ? {
                    id: "window",
                    version: 4,
                    closesAt: "2040-01-05T19:00:00+08:00",
                    scoreEnabled: false,
                    status: "open",
                    count: null,
                    result: null,
                  }
                : null,
            },
          ],
        }}
      />
    </NextIntlClientProvider>
  </AppRouterContext>,
);
