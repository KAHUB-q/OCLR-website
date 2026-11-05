import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import layoutsJson from "../../src/lib/archive-relational-layout.json" with { type: "json" };
import {
  encodeArchiveRelations,
  decodeArchiveRelations,
  type Layout,
} from "../../src/lib/archive-relational-codec";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { completeArchive } from "../fixtures/archive-relations";
import { statisticsSource } from "../fixtures/archive-statistics";
import { statisticsSnapshotSchema } from "../../src/lib/statistics-snapshot";

const layouts = layoutsJson as Layout[];
const archiveLayout = layouts.find((l) => l.kind === "archive")!;
describe("complete typed historical relations", () => {
  it.each(Array.from({ length: 10 }, (_, i) => `s${i + 1}`))(
    "roundtrips every season (%s), including source-only evidence and real zeroes",
    (slug) => {
      const archive = completeArchive(slug),
        before = structuredClone(archive);
      const data = encodeArchiveRelations(archiveLayout, archive);
      expect(decodeArchiveRelations(archiveLayout, data)).toEqual(archive);
      expect(archive).toEqual(before);
      expect(
        data.archive_rel_archive_qualifiers_records_scores[0].value_score,
      ).toBe(0);
      expect(
        Object.values(data)
          .flat()
          .every((r) => !("payload" in r)),
      ).toBe(true);
    },
  );
  it.each(["s4", "s5", "s6", "s6-confirmed", "s7", "s8", "s9", "s10"])(
    "roundtrips the maintained public %s package without DB imports",
    (name) => {
      const archive = historicalArchiveSchema.parse(
        JSON.parse(readFileSync(`docs/imports/${name}-archive.json`, "utf8")),
      );
      expect(
        decodeArchiveRelations(
          archiveLayout,
          encodeArchiveRelations(archiveLayout, archive),
        ),
      ).toEqual(archive);
    },
  );
  it("retains null/absent, duplicate unknown scores, event/player order and arbitrary provider field types", () => {
    const source = statisticsSource();
    source.players = [{ osuId: 91003, username: "Synthetic current name" }];
    source.events = [
      { id: 2, at: null, type: "synthetic", actorOsuId: null, gameId: 1 },
    ];
    source.games[0].scores[0] = {
      ...source.games[0].scores[0],
      osuId: null,
      total: 0,
      hitCounts: { great: null, ok: 0, meh: null, miss: 0 },
      providerFields: { integer: 0, string: "0", flag: false, unknown: null },
    };
    source.games[0].scores.push(structuredClone(source.games[0].scores[0]));
    const snapshot = statisticsSnapshotSchema.parse({
      source,
      poolId: "final",
      archiveKey: "a".repeat(64),
      included: [1],
      excludedScores: [],
      rosterTeamGames: [],
      adjudication: null,
    });
    const layout = layouts.find((l) => l.kind === "statistics")!,
      data = encodeArchiveRelations(layout, snapshot);
    expect(decodeArchiveRelations(layout, data)).toEqual(snapshot);
    const absent = structuredClone(snapshot);
    delete absent.adjudication;
    delete absent.excludedScores;
    expect(
      decodeArchiveRelations(layout, encodeArchiveRelations(layout, absent)),
    ).toEqual(absent);
    const corrupted = structuredClone(data);
    corrupted.archive_rel_statistics_source_games[0].position = 3;
    expect(() => decodeArchiveRelations(layout, corrupted)).toThrow(
      "Incomplete historical relation",
    );
  });
  it("rejects unknown schema fields instead of silently discarding evidence", () => {
    expect(() =>
      encodeArchiveRelations(archiveLayout, {
        ...completeArchive(),
        unexpected: 1,
      }),
    ).toThrow("schema changed");
  });
});
