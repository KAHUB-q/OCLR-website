import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { BackupManager } from "../../src/components/backup-manager";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <main className="themed-site">
      <BackupManager />
    </main>
  </NextIntlClientProvider>,
);
