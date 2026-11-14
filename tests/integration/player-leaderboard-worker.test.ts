import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb, readOnlyData } from "../../src/db";
import {
  captains,
  editionState,
  historicalStatistics,
  historicalStatisticsRevisions,
  mappoolEntries,
  mappools,
  memberships,
  playerLeaderboardRows,
  playerLeaderboardVersions,
  playerNames,
  rankingSnapshots,
  teams,
  tournamentRounds,
  tournamentStages,
  userProfileCache,
  users,
} from "../../src/db/schema";
import { refreshPlayerLeaderboard } from "../../src/lib/player-leaderboard-worker";
import {
  databasePlayerLeaderboard,
  databasePublicPlayerMra,
} from "../../src/lib/player-leaderboard";
import {
  databaseBeatmapLeaderboard,
  databaseCareerLeaderboard,
} from "../../src/lib/saved-rankings";
import { projectPlayerLeaderboard } from "../../src/lib/player-leaderboard-projector";
import * as statistics from "../../src/lib/archive-statistics-reads";
import { readTournaments } from "../../src/lib/tournament-reads";
import { withReadChannel } from "../../src/lib/read-channel";
import { readApiRoute } from "../../src/lib/read-api";
import { archiveQueryFixture } from "../fixtures/archive-query";
import { edition } from "../fixtures/edition";
import { syntheticPublicPools } from "../fixtures/public-mappools";
import { seedEditions } from "../fixtures/editions";
import { normalizeOsuProfile } from "../../src/lib/osu-profile-model";
import { profileResponse } from "../fixtures/osu-profile";
import { assertTestDatabase } from "../database";
import { observe, sourceJson } from "../archive-query-observer";
vi.mock("@/data/beatmap-max-combos.json", () => ({
  default: { combos: { "10001": 1000, "10002": 1000 } },
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("background public player analytics (#916)", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_URL", "https://oclr.example.test");
    vi.stubEnv("OCLR_DEVELOPER_ORIGINS", "http://localhost:3000");
    vi.stubEnv("OSU_CLIENT_ID", undefined);
    vi.stubEnv("OSU_CLIENT_SECRET", undefined);
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db().execute(
      sql`TRUNCATE edition_state,users,user_profile_cache,player_names,player_leaderboard_versions,ranking_snapshots CASCADE`,
    );
    const f = archiveQueryFixture();
    await seedEditions([
      {
        ...edition,
        slug: "s7",
        status: "completed",
        registration: null,
        archive: f.archive,
      },
    ]);
    await db().insert(historicalStatistics).values(f.rows);
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("never calculates or writes on missing/current page and API reads; exact background result and personal lookup survive", async () => {
    const projection = vi.spyOn(statistics, "publicArchiveStatistics");
    const cold = await observe(() => databasePlayerLeaderboard());
    expect(cold.value).toMatchObject({ state: "pending", players: [] });
    expect(sourceJson(cold.statements)).toEqual([]);
    expect(projection).not.toHaveBeenCalled();
    expect(await db().select().from(playerLeaderboardVersions)).toEqual([]);
    expect(await refreshPlayerLeaderboard()).toMatchObject({
      status: "pending",
      created: false,
    });
    expect(projection).not.toHaveBeenCalled();
    const source = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions);
    const expected = await readOnlyData(async () =>
      projectPlayerLeaderboard(
        (await readTournaments(true)).map((r) => r.edition),
        statistics.publicArchiveStatistics,
      ),
    );
    expect(expected.maps).toBeGreaterThan(0);
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "updated",
      created: true,
      players: expected.players.length,
    });
    projection.mockClear();
    const warm = await observe(() =>
      withReadChannel(() => databasePlayerLeaderboard()),
    );
    expect(warm.value).toMatchObject({ ...expected, state: "ready" });
    expect(sourceJson(warm.statements)).toEqual([]);
    expect(
      warm.statements.some((s) => /archive_rel_|archive_read_plays/.test(s)),
    ).toBe(false);
    expect(projection).not.toHaveBeenCalled();
    for (const row of expected.players)
      expect((await databasePublicPlayerMra(row.osuId)).mra).toBe(row.mra);
    expect((await databasePublicPlayerMra(999999)).mra).toBeNull();
    const api = await readApiRoute(
      new Request("https://oclr.example.test/api/v1/rankings/players"),
    );
    expect(api.status).toBe(200);
    expect((await api.json()).data).toMatchObject({
      state: "ready",
      players: expected.players,
    });
    expect(projection).not.toHaveBeenCalled();
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "current",
      created: false,
    });
    expect(await db().select().from(historicalStatistics)).toEqual(source);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    await expect(
      withReadChannel(() => refreshPlayerLeaderboard(true)),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db().select().from(playerLeaderboardVersions)).toHaveLength(1);
    await expect(
      db().update(playerLeaderboardRows).set({ mra: 9 }),
    ).rejects.toThrow();
    await expect(db().delete(playerLeaderboardVersions)).rejects.toThrow();
  });
  it("publishes career totals and beatmap stats through the shared job and invalidates only the affected live ranking", async () => {
    const projection = vi.spyOn(statistics, "publicArchiveStatistics");
    for (const kind of ["career", "beatmap"]) {
      const response = await readApiRoute(
        new Request(`https://oclr.example.test/api/v1/rankings/${kind}`),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({
        state: "pending",
        calculatedAt: null,
      });
    }
    expect(projection).not.toHaveBeenCalled();
    expect(await db().select().from(rankingSnapshots)).toEqual([]);
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      career: "updated",
      beatmap: "updated",
    });
    expect(projection).toHaveBeenCalledTimes(1);
    const initialCareer = await databaseCareerLeaderboard();
    expect(
      initialCareer.players.find((row) => row.osuId === 91003)?.career,
    ).toMatchObject({ seasons: 1, mapsPlayed: expect.any(Number) });
    const initialBeatmaps = await databaseBeatmapLeaderboard();
    expect(initialBeatmaps.maps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beatmapId: 10001,
          plays: expect.any(Number),
        }),
      ]),
    );

    const slug = edition.slug;
    await seedEditions([edition]);
    await db()
      .insert(users)
      .values({ osuId: 91003, username: "Synthetic player" });
    await db()
      .insert(captains)
      .values({
        editionSlug: slug,
        userId: 91003,
        position: 1,
        published: true,
      });
    const [team] = await db()
      .insert(teams)
      .values({
        editionSlug: slug,
        captainId: 91003,
        name: "Synthetic team",
        finalizedAt: new Date(),
        identityPublished: true,
        rosterPublished: true,
      })
      .returning();
    await db()
      .insert(memberships)
      .values({
        editionSlug: slug,
        teamId: team.id,
        userId: 91003,
        origin: "synthetic",
      });
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: slug, kind: "knockout" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: slug,
        stageId: stage.id,
        name: "Grand Final",
        position: 1,
      })
      .returning();
    const [pool] = await db()
      .insert(mappools)
      .values({
        editionSlug: slug,
        roundId: round.id,
        name: "Live pool",
        publishedAt: new Date(),
      })
      .returning();
    const { beatmapId, metadata, category, position } =
      syntheticPublicPools[0].entries[0];
    await db()
      .insert(mappoolEntries)
      .values({ poolId: pool.id, beatmapId, metadata, category, position });

    await refreshPlayerLeaderboard(true);
    projection.mockClear();
    const career = await databaseCareerLeaderboard();
    const beatmaps = await databaseBeatmapLeaderboard();
    expect(
      career.players.find((row) => row.osuId === 91003)?.career.seasons,
    ).toBe(2);
    expect(
      beatmaps.maps.find((row) => row.beatmapId === beatmapId),
    ).toMatchObject({
      difficulty: metadata.difficulty,
      stars: metadata.stars,
      plays: 0,
    });
    for (const [kind, result] of [
      ["career", career],
      ["beatmap", beatmaps],
    ] as const) {
      const response = await readApiRoute(
        new Request(`https://oclr.example.test/api/v1/rankings/${kind}`),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual(result);
    }
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "current",
    });
    expect(projection).not.toHaveBeenCalled();

    await db()
      .update(mappoolEntries)
      .set({ metadata: { ...metadata, stars: metadata.stars + 1 } })
      .where(eq(mappoolEntries.poolId, pool.id));
    expect(await databaseBeatmapLeaderboard()).toMatchObject({
      state: "pending",
      maps: [],
    });
    expect(await databaseCareerLeaderboard()).toEqual(career);
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      career: "current",
      beatmap: "updated",
    });
    expect(
      (await databaseBeatmapLeaderboard()).maps.find(
        (row) => row.beatmapId === beatmapId,
      )?.stars,
    ).toBe(metadata.stars + 1);
    await db()
      .update(mappools)
      .set({ publishedAt: null })
      .where(eq(mappools.id, pool.id));
    expect(await databaseBeatmapLeaderboard()).toMatchObject({
      state: "pending",
      maps: [],
    });

    await db()
      .update(teams)
      .set({ rosterPublished: false })
      .where(eq(teams.id, team.id));
    expect(await databaseCareerLeaderboard()).toMatchObject({
      state: "pending",
      players: [],
    });
    await refreshPlayerLeaderboard(true);
    expect(
      (await databaseCareerLeaderboard()).players.find(
        (row) => row.osuId === 91003,
      )?.career.seasons,
    ).toBe(1);
    expect(
      (await databaseBeatmapLeaderboard()).maps.some(
        (row) => row.beatmapId === beatmapId,
      ),
    ).toBe(false);
    await expect(db().delete(rankingSnapshots)).rejects.toThrow();
  });
  it("keeps saved pp/art fresh without recalculating rankings and invalidates immediately on source or publication changes", async () => {
    await refreshPlayerLeaderboard(true);
    const now = new Date();
    await db()
      .insert(userProfileCache)
      .values({
        osuId: 91003,
        mode: "osu",
        profile: normalizeOsuProfile(
          { ...profileResponse, id: 91003 },
          91003,
          "osu",
        ),
        attemptedAt: now,
        retryAt: now,
      });
    expect(
      (await databasePlayerLeaderboard()).players.find((p) => p.osuId === 91003)
        ?.pp,
    ).toBe(1234.56);
    await db()
      .update(userProfileCache)
      .set({
        profile: sql`jsonb_set(profile,'{statistics,pp}','4321'::jsonb)`,
      });
    expect(
      (await databasePlayerLeaderboard()).players.find((p) => p.osuId === 91003)
        ?.pp,
    ).toBe(4321);
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "current",
    });
    // A legacy correction can change published content without advancing version.
    await db()
      .update(historicalStatistics)
      .set({
        published: sql`jsonb_set(published,'{source,games,0,scores,0,total}','850001'::jsonb)`,
      })
      .where(eq(historicalStatistics.mpId, 999177));
    expect((await databasePublicPlayerMra(91003)).state).toBe("pending");
    await refreshPlayerLeaderboard(true);
    expect((await databasePublicPlayerMra(91003)).state).toBe("ready");
    await db()
      .update(historicalStatistics)
      .set({ published: null, publishedAt: null })
      .where(eq(historicalStatistics.mpId, 999177));
    expect(await databasePublicPlayerMra(91003)).toMatchObject({
      state: "pending",
      mra: null,
    });
    expect((await databasePlayerLeaderboard()).players).toEqual([]);
    await refreshPlayerLeaderboard(true);
    expect((await databasePublicPlayerMra(91003)).mra).toBeNull();
    const [state] = await db().select().from(editionState);
    await db()
      .update(editionState)
      .set({ configuration: { ...state.configuration!, published: false } });
    expect((await databasePlayerLeaderboard()).state).toBe("pending");
    expect(await db().select().from(playerLeaderboardVersions)).toHaveLength(3);
  });
  it("overlays the latest public current name by UID without changing saved rankings or historical names", async () => {
    await refreshPlayerLeaderboard(true);
    const before = await databasePlayerLeaderboard();
    const [first, second] = before.players;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const stored = await db().select().from(playerLeaderboardRows);
    const history = await db().select().from(historicalStatistics);
    await db()
      .insert(playerNames)
      .values([
        {
          osuId: first.osuId,
          username: "Older provider",
          source: "osu_current",
          published: true,
          lastObservedAt: new Date("2026-01-01"),
        },
        {
          osuId: first.osuId,
          username: "Current ID",
          source: "osu_current",
          published: true,
          lastObservedAt: new Date("2026-02-01"),
        },
        {
          osuId: first.osuId,
          username: "Previous alias",
          source: "osu_previous",
          published: true,
          lastObservedAt: new Date("2026-03-01"),
        },
        {
          osuId: first.osuId,
          username: "Private login",
          source: "account",
          lastObservedAt: new Date("2026-04-01"),
        },
        {
          osuId: second.osuId,
          username: "Current ID",
          source: "osu_current",
          published: true,
          lastObservedAt: new Date("2026-02-01"),
        },
        {
          osuId: second.osuId,
          username: "Unreleased",
          source: "osu_current",
          published: false,
          lastObservedAt: new Date("2026-05-01"),
        },
      ]);
    const renamed = await databasePlayerLeaderboard();
    expect(renamed.players).toEqual(
      before.players.map((p) => ({
        ...p,
        username: [first.osuId, second.osuId].includes(p.osuId)
          ? "Current ID"
          : p.username,
      })),
    );
    await db()
      .insert(playerNames)
      .values({
        osuId: first.osuId,
        username: "Renamed again",
        source: "osu_current",
        published: true,
        lastObservedAt: new Date("2026-06-01"),
      });
    const api = await readApiRoute(
      new Request("https://oclr.example.test/api/v1/rankings/players"),
    );
    expect(api.status).toBe(200);
    expect(
      (await api.json()).data.players.find(
        (p: { osuId: number }) => p.osuId === first.osuId,
      ).username,
    ).toBe("Renamed again");
    expect(await db().select().from(playerLeaderboardRows)).toEqual(stored);
    expect(await db().select().from(historicalStatistics)).toEqual(history);
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "current",
      created: false,
    });
  });
  it("serializes jobs and rejects a source changed during calculation without replacing valid snapshots", async () => {
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
      }),
      started = new Promise<void>((resolve) => {
        entered = resolve;
      });
    const original = statistics.publicArchiveStatistics;
    const spy = vi
      .spyOn(statistics, "publicArchiveStatistics")
      .mockImplementation(async (...args) => {
        entered();
        await blocked;
        return original(...args);
      });
    const running = refreshPlayerLeaderboard(true);
    await started;
    expect(await refreshPlayerLeaderboard(true)).toMatchObject({
      status: "busy",
      created: false,
    });
    await db()
      .update(historicalStatistics)
      .set({ version: 9 })
      .where(eq(historicalStatistics.mpId, 999177));
    release();
    expect(await running).toMatchObject({
      status: "superseded",
      created: false,
    });
    expect(await db().select().from(playerLeaderboardVersions)).toEqual([]);
    expect(await db().select().from(rankingSnapshots)).toEqual([]);
    spy.mockRestore();
    await refreshPlayerLeaderboard(true);
    const before = await db().select().from(playerLeaderboardVersions);
    vi.spyOn(statistics, "publicArchiveStatistics").mockRejectedValue(
      new Error("Synthetic transient failure"),
    );
    await expect(refreshPlayerLeaderboard(true, true)).rejects.toThrow(
      "Synthetic transient failure",
    );
    expect(await db().select().from(playerLeaderboardVersions)).toEqual(before);
    expect((await databasePlayerLeaderboard()).state).toBe("ready");
  });
});
