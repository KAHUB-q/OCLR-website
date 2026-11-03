import { createRoot } from "react-dom/client";
import { Suspense, use, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { StaffRoleForm } from "../../src/components/staff-role-form";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/pastel-theme.css";

document.documentElement.dataset.theme =
  new URLSearchParams(location.search).get("theme") ?? "light";
document.documentElement.dataset.appearance = "cute-pastel";

function RefreshCommit({ gate }: { gate: Promise<void> | null }) {
  if (gate) use(gate);
  return null;
}

function Harness() {
  const [gate, setGate] = useState<Promise<void> | null>(null);
  const router: AppRouterInstance = {
    back() {},
    forward() {},
    refresh() {
      setGate(
        new Promise<void>((resolve) => {
          window.addEventListener("finish-refresh", () => resolve(), {
            once: true,
          });
        }),
      );
    },
    push() {},
    replace() {},
    prefetch() {},
    bfcacheId: "synthetic",
  };
  return (
    <AppRouterContext.Provider value={router}>
      <NextIntlClientProvider locale="zh-Hant" messages={hant} timeZone="UTC">
        <Suspense fallback={<p>Refreshing synthetic roles</p>}>
          <RefreshCommit gate={gate} />
          <main className="themed-site private-site" style={{ padding: 16 }}>
            <StaffRoleForm
              editions={[]}
              scopes={null}
              existing={{
                userId: 12345,
                editionSlug: null,
                grants: [{ id: "synthetic-grant", role: "mappooler" }],
              }}
            />
          </main>
        </Suspense>
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
