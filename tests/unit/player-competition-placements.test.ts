import { expect, it } from "vitest";
import {
  tournamentPlacements,
  type SeriesResult,
} from "../../src/lib/player-competition-model";

const series = (
  label: string,
  at: string,
  winnerTeamId: string,
  loserTeamId: string,
): SeriesResult => ({ label, at, winnerTeamId, loserTeamId });
const semifinalA = series("Semifinals", "2026-11-01T12:00:00Z", "a", "c");
const semifinalB = series("Semifinals", "2026-11-01T13:00:00Z", "b", "d");
const final = series("Grand Final", "2026-11-02T12:00:00Z", "a", "b");

it.each(["labels", "native round IDs", "archive round metadata"])(
  "counts staggered semifinal losers together using %s",
  (source) => {
    const semis = [semifinalA, semifinalB].map((match, index) => ({
      ...match,
      ...(source === "native round IDs"
        ? { roundId: "semifinals", label: `Match ${index + 1}` }
        : {}),
      ...(source === "archive round metadata"
        ? {
            round: { phase: "knockout" as const, index: 2 },
            label: `Match ${index + 1}`,
          }
        : {}),
    }));
    expect(tournamentPlacements([...semis, final])).toEqual({
      champion: "a",
      runnerUp: "b",
      third: ["c", "d"],
    });
  },
);

it("keeps a later lower final or dedicated third-place match authoritative", () => {
  const matches = [semifinalA, semifinalB];
  expect(
    tournamentPlacements([
      ...matches,
      series("Lower Final", "2026-11-01T18:00:00Z", "b", "c"),
      final,
    ]),
  ).toEqual({ champion: "a", runnerUp: "b", third: ["c"] });
  expect(
    tournamentPlacements([
      ...matches,
      series("Third place", "2026-11-02T11:00:00Z", "d", "c"),
      final,
    ]),
  ).toEqual({ champion: "a", runnerUp: "b", third: ["d"] });
});
