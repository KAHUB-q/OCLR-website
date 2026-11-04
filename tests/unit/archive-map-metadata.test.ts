import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  archivePoolMetadata,
  missingArchiveText,
  parseArchiveTitle,
} from "../../src/lib/archive-map-metadata";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import snapshot from "../../src/data/archive-beatmaps.json";

function archive(season: string) {
  return historicalArchiveSchema.parse(
    JSON.parse(readFileSync(`docs/imports/${season}-archive.json`, "utf8")),
  );
}

describe("historical composite titles", () => {
  it("splits artist, song, difficulty and an inline mapper", () => {
    expect(
      parseArchiveTitle(
        "Nijigasaki High School Idol Club - Colorful Dreams! Colorful Smiles! [Beloved] (Ninjaking311)",
      ),
    ).toEqual({
      artist: "Nijigasaki High School Idol Club",
      title: "Colorful Dreams! Colorful Smiles!",
      difficulty: "Beloved",
      mapper: "Ninjaking311",
    });
  });
  it("keeps titles that only carry artist, song and difficulty", () => {
    expect(parseArchiveTitle("Sasaki Rico - Recollections [Resolve]")).toEqual({
      artist: "Sasaki Rico",
      title: "Recollections",
      difficulty: "Resolve",
      mapper: null,
    });
  });
  it("keeps parentheses that belong to the song name", () => {
    expect(parseArchiveTitle("Artist - Song (Remix) [Hard] (Mapper)")).toEqual({
      artist: "Artist",
      title: "Song (Remix)",
      difficulty: "Hard",
      mapper: "Mapper",
    });
  });
  it("keeps difficulty brackets that are themselves nested", () => {
    expect(
      parseArchiveTitle(
        "Miyolophone - Shinigami Line (feat. eris elysia) [oatm [AR9.4 Edit]] (Prophet)",
      ),
    ).toEqual({
      artist: "Miyolophone",
      title: "Shinigami Line (feat. eris elysia)",
      difficulty: "oatm [AR9.4 Edit]",
      mapper: "Prophet",
    });
    expect(
      parseArchiveTitle("Designant - Designant. [Drop's Beyond. [OCLR edit.]]"),
    ).toEqual({
      artist: "Designant",
      title: "Designant.",
      difficulty: "Drop's Beyond. [OCLR edit.]",
      mapper: null,
    });
  });
  it("still splits records that omit the difficulty", () => {
    expect(
      parseArchiveTitle("Nekomata Master+ - chaos eater -IIDX edition-"),
    ).toEqual({
      artist: "Nekomata Master+",
      title: "chaos eater -IIDX edition-",
      difficulty: null,
      mapper: null,
    });
  });
  it("leaves titles that do not follow the pattern untouched", () => {
    for (const value of [null, "", "Plain song name", "#N/A"])
      expect(parseArchiveTitle(value)).toBeNull();
  });
});

