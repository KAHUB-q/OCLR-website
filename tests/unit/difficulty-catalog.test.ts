import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  catalogDifficulty,
  archiveDifficultySnapshots,
} from "../../src/lib/difficulty-catalog";
import type { HistoricalArchive } from "../../src/lib/historical-archive";
import { prepareCatalog } from "../../scripts/prepare-difficulty-previews";
import {
  fetchBeatmap,
  prepareDifficultySnapshot,
} from "../../src/lib/osu-beatmaps";
vi.mock("../../src/lib/osu-beatmaps", () => ({
  fetchBeatmap: vi.fn(),
  prepareDifficultySnapshot: vi.fn(),
}));
const base = { stars: 4, bpm: 180, duration: 120, ar: 9, od: 8, cs: 4, hp: 6 };
const snapshot = {
  beatmapId: 75,
  ruleset: "osu" as const,
  checksum: "a".repeat(32),
  fetchedAt: "2026-11-05T00:00:00.000Z",
  base,
  variants: {},
};
const folders: string[] = [];
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "oclr-851-catalog-"));
  folders.push(folder);
  return join(folder, "snapshots.json");
}
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
describe("saved difficulty preparation and read composition", () => {
  it("validates identity/checksum and picks up atomic replacements without provider access", async () => {
    const file = await fixture();
    vi.stubEnv("OCLR_DIFFICULTY_CATALOG_FILE", file);
    expect(catalogDifficulty(75)).toBeUndefined();
    await writeFile(
      file,
      JSON.stringify({ version: 1, maps: { 75: snapshot } }),
    );
    expect(catalogDifficulty(75, snapshot.checksum)).toEqual(snapshot);
    expect(catalogDifficulty(75, "b".repeat(32))).toBeUndefined();
    expect(catalogDifficulty(76)).toBeUndefined();
    await writeFile(
      `${file}.next`,
      JSON.stringify({
        version: 1,
        maps: { 75: { ...snapshot, base: { ...base, stars: 10.125 } } },
      }),
    );
    await rename(`${file}.next`, file);
    expect(catalogDifficulty(75)?.base.stars).toBe(10.125);
    for (const invalid of [
      "invalid json",
      JSON.stringify({ version: 2, maps: { 75: snapshot } }),
      JSON.stringify({
        version: 1,
        maps: { 75: { ...snapshot, beatmapId: 76 } },
      }),
    ]) {
      await writeFile(file, invalid);
      expect(catalogDifficulty(75)).toBeUndefined();
    }
    expect(fetchBeatmap).not.toHaveBeenCalled();
    expect(prepareDifficultySnapshot).not.toHaveBeenCalled();
  });
  it("enriches archive copies while retaining original historical measurements", async () => {
    const file = await fixture();
    vi.stubEnv("OCLR_DIFFICULTY_CATALOG_FILE", file);
    await writeFile(
      file,
      JSON.stringify({ version: 1, maps: { 75: snapshot } }),
    );
    const map = {
      beatmapId: 75,
      slot: "DT1",
      stars: 9.5,
      bpm: 270,
      drainSeconds: 80,
    };
    const archive = {
      pools: [{ maps: [map] }],
    } as unknown as HistoricalArchive;
    const result = archiveDifficultySnapshots(archive);
    expect(result.pools[0].maps[0]).toMatchObject({
      ...map,
      difficultySnapshot: snapshot,
    });
    expect(archive.pools[0].maps[0]).toEqual(map);
    expect(result).not.toBe(archive);
  });
  it("prepares one complete official snapshot per ID, preserving previous results on failure", async () => {
    const file = await fixture();
    await writeFile(
      file,
      JSON.stringify({ version: 1, maps: { 75: snapshot } }),
    );
    vi.mocked(fetchBeatmap).mockImplementation(async (id) => ({
      beatmapId: id,
      fetchedAt: snapshot.fetchedAt,
      fingerprint: "f",
      metadata: {
        setId: 1,
        title: "Synthetic",
        artist: "Synthetic",
        mapper: "Synthetic",
        difficulty: "Synthetic",
        ...base,
      },
    }));
    vi.mocked(prepareDifficultySnapshot).mockImplementation(async (s) => {
      if (s.beatmapId === 75)
        throw new Error("Provider error with sensitive transport detail");
      return { ...snapshot, beatmapId: s.beatmapId };
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(
      await prepareCatalog([75, 76, 76], ["HD", "HR", "EZ"], file),
    ).toEqual([75]);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      version: 1,
      maps: { 75: snapshot, 76: { ...snapshot, beatmapId: 76 } },
    });
    expect(prepareDifficultySnapshot).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(
      "Could not prepare BID 75; existing snapshot preserved.",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("sensitive");
    await writeFile(file, JSON.stringify({ version: 9, maps: {} }));
    await expect(prepareCatalog([76], ["DT"], file)).rejects.toThrow(
      "Invalid catalog format",
    );
  });
});
