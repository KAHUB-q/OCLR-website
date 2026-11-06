import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ArchiveImporter } from "../../src/components/archive-importer";
import en from "../../messages/en.json";
import { historicalArchive } from "../fixtures/historical-archive";

const staffArchive = new URLSearchParams(location.search).has("staff")
  ? {
      ...historicalArchive,
      staff: historicalArchive.staff.map((person) => ({
        ...person,
        osuId: null,
      })),
    }
  : undefined;

const router: AppRouterInstance = {
  back() {},
  forward() {},
  push() {},
  replace() {},
  refresh() {},
  prefetch() {},
  bfcacheId: "synthetic",
};
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <AppRouterContext.Provider value={router}>
      <ArchiveImporter
        slug="history-test"
        revision={0}
        eligible
        published={false}
        archive={staffArchive}
      />
    </AppRouterContext.Provider>
  </NextIntlClientProvider>,
);
