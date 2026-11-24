import { Fragment, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PickemMatchCard } from "../../src/components/pickem-match-card";
import type { PickemFixture } from "../../src/lib/pickem-types";
import en from "../../messages/en.json";
import "../../src/app/globals.css";

const now = new Date();
const later = new Date(now.getTime() + 3600000).toISOString();
const card: PickemFixture = {
  windowId: "fixture-window",
  fixtureId: "fixture",
  label: "M1",
  roundId: "round",
  roundName: "Synthetic round",
  timeZone: "Asia/Taipei",
  scheduledAt: later,
  closesAt: later,
  home: { id: "home", name: "Aurora Rookies", avatarKey: null },
  away: { id: "away", name: "Night Train", avatarKey: null },
  status: "open",
  voidReason: null,
  outcomes: ["home", "away"],
  scoreRules: {
    series: { type: "first_to", wins: 5 },
    tiedMapPolicy: "require_replay",
  },
  mine: null,
  result: null,
  points: null,
};
const state = new URLSearchParams(location.search);
if (state.has("saved")) {
  card.mine = {
    outcomeKey: "away",
    score: { homeWins: 2, awayWins: 5 },
    version: 1,
    updatedAt: now.toISOString(),
  };
}
const Wrapper = state.has("strict") ? StrictMode : Fragment;
if (state.has("closed") || state.has("ended")) {
  card.status = state.has("ended") ? "pending" : "closed";
  card.closesAt = now.toISOString();
  if (state.has("ended"))
    card.distribution = [
      { outcomeKey: "home", count: 1 },
      { outcomeKey: "away", count: 0 },
    ];
}
const router = { refresh() {} } as AppRouterInstance;

createRoot(document.getElementById("root")!).render(
  <Wrapper>
    <AppRouterContext value={router}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Taipei">
        <main className="themed-site">
          <PickemMatchCard
            card={card}
            slug="synthetic-test"
            signedIn={!state.has("ended")}
            userId={28001}
            serverNow={now.toISOString()}
          />
        </main>
      </NextIntlClientProvider>
    </AppRouterContext>
  </Wrapper>,
);
