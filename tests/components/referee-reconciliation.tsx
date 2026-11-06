import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { RefereeReconciliation } from "../../src/components/referee-reconciliation";
import en from "../../messages/en.json";

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <RefereeReconciliation
      slug="synthetic"
      fixtureId="00000000-0000-4000-8000-000000000001"
    />
  </NextIntlClientProvider>,
);