describe("historical map metadata supplementation", () => {
  it("repairs legacy saved S5 DT maps without a reimport or mutation", () => {
    const pool = archive("s5").pools.find((p) => p.id === "pool-2")!;
    for (const map of pool.maps) {
      if (!["DT2", "DT4"].includes(map.slot)) continue;
      delete map.originalId;
      for (const key of [
        "mapper",
        "stars",
        "bpm",
        "drainSeconds",
        "cs",
        "ar",
        "od",
      ] as const)
        map[key] = null;
    }
    const before = structuredClone(pool);
    const result = archivePoolMetadata(pool, "s5");
    const dt2 = result.pool.maps.find((m) => m.slot === "DT2")!;
    const dt4 = result.pool.maps.find((m) => m.slot === "DT4")!;
    expect(dt2).toMatchObject({
      beatmapId: 2567502,
      originalId: 2933979,
      preferOriginal: true,
    });
    expect(dt4).toMatchObject({
      beatmapId: 2720295,
      originalId: 2678913,
      preferOriginal: true,
      mapper: "Gaia",
      stars: 6.27,
      bpm: 210,
      drainSeconds: 111,
      cs: 4,
      ar: 8.5,
      od: 8,
    });
    expect(dt4.archivalSupplemented).toEqual([
      "mapper",
      "stars",
      "bpm",
      "drainSeconds",
      "cs",
      "ar",
      "od",
    ]);
    expect(dt4.supplemented).toBeUndefined();
    expect(result.setIds[2678913]).toBe(1290517);
    expect(result.setIds[2933979]).toBe(1424727);
    expect(result.missingBeatmapIds).toContain(2720295);
    expect(snapshot.maps[2678913].bpm).toBe(140);
    expect(snapshot.maps[2678913].ar).toBe(9);
    expect(pool).toEqual(before);
    expect(archivePoolMetadata(result.pool, "s5").pool.maps).toEqual(
      result.pool.maps,
    );
  });
  it("preserves explicit saved values and restricts S5 repairs to the exact pool, slot and BID", () => {
    const pool = archive("s5").pools.find((p) => p.id === "pool-2")!;
    const map = pool.maps.find((m) => m.slot === "DT4")!;
    map.stars = 0;
    map.bpm = 199;
    map.originalId = 42;
    expect(
      archivePoolMetadata(pool, "s5").pool.maps.find((m) => m.slot === "DT4"),
    ).toMatchObject({
      stars: 0,
      bpm: 199,
      originalId: 42,
      preferOriginal: false,
    });
    for (const [edition, poolId, slot, bid] of [
      ["s6", "pool-2", "DT4", 2720295],
      ["s5", "pool-3", "DT4", 2720295],
      ["s5", "pool-2", "DT3", 2720295],
      ["s5", "pool-2", "DT4", 42],
    ] as const) {
      const row = { ...map, slot, beatmapId: bid };
      delete row.originalId;
      const result = archivePoolMetadata(
        { ...pool, id: poolId, maps: [row] },
        edition,
      ).pool.maps[0];
      expect(result.originalId).toBeUndefined();
      expect(result.preferOriginal).toBeUndefined();
      expect(result.archivalSource).toBeUndefined();
    }
  });
  it("keeps the archived edit and records the original map separately", () => {
    const pool = archive("s10").pools.find((value) => value.id === "gs1");
    const map = pool?.maps.find((value) => value.slot === "NM6");
    expect(map?.beatmapId).toBe(5015295);
    expect(map?.originalId).toBe(4000824);
  });
  it("recognizes spreadsheet errors without treating literal titles as errors", () => {
    for (const value of [null, "#N/A", " N/A ", "#REF!", "#VALUE!"])
      expect(missingArchiveText(value)).toBe(true);
    for (const value of ["N/A - Song [Hard]", "Error", "0"])
      expect(missingArchiveText(value)).toBe(false);
  });
  it("repairs the S4 formula-error title using the exact difficulty ID without mutating sources", () => {
    const pool = archive("s4").pools[0];
    const original = structuredClone(pool);
    const result = archivePoolMetadata(pool, "s4");
    expect(pool).toEqual(original);
    const map = result.pool.maps[0];
    expect(map.beatmapId).toBe(2076750);
    expect(map.title).toContain("[Extra]");
    expect(map.title).not.toContain("#N/A");
    expect(map.supplemented).toContain("title");
    expect(map.metadataSource).toBe("https://osu.ppy.sh/beatmaps/2076750");
    expect(result.setIds[2076750]).toBe(993100);
  });
  it("preserves source statistics including zero and mod-adjusted historical values", () => {
    const pool = archive("s4").pools[0];
    pool.maps[0] = {
      ...pool.maps[0],
      title: "Original title",
      mapper: "Historical mapper",
      stars: 0,
      bpm: 288,
      drainSeconds: 130,
      ar: 10,
      cs: 6,
      od: 10,
    };
    const map = archivePoolMetadata(pool, "s4").pool.maps[0];
    expect(map).toMatchObject(pool.maps[0]);
    expect(map.supplemented).toBeUndefined();
  });
  it("does not substitute a different map or silently enrich other editions", () => {
    const pool = archive("s4").pools[0];
    pool.maps[0] = { ...pool.maps[0], beatmapId: 999999999 };
    expect(archivePoolMetadata(pool, "s4").pool.maps[0]).toMatchObject({
      title: null,
      stars: null,
    });
    const result = archivePoolMetadata(archive("s4").pools[0], "s7");
    expect(result.setIds).toEqual({});
    expect(result.pool.maps[0].supplemented).toBeUndefined();
  });
  it("covers every available S4–S6 slot and records any unavailable map explicitly", () => {
    expect(snapshot.pending).toEqual([]);
    const fields = [
      "title",
      "mapper",
      "stars",
      "bpm",
      "drainSeconds",
      "cs",
      "ar",
      "od",
    ] as const;
    for (const season of ["s4", "s5", "s6-confirmed"]) {
      const source = archive(season);
      for (const pool of source.pools) {
        const result = archivePoolMetadata(pool, source.editionSlug);
        for (const [index, map] of result.pool.maps.entries()) {
          expect(map.beatmapId).toBe(pool.maps[index].beatmapId);
          if ((snapshot.unavailable as number[]).includes(map.beatmapId!))
            continue;
          for (const field of fields)
            expect(
              map[field],
              `${season}/${pool.id}/${map.slot}/${field}`,
            ).not.toBeNull();
        }
      }
    }
  });
  it("keeps only finite official values and canonical provenance in the snapshot", () => {
    for (const [id, map] of Object.entries(snapshot.maps)) {
      expect(map.beatmapId).toBe(Number(id));
      expect(map.source).toBe(`https://osu.ppy.sh/beatmaps/${id}`);
      expect(Date.parse(map.fetchedAt)).not.toBeNaN();
      expect(map.setId).toBeGreaterThan(0);
      for (const key of [
        "stars",
        "bpm",
        "drainSeconds",
        "cs",
        "ar",
        "od",
      ] as const) {
        expect(Number.isFinite(map[key])).toBe(true);
        expect(map[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
