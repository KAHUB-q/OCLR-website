import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildArchiveReadData,
  restoreArchiveReadData,
  restoreStatisticsReadData,
  archiveContentHash,
  type ArchiveState,
  type StatisticsRow,
} from "../../src/lib/archive-read-model";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";

export function state(archive = statisticsArchive): ArchiveState {
  return {
    slug: archive.editionSlug,
    configuration: {
      archive,
      ezScoreMultiplier: 1,
    } as ArchiveState["configuration"],
    configurationVersion: 3,
    createdAt: new Date(0),
    configurationUpdatedAt: new Date(0),
    lockedAt: null,
    registrationPausedAt: null,
    setupVersion: 0,
    poolPublished: false,
  };
}
export function rows(): StatisticsRow[] {
  const snapshot = {
    archiveKey: statisticsArchiveKey(statisticsArchive),
    source: statisticsSource(),
    poolId: "final",
    included: [1, 2],
  };
  return [
    {
      editionSlug: "s7",
      mpId: 999177,
      fixtureId: "one",
      version: 3,
      draft: snapshot,
      published: structuredClone(snapshot),
      publishedAt: new Date(0),
      updatedAt: new Date(0),
    },
  ];
}
describe("historical relational projection", () => {
  it("roundtrips all maintained archive packages without changing source evidence or optional arrays", () => {
    for (const name of [
      "s4",
      "s5",
      "s6",
      "s6-confirmed",
      "s7",
      "s8",
      "s9",
      "s10",
    ]) {
      const archive = historicalArchiveSchema.parse(
        JSON.parse(readFileSync(`docs/imports/${name}-archive.json`, "utf8")),
      );
      const original = structuredClone(archive);
      const built = buildArchiveReadData(state(archive), []);
      expect(restoreArchiveReadData(built.header, built.data)).toEqual(archive);
      expect(archive).toEqual(original);
      expect(built.archiveHash).toBe(archiveContentHash(archive));
    }
  });
  it("preserves every source score, including duplicate/unknown UIDs, zero and sparse unknown fields", () => {
    const sourceRows = rows();
    const scores = sourceRows[0].draft.source.games[0].scores;
    scores[0] = {
      ...scores[0],
      osuId: null,
      total: 0,
      accuracy: null,
      combo: null,
      passed: null,
      hitCounts: { great: null, ok: null, meh: null, miss: 0 },
    };
    scores.push({ ...scores[1] });
    const original = structuredClone(sourceRows);
    const built = buildArchiveReadData(state(), sourceRows);
    expect(restoreStatisticsReadData(built.data, 999177, "draft")).toEqual(
      sourceRows[0].draft,
    );
    expect(restoreStatisticsReadData(built.data, 999177, "published")).toEqual(
      sourceRows[0].published,
    );
    expect(sourceRows).toEqual(original);
    expect(
      built.data.scores.some(
        (s) => s.osuId === null && s.total === 0 && s.accuracy === null,
      ),
    ).toBe(true);
  });
  it("hashes JSONB objects independent of property order while preserving array order and null/absent", () => {
    expect(archiveContentHash({ a: 1, b: 2 })).toBe(
      archiveContentHash({ b: 2, a: 1 }),
    );
    expect(archiveContentHash({ a: null })).not.toBe(archiveContentHash({}));
    expect(archiveContentHash([1, 2])).not.toBe(archiveContentHash([2, 1]));
  });
});
