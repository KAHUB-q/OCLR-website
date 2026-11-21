import {
  remoteApiSupported,
  remotePageSupported,
} from "../../src/lib/data-source";
import { describe, expect, it } from "vitest";
import {
  legalPickemScore,
  pickemOutcomesFor,
  pickemPoints,
  pickemReturnPath,
  type PickemRules,
} from "../../src/lib/pickem-model";

const bo9 = {
  series: { type: "first_to", wins: 5 },
  tiedMapPolicy: "require_replay",
} as const;
const fixedFour = {
  series: { type: "fixed_maps", count: 4, allowDraw: true },
  tiedMapPolicy: "require_replay",
} as const;
const score = (homeWins: number, awayWins: number) => ({ homeWins, awayWins });

describe("Pick’em series rules", () => {
  it("validates both orientations, decisive scores and completed series", () => {
    expect(legalPickemScore(bo9, "home", score(5, 0))).toBe(true);
    expect(legalPickemScore(bo9, "home", score(5, 4))).toBe(true);
    expect(legalPickemScore(bo9, "away", score(4, 5))).toBe(true);
    expect(legalPickemScore(bo9, "home", score(4, 5))).toBe(false);
    expect(legalPickemScore(bo9, "draw", score(5, 5))).toBe(false);
    expect(legalPickemScore(bo9, "home", score(4, 2))).toBe(false);
    expect(legalPickemScore(bo9, "home", score(5, -1))).toBe(false);
  });

  it("respects fixed map counts, tied maps and configured draws", () => {
    expect(legalPickemScore(fixedFour, "draw", score(2, 2))).toBe(true);
    expect(legalPickemScore(fixedFour, "draw", score(1, 1))).toBe(false);
    const countTies: PickemRules = {
      ...fixedFour,
      tiedMapPolicy: "count_as_draw",
    };
    expect(legalPickemScore(countTies, "draw", score(1, 1))).toBe(true);
    expect(legalPickemScore(countTies, "home", score(3, 0))).toBe(true);
    expect(legalPickemScore(countTies, "home", score(4, 1))).toBe(false);
    const noDraw: PickemRules = {
      ...countTies,
      series: { ...fixedFour.series, allowDraw: false },
    };
    expect(pickemOutcomesFor(noDraw)).toEqual(["home", "away"]);
    expect(legalPickemScore(noDraw, "draw", score(1, 1))).toBe(false);
  });

  it("awards a score bonus only for a comparable exact match", () => {
    const pick = { outcomeKey: "home", score: score(5, 3) } as const;
    expect(pickemPoints(pick, "home", score(5, 3))).toEqual({
      outcomePoints: 1,
      scorePoints: 1,
      points: 2,
    });
    expect(pickemPoints(pick, "home", score(5, 2)).points).toBe(1);
    expect(pickemPoints(pick, "home", null).points).toBe(1);
    expect(pickemPoints(pick, "away", score(3, 5)).points).toBe(0);
  });

  it("allows OAuth returns only to the known Pick’em pages", () => {
    expect(pickemReturnPath("/tournaments/s11/pickem/mine")).toBe(
      "/tournaments/s11/pickem/mine",
    );
    for (const target of [
      "//example.test/tournaments/s11/pickem",
      "/tournaments/s11/pickem/../team",
      "/tournaments/%2e/pickem",
      "/tournaments/s11/pickem?redirect=//example.test",
    ])
      expect(pickemReturnPath(target)).toBeNull();
  });
  it("keeps prediction pages and APIs out of the remote-read allowlist", () => {
    expect(remotePageSupported("/tournaments/s11/pickem")).toBe(false);
    expect(remotePageSupported("/admin/tournaments/s11/pickem")).toBe(false);
    expect(remoteApiSupported("/api/tournaments/s11/pickem/summary")).toBe(
      false,
    );
    expect(remoteApiSupported("/api/tournaments/s11/pickem/me")).toBe(false);
  });
});
