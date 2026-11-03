import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { StreamingManager } from "../../src/components/streaming-manager";
import { StaffReadOnlyContext } from "../../src/components/staff-read-only";
import type { StreamingWorkspace } from "../../src/lib/streaming";
import en from "../../messages/en.json";
import hans from "../../messages/zh-Hans.json";
import hant from "../../messages/zh-Hant.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
import "../../src/app/workspace.css";
import "../../src/app/pastel-theme.css";
import "../../src/app/swiss-theme.css";

const params = new URLSearchParams(location.search);
const locale = params.get("locale") || "en";
document.documentElement.lang = locale;
document.documentElement.dataset.theme = params.get("theme") || "light";
document.documentElement.dataset.appearance =
  params.get("appearance") || "default";
const self = params.get("self");
const warnings = params.has("warnings");
const data: StreamingWorkspace = {
  actorId: 1001,
  canManage: !self,
  canSelect: self === "streamer",
  canSelectCommentary: self === "commentary",
  candidates: [
    { osuId: 1001, username: "Synthetic Streamer" },
    { osuId: 1002, username: "Other Streamer" },
  ],
  commentaryCandidates: [{ osuId: 2001, username: "Synthetic Commentator" }],
  operational: true,
  filters: { date: "", round: "", view: "all" },
  rounds: [{ id: "round", name: "Group Stage" }],
  fixtures: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      label: "Synthetic Broadcast Test",
      roundId: "round",
      roundName: "Group Stage",
      scheduledAt: "2030-02-01T12:00:00Z",
      timeZone: "Asia/Taipei",
      status: "scheduled",
      completed: false,
      version: 4,
      streamRevision: 8,
      home: { name: "Alpha", source: null, outcome: null },
      away: { name: "Beta", source: null, outcome: null },
      conflicts: warnings ? [{ id: "other", label: "Simultaneous Match" }] : [],
      sameStartBookings: [],
      assignment: self
        ? null
        : {
            userId: 1001,
            username: "Synthetic Streamer",
            source: "staff",
            assignedBy: 999,
            assignedByName: "Synthetic Organizer",
            assignedAt: "2030-01-01T00:00:00Z",
            eligible: !warnings,
            needsConfirmation: warnings,
          },
      commentators: [],
    },
  ],
  history: [],
};
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
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "zh-Hans" ? hans : locale === "zh-Hant" ? hant : en}
      timeZone="UTC"
    >
      <StaffReadOnlyContext value={params.has("readonly")}>
        <main
          className="themed-site private-site"
          style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}
        >
          <h1>Streaming tasks</h1>
          <StreamingManager slug="synthetic" data={data} />
        </main>
      </StaffReadOnlyContext>
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
);
