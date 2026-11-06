import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { AwardManager } from "../../src/components/award-manager";
import { syntheticAwardWorkspace } from "../fixtures/award-workspace";
import en from "../../messages/en.json";

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <AwardManager
      initial={syntheticAwardWorkspace(
        Number(new URLSearchParams(location.search).get("weeks") ?? 2),
      )}
    />
  </NextIntlClientProvider>,
);
