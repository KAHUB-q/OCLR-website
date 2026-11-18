import { describe, expect, it } from "vitest";
import { archiveSeasonSeries } from "../../src/lib/season-series-source";
import {
  rateSeasonSeries,
  seasonSeriesOptions,
  visibleSeriesPlayers,
} from "../../src/lib/season-series-model";
import { ratingReadContracts } from "../../src/lib/rating-read-contracts";
import { calculateRating } from "../../src/lib/yumu-rating";

type Release = Parameters<typeof archiveSeasonSeries>[0];
const first = {
  fixtureId: "f",
  stage: "Group",
  gameId: 11,
  mpId: 100,
  beatmapId: 99,
  slot: "NM1",
  osuId: 1,
  teamId: "A",
  score: 200,
  winnerTeamId: "B",
};
const group = [
  first,
  { ...first, osuId: 2, score: 100 },
  { ...first, osuId: 3, teamId: "B", score: 100 },
];
const final = [group[0], group[2]].map((p) => ({
  ...p,
  fixtureId: "g",
  stage: "Final",
  gameId: 12,
  mpId: 101,
  score: 100,
  winnerTeamId: undefined,
}));
const release: Release = {
  players: [
    { osuId: 1, username: "Echo" },
    { osuId: 2, username: "New name" },
    { osuId: 3, username: "Echo" },
  ],
  teams: [
    { id: "A", name: "Alpha" },
    { id: "B", name: "Beta" },
  ],
  fixtures: [
    { id: "f", stage: "Group", covered: true },
    { id: "g", stage: "Final", covered: true },
  ],
  poolFixtures: [{ id: "g", teamIds: ["A", "B"] }],
  plays: [...group, ...final],
};

describe("season Series from a released edition", () => {
  it("rates the union of games, preserves the released winner, and recomputes round/map populations", () => {
    const series = archiveSeasonSeries(release);
    expect(ratingReadContracts.publicSeasonSeries.parse(series)).toEqual(
      series,
    );
    const all = rateSeasonSeries(series);
    const expected = calculateRating(
      [group, final].map((rows) => ({
        gameId: rows[0].gameId,
        teamIds: ["A", "B"],
        winnerTeamId: rows[0].winnerTeamId ?? null,
        scores: rows.map((p) => ({
          userId: p.osuId,
          teamId: p.teamId,
          total: p.score,
        })),
      })),
    );
    expect(all.players).toMatchObject(expected.players);
    expect(all).toMatchObject({ fullyRated: 2, gameCount: 2, scoreCount: 5 });
    const inGroup = rateSeasonSeries(series, "Group");
    expect(inGroup.players.find((p) => p.userId === 3)?.rws).toBe(1);
    const map = seasonSeriesOptions(series).maps.find(
      (m) => m.round === "Final",
    )!;
    const inFinal = rateSeasonSeries(series, "", map.value);
    expect(inFinal.players).toEqual(rateSeasonSeries(series, "Final").players);
    expect(inFinal.players.map((p) => [p.rank, p.rws])).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(all.players[0].mra).not.toBeCloseTo(
      (inGroup.players[0].mra + inFinal.players[0].mra) / 2,
      5,
    );
    expect(rateSeasonSeries(series, "Group", map.value).players).toEqual([]);
  });

  it("keeps a UID's rank and appearances when searching a name or displaying one team", () => {
    const all = rateSeasonSeries(archiveSeasonSeries(release)).players;
    const echo = visibleSeriesPlayers(all, "", "ECHO");
    expect(echo.map((p) => p.userId)).toEqual([1, 3]);
    expect(visibleSeriesPlayers(all, "B", "Echo")).toEqual([echo[1]]);
    expect(echo[1]).toMatchObject({ rank: 2, appearances: 2, team: "Beta" });
    const renamed = archiveSeasonSeries({
      ...release,
      players: release.players.map((p) => ({
        ...p,
        username: `renamed ${p.osuId}`,
      })),
    });
    expect(rateSeasonSeries(renamed).players.map((p) => p.mra)).toEqual(
      all.map((p) => p.mra),
    );
  });

  it("deduplicates a UID and equivalent MP copies, but keeps a real replay of the same map", () => {
    const plays = [
      ...group,
      first,
      ...group.map((p) => ({ ...p, mpId: 102 })),
      ...group.map((p) => ({ ...p, gameId: 13 })),
    ];
    const report = rateSeasonSeries(archiveSeasonSeries({ ...release, plays }));
    expect(report).toMatchObject({
      gameCount: 2,
      scoreCount: 6,
      fullyRated: 1,
    });
    expect(report.players.every((p) => p.appearances === 2)).toBe(true);
  });

  it("rejects the whole game on conflicting UID, lineup, winner or fixture, in either order", () => {
    for (const other of [
      [{ ...first, score: 5 }],
      [{ ...first, winnerTeamId: "A" }],
      [{ ...first, mpId: 200 }],
      final.map((p) => ({ ...p, gameId: first.gameId })),
    ]) {
      const plays = [...release.plays, ...other];
      const series = archiveSeasonSeries({ ...release, plays });
      expect(series.games.map((g) => g.gameId)).toEqual([12]);
      expect(rateSeasonSeries(series, "Group").players).toEqual([]);
      expect(series.fixtures[0].complete).toBe(false);
      if (other[0].fixtureId === "g")
        expect(series.fixtures[1].complete).toBe(false);
      expect(
        archiveSeasonSeries({ ...release, plays: [...plays].reverse() }),
      ).toEqual(series);
    }
  });

  it("does not guess a second side, include unreleased plays, or turn missing scores into zero", () => {
    const one = { ...first, winnerTeamId: "A" };
    const input = {
      ...release,
      plays: [one, ...final],
      fixtures: release.fixtures.map((f) => ({ ...f, covered: f.id === "f" })),
    };
    expect(archiveSeasonSeries(input).games).toEqual([]);
    const sides = {
      ...input,
      poolFixtures: input.fixtures.map((f) => ({
        id: f.id,
        teamIds: ["A", "B"],
      })),
    };
    expect(rateSeasonSeries(archiveSeasonSeries(sides))).toMatchObject({
      gameCount: 1,
      scoreCount: 1,
      fullyRated: 1,
    });
    for (const bad of [
      { score: null as unknown as number },
      { osuId: 1000 },
      { teamId: "unknown" },
    ]) {
      expect(
        archiveSeasonSeries({
          ...sides,
          plays: [one, { ...one, osuId: 2, ...bad }],
        }).games,
      ).toEqual([]);
    }
    expect(
      archiveSeasonSeries({ ...sides, plays: [{ ...one, score: 0 }] }).games,
    ).toEqual([]);
    const withZero = archiveSeasonSeries({
      ...sides,
      plays: [one, { ...one, osuId: 2, score: 0 }],
    });
    expect(
      rateSeasonSeries(withZero).players.find((p) => p.userId === 2),
    ).toMatchObject({ appearances: 1, mra: 0 });
  });
});
