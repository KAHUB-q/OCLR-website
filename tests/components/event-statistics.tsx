import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { EventStatistics } from "../../src/components/event-statistics";
import type { EventScore } from "../../src/lib/event-statistics";
import en from "../../messages/en.json";
const titleOnly = new URLSearchParams(location.search).has("title-only");
const score: EventScore = {
  osuId: 11,
  teamId: "X",
  player: "Same",
  team: "Same team",
  round: "Final",
  slot: "NM1",
  title: titleOnly ? "Pirate Radio" : "Synthetic map",
  mapId: titleOnly ? null : 1001,
  score: 100,
  accuracy: 0.98,
  combo: 100,
  mods: "NM",
  mp: 1,
  game: "1",
  fixture: "one",
};
const params = new URLSearchParams(location.search);
const scores = [
  score,
  { ...score, osuId: 22, teamId: "Y", score: 50 },
  { ...score, player: "Old name", game: "2", score: 80, combo: 1234 },
  ...(params.has("rounds")
    ? [{ ...score, round: "Semifinal", fixture: "semi", mapId: 2002 }]
    : []),
];
const coverage = {
  slug: "synthetic",
  players: [
    { osuId: 11, username: "Same" },
    { osuId: 22, username: "Same" },
  ],
  teams: [
    { id: "X", name: "Same team" },
    { id: "Y", name: "Same team" },
  ],
  stages: [...new Set(scores.map((play) => play.round))],
  fixtures: [],
  poolFixtures: [
    {
      id: "one",
      round: "Final",
      teams: ["Same team", "Same team"],
      teamIds: ["X", "Y"],
      maps: [
        score,
        ...(params.has("unplayed")
          ? [{ ...score, slot: "HD1", mapId: 1002, title: "Unplayed map" }]
          : []),
      ],
      picks: [],
      bans: [
        { team: "Same team", teamId: "X", maps: [] },
        { team: "Same team", teamId: "Y", maps: [] },
      ],
    },
  ],
} as unknown as NonNullable<Parameters<typeof EventStatistics>[0]["coverage"]>;
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <EventStatistics
      scores={scores}
      coverage={coverage}
      series={{
        fixtures: [
          { id: "one", roundId: "Final", roundName: "Final", complete: true },
        ],
        teams: coverage.teams,
        players: [
          { userId: 11, username: "Same" },
          { userId: 22, username: "Same" },
        ],
        games: [
          {
            fixtureId: "one",
            gameId: 1,
            slot: "NM1",
            beatmapId: 1001,
            teamIds: ["X", "Y"],
            winnerTeamId: "X",
            scores: [
              { userId: 11, teamId: "X", total: 100 },
              { userId: 22, teamId: "Y", total: 50 },
            ],
          },
        ],
      }}
    />
  </NextIntlClientProvider>,
);
