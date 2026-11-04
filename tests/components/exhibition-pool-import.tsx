import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ExhibitionPoolImport } from "../../src/components/exhibition-pool-import";
import en from "../../messages/en.json";
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  bfcacheId: "synthetic",
} as AppRouterInstance;
createRoot(document.getElementById("root")!).render(
  <AppRouterContext value={router}>
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ExhibitionPoolImport
        slug="synthetic"
        pool={{ id: "synthetic-pool", version: 1, fmMode: "free_mod" }}
        onFeedback={() => {}}
      />
    </NextIntlClientProvider>
  </AppRouterContext>,
);
