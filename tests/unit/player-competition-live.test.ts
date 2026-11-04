import { expect, it, vi } from "vitest";
import { edition } from "../fixtures/edition";
import type { PublishedPlayer } from "../../src/lib/players";
import type { PublicFixture } from "../../src/lib/public-competition";
vi.mock("../../src/lib/content", () => ({ getPublicEdition: vi.fn() }));
vi.mock("../../src/lib/public-competition", () => ({
  publicCompetition: vi.fn(),
}));
import { getPublicEdition } from "../../src/lib/content";
import { publicCompetition } from "../../src/lib/public-competition";
import { playerCompetitionRecord } from "../../src/lib/player-competition";

const person = (team: string): PublishedPlayer => ({
  osuId: 91003,
  username: "Synthetic participant",
  editionSlug: edition.slug,
  editionName: edition.name,
  team: { id: team, name: team },
  role: "player",
  captain: false,
  participation: "finalized_roster",
});
const fixture = (
  roundName: string,
  home: string,
  away: string,
  winner: string | null,
  at: string,
): PublicFixture => ({
  id: `${roundName}-${home}`,
  label: roundName,
  pool: null,
  publishedAt: at,
  roundId: roundName,
  roundName,
  roundPosition: 1,
  stageId: "knockout",
  stage: "knockout",
  position: 1,
  home: {
    team: { id: home, name: home },
    label: home,
    sourceId: null,
    outcome: null,
  },
  away: {
    team: { id: away, name: away },
    label: away,
    sourceId: null,
    outcome: null,
  },
  confirmed: true,
  scheduledAt: at,
  timeZone: "UTC",
  status: "scheduled",
  updatedAt: at,
  result: winner
    ? {
        revision: 1,
        homeWins: 2,
        awayWins: 0,
        tiedMaps: 0,
        winnerTeamId: winner,
        draw: false,
        games: [],
        mpId: 1,
        mpUrl: "https://osu.ppy.sh/mp/1",
        publicNote: "",
        updatedAt: at,
      }
    : null,
});

it("keeps semifinal match records without awarding a podium before the public final result", async () => {
  vi.mocked(getPublicEdition).mockResolvedValue({ ...edition, status: "live" });
  const fixtures = [
    fixture("Semifinals", "a", "c", "a", "2026-11-01T12:00:00Z"),
    fixture("Semifinals", "b", "d", null, "2026-11-01T13:00:00Z"),
    fixture("Grand Final", "a", "b", null, "2026-11-02T12:00:00Z"),
  ];
  vi.mocked(publicCompetition).mockResolvedValue({
    fixtures,
    groups: [],
    databaseAuthority: true,
  });
  for (const team of ["a", "c"]) {
    const career = await playerCompetitionRecord([person(team)]);
    expect(career).toMatchObject({
      matches: 1,
      championships: 0,
      runnerUps: 0,
      thirdPlaces: 0,
    });
    expect(career.editions[0].unavailable).toBe(false);
  }
  fixtures[1] = fixture("Semifinals", "b", "d", "b", "2026-11-01T13:00:00Z");
  fixtures[2] = fixture("Grand Final", "a", "b", "a", "2026-11-02T12:00:00Z");
  expect(await playerCompetitionRecord([person("a")])).toMatchObject({
    matches: 2,
    championships: 1,
    runnerUps: 0,
  });
  expect(await playerCompetitionRecord([person("b")])).toMatchObject({
    matches: 2,
    championships: 0,
    runnerUps: 1,
  });
  expect(await playerCompetitionRecord([person("c")])).toMatchObject({
    championships: 0,
    runnerUps: 0,
  });
});

it.each(["2026-11-03T12:00:00Z", null])(
  "ignores a cancelled final with scheduledAt=%s when awarding the completed final",
  async (scheduledAt) => {
    vi.mocked(getPublicEdition).mockResolvedValue({
      ...edition,
      status: "live",
    });
    const cancelled = fixture(
      "Grand Final reset",
      "a",
      "b",
      null,
      "2026-11-03T12:00:00Z",
    );
    cancelled.status = "cancelled";
    cancelled.scheduledAt = scheduledAt;
    vi.mocked(publicCompetition).mockResolvedValue({
      fixtures: [
        fixture("Grand Final", "a", "b", "a", "2026-11-02T12:00:00Z"),
        cancelled,
      ],
      groups: [],
      databaseAuthority: true,
    });
    expect(await playerCompetitionRecord([person("a")])).toMatchObject({
      matches: 1,
      championships: 1,
      runnerUps: 0,
    });
    expect(await playerCompetitionRecord([person("b")])).toMatchObject({
      matches: 1,
      championships: 0,
      runnerUps: 1,
    });
  },
);
