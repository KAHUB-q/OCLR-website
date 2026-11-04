import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PublicMatches } from "../../src/components/public-matches";
import { calculateStandings } from "../../src/lib/standings";
import type {
  PublicFixture,
  PublicTeam,
} from "../../src/lib/public-competition";
import en from "../../messages/en.json";
import "../../src/app/globals.css";
import "../../src/app/public-tournament.css";
const teams: PublicTeam[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  name: `Synthetic ${id}`,
}));
const at = "2026-11-01T12:00:00Z";
function fixture(
  id: string,
  stage: PublicFixture["stage"],
  side = 0,
): PublicFixture {
  const home = teams[side],
    away = teams[side + 1];
  return {
    id,
    label: id,
    pool: null,
    publishedAt: at,
    roundId: `${stage}-round`,
    roundName: stage,
    roundPosition: 1,
    stageId: stage,
    stage,
    position: 1,
    home: { team: home, label: home.name, sourceId: null, outcome: null },
    away: { team: away, label: away.name, sourceId: null, outcome: null },
    confirmed: true,
    scheduledAt: at,
    timeZone: "UTC",
    status: "scheduled",
    updatedAt: at,
    result: {
      revision: 1,
      homeWins: 2,
      awayWins: 0,
      tiedMaps: 0,
      winnerTeamId: home.id,
      draw: false,
      games: [],
      mpId: 1,
      mpUrl: "https://osu.ppy.sh/mp/1",
      publicNote: "",
      updatedAt: at,
    },
  };
}
const fixtures = [
  fixture("Group A match", "group"),
  fixture("Group B match", "group", 2),
  fixture("Knockout rematch", "knockout"),
  fixture("Exhibition rematch", "exhibition"),
];
const groups = [0, 2].map((side, index) => ({
  key: `group-${index}`,
  name: `Group ${index ? "B" : "A"}`,
  version: "synthetic",
  ...calculateStandings(
    teams.slice(side, side + 2),
    fixtures.filter(
      (f) => f.stage === "group" && f.home.team?.id === teams[side].id,
    ),
    new Map(),
  ),
}));
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
  <AppRouterContext value={router}>
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <main className="themed-site">
        <PublicMatches slug="synthetic" fixtures={fixtures} groups={groups} />
      </main>
    </NextIntlClientProvider>
  </AppRouterContext>,
);
