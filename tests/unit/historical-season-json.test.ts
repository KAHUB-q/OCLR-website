import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import {
  archiveFromSeason,
  historicalSeasonJsonSchema,
  portableEdition,
  seasonJsonFromArchive,
} from "../../src/lib/historical-season-json";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { completeArchive } from "../fixtures/archive-relations";

const files = [
  "s4-archive",
  "s5-archive",
  "s5-reviewed-import",
  "s6-archive",
  "s6-confirmed-archive",
  "s7-archive",
  "s8-archive",
  "s9-archive",
  "s10-archive",
];

describe("portable historical season JSON", () => {
  it.each(files)("converts %s without dropping old source fields", (name) => {
    const archive = historicalArchiveSchema.parse(
      JSON.parse(readFileSync(`docs/imports/${name}.json`, "utf8")),
    );
    const output = historicalSeasonJsonSchema.parse(
      seasonJsonFromArchive(
        portableEdition({ ...edition, slug: archive.editionSlug }),
        archive,
        null,
        [],
      ),
    );
    expect(JSON.parse(JSON.stringify(archiveFromSeason(output)))).toEqual({
      ...archive,
      formatVersion: 2,
    });
  });

  it("keeps missing, null, empty and zero distinct in the shared format", () => {
    const early = historicalSeasonJsonSchema.parse(
      seasonJsonFromArchive(
        portableEdition({ ...edition, slug: "s1" }),
        { ...historicalArchive, editionSlug: "s1", formatVersion: 1 },
        null,
        [],
      ),
    );
    const late = historicalSeasonJsonSchema.parse(
      seasonJsonFromArchive(
        portableEdition({ ...edition, slug: "s10" }),
        completeArchive("s10"),
        null,
        [],
      ),
    );
    expect(Object.keys(early)).toEqual(Object.keys(late));
    expect(JSON.parse(JSON.stringify(early)).competition).not.toHaveProperty(
      "qualifiers",
    );
    expect(late.competition.dates?.endsAt).toBeNull();
    expect(late.competition.qualifiers?.[0].records[0].scores[0].score).toBe(0);
    expect(early.statistics).toEqual([]);
    expect(early.competition.bracket).toBeNull();
    expect(
      historicalSeasonJsonSchema.safeParse({ ...early, version: 2 }).success,
    ).toBe(false);
    expect(
      historicalSeasonJsonSchema.safeParse({
        ...early,
        edition: { ...early.edition, published: true },
      }).success,
    ).toBe(false);
  });
});
