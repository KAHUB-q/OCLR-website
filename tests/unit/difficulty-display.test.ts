import { describe, expect, it } from "vitest";
import {
  baseDifficulty,
  displayDifficulty,
  effectiveDifficulty,
  previewConfigurations,
} from "../../src/lib/difficulty-display";
import {
  difficultyMods,
  type BeatmapAttributes,
  type DifficultyConfiguration,
  type DifficultySnapshot,
} from "../../src/lib/mappool-model";
import { difficultySnapshotSchema } from "../../src/lib/difficulty-catalog";

const base = {
  stars: 4.5,
  bpm: 180,
  duration: 120,
  ar: 9,
  od: 8.5,
  cs: 4,
  hp: 6,
};
const attributes = (
  configuration: DifficultyConfiguration,
  stars = 7.123,
): BeatmapAttributes => ({
  configuration,
  mods: difficultyMods[configuration],
  ruleset: "osu",
  stars,
  maxCombo: 1000,
  values: {},
  fetchedAt: "2026-11-05T00:00:00.000Z",
});
const snapshot: DifficultySnapshot = {
  beatmapId: 75,
  ruleset: "osu",
  checksum: null,
  fetchedAt: "2026-11-05T00:00:00.000Z",
  base,
  variants: {
    HD: attributes("HD", 4.6),
    HR: attributes("HR", 6),
    EZ: attributes("EZ", 2),
  },
};
describe("official difficulty display", () => {
  it("uses provider SR literally, and applies standard HR/EZ settings without changing base data", () => {
    const frozen = Object.freeze({ ...base });
    expect(effectiveDifficulty(frozen, attributes("HD", 8.765))).toEqual({
      ...base,
      stars: 8.765,
    });
    const hr = effectiveDifficulty(frozen, attributes("HR"));
    expect(hr.stars).toBe(7.123);
    expect(hr.ar).toBe(10);
    expect(hr.od).toBe(10);
    expect(hr.cs).toBeCloseTo(5.2);
    expect(hr.hp).toBeCloseTo(8.4);
    expect(effectiveDifficulty(base, attributes("EZ"))).toEqual({
      ...base,
      stars: 7.123,
      ar: 4.5,
      od: 4.25,
      cs: 2,
      hp: 3,
    });
    expect(base).toEqual(frozen);
  });
  it("converts speed to effective timing and keeps API star ratings for complete combinations", () => {
    const dt = effectiveDifficulty(base, attributes("DT", 9.999));
    expect(dt).toMatchObject({
      stars: 9.999,
      bpm: 270,
      duration: 80,
      cs: 4,
      hp: 6,
    });
    expect(dt.ar).toBeCloseTo(10.333333);
    expect(dt.od).toBeCloseTo(10.083333);
    const combined = effectiveDifficulty(base, attributes("HDHRDT", 10.5));
    expect(combined.stars).toBe(10.5);
    expect(combined.ar).toBe(11);
    expect(combined.od).toBeCloseTo(11.083333);
    expect(combined.bpm).toBe(270);
  });
  it("preserves null parameters and does not apply osu! parameter formulas to other rulesets", () => {
    expect(
      baseDifficulty({ stars: 0, bpm: Number.NaN, ar: null }),
    ).toMatchObject({ stars: 0, bpm: null, ar: null });
    expect(
      effectiveDifficulty({ ...base, ar: null, hp: null }, attributes("DT")),
    ).toMatchObject({ ar: null, hp: null });
    expect(
      effectiveDifficulty(base, { ...attributes("HR"), ruleset: "taiko" }),
    ).toMatchObject({ ar: null, od: null, cs: null, hp: null, stars: 7.123 });
  });
  it("has single-mod FM previews only, preserves unknown TB, and NM remains base", () => {
    expect(previewConfigurations("FM", "DT")).toEqual(["HD", "HR", "EZ"]);
    const input = { beatmapId: 75, category: "FM", base, snapshot };
    for (const [fm, stars] of [
      ["HD", 4.6],
      ["HR", 6],
      ["EZ", 2],
    ] as const)
      expect(displayDifficulty(input, { adjusted: true, fm })).toMatchObject({
        status: "adjusted",
        configuration: fm,
        rate: 1,
        values: { stars },
      });
    expect(displayDifficulty(input, { adjusted: true, fm: "" }).status).toBe(
      "variable",
    );
    expect(
      displayDifficulty(input, { adjusted: true, fm: "DT" as "HD" }).status,
    ).toBe("variable");
    expect(
      displayDifficulty(
        { ...input, category: "TB", snapshot: undefined },
        { adjusted: true, fm: "HD" },
      ).status,
    ).toBe("variable");
    expect(
      displayDifficulty(
        { ...input, category: "NM", attributes: attributes("HR") },
        { adjusted: true, fm: "HD" },
      ),
    ).toMatchObject({ status: "base", values: base });
  });
  it("keeps convertible parameters when official SR is missing, without reusing another selection's SR", () => {
    const input = { category: "DT", base, ruleset: "osu" as const };
    const missing = displayDifficulty(input, { adjusted: true, fm: "" });
    expect(missing).toMatchObject({
      status: "missing",
      configuration: "DT",
      values: { stars: null, bpm: 270, duration: 80, cs: 4, hp: 6 },
    });
    expect(missing.values.ar).toBeCloseTo(10.333333);
    expect(missing.values.od).toBeCloseTo(10.083333);
    for (const [category, cs, ar, hp] of [
      ["HD", 4, 9, 6],
      ["HR", 5.2, 10, 8.4],
    ] as const) {
      const result = displayDifficulty(
        { ...input, category },
        { adjusted: true, fm: "" },
      );
      expect(result.values.stars).toBeNull();
      expect(result.values.bpm).toBe(180);
      expect(result.values.cs).toBeCloseTo(cs);
      expect(result.values.ar).toBeCloseTo(ar);
      expect(result.values.hp).toBeCloseTo(hp);
    }
    const fm = displayDifficulty(
      { beatmapId: 75, category: "FM", base, snapshot },
      { adjusted: true, fm: "" },
    );
    expect(fm).toMatchObject({
      status: "variable",
      values: base,
      fallback: "base",
    });
    expect(
      displayDifficulty(
        { ...input, attributes: { ...attributes("DT"), mods: ["HR"] } },
        { adjusted: true, fm: "" },
      ).status,
    ).toBe("missing");
    expect(
      displayDifficulty(
        { ...input, attributes: { ...attributes("DT"), ruleset: "mania" } },
        { adjusted: true, fm: "" },
      ).status,
    ).toBe("missing");
    expect(
      displayDifficulty(
        { beatmapId: 76, category: "FM", base, snapshot },
        { adjusted: true, fm: "HR" },
      ).status,
    ).toBe("missing");
  });
  it("never reapplies mods to historical numbers, and retains the original record", () => {
    const recorded = { ...base, stars: 8.8, bpm: 270, duration: 80 };
    const original = {
      beatmapId: 75,
      category: "DT",
      historical: true,
      base: recorded,
    };
    expect(
      displayDifficulty(original, { adjusted: false, fm: "" }),
    ).toMatchObject({ status: "recorded", values: recorded });
    expect(
      displayDifficulty(original, { adjusted: true, fm: "" }),
    ).toMatchObject({
      status: "missing",
      values: recorded,
      fallback: "recorded",
    });
    const partial = displayDifficulty(
      { ...original, snapshot }, // Verified base, but no DT SR in this snapshot.
      { adjusted: true, fm: "" },
    );
    expect(partial).toMatchObject({
      status: "missing",
      values: { stars: null, bpm: 270, duration: 80 },
    });
    expect(partial.fallback).toBeUndefined();
    const verified = { ...snapshot, variants: { DT: attributes("DT", 6.75) } };
    expect(
      displayDifficulty(
        { ...original, snapshot: verified },
        { adjusted: true, fm: "" },
      ),
    ).toMatchObject({
      status: "adjusted",
      values: { stars: 6.75, bpm: 270, duration: 80 },
    });
    expect(original.base).toEqual(recorded);
  });
  it("keeps original historical values for every selection without a verified base", () => {
    const recorded = { ...base, stars: 8.8, bpm: 270, duration: 80 };
    for (const category of ["HD", "HR", "DT", "FM", "TB"]) {
      for (const fm of ["", "HD", "HR", "EZ"] as const) {
        expect(
          displayDifficulty(
            { category, base: recorded, historical: true },
            { adjusted: true, fm },
          ),
        ).toMatchObject({ values: recorded, fallback: "recorded" });
      }
    }
  });
  it("validates reviewed snapshots against BID, ruleset, complete mods and timestamps", () => {
    expect(difficultySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      difficultySnapshotSchema.safeParse({
        ...snapshot,
        variants: { DT: attributes("HR") },
      }).success,
    ).toBe(false);
    expect(
      difficultySnapshotSchema.safeParse({
        ...snapshot,
        variants: { DT: { ...attributes("DT"), ruleset: "mania" } },
      }).success,
    ).toBe(false);
    expect(
      difficultySnapshotSchema.safeParse({
        ...snapshot,
        fetchedAt: "not-a-time",
      }).success,
    ).toBe(false);
    expect(
      difficultySnapshotSchema.safeParse({
        ...snapshot,
        base: { ...base, bpm: -1 },
      }).success,
    ).toBe(false);
  });
});
