import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  archiveRelationDocuments,
  archiveRelationHeads,
  editionState,
  historicalStatistics,
  historicalStatisticsRevisions,
  users,
} from "../../src/db/schema";
import {
  archiveRelArchiveQualifiersRecordsScores,
  archiveRelStatisticsSourceGamesScores,
} from "../../src/db/archive-relational-schema";
import {
  backfillArchiveRelations,
  verifyArchiveRelations,
  syncArchiveRelations,
  normalizedStatistics,
} from "../../src/lib/archive-relations";
import { publicArchiveStatistics } from "../../src/lib/archive-statistics";
import { readTournament, readTournaments } from "../../src/lib/tournaments";
import { publicPlayer } from "../../src/lib/players";
import { playerMapPerformance } from "../../src/lib/player-map-performance";
import { archiveContentHash } from "../../src/lib/archive-read-model";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { completeArchive } from "../fixtures/archive-relations";
import { statisticsSource } from "../fixtures/archive-statistics";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { assertTestDatabase } from "../database";
import { observe, sourceJson } from "../archive-query-observer";

const url = process.env.TEST_DATABASE_URL;
async function seed(slug = "s7") {
  const archive = completeArchive(slug);
  await seedEditions([
    { ...edition, slug, status: "completed", registration: null, archive },
  ]);
  const snapshot = {
    archiveKey: statisticsArchiveKey(archive),
    source: statisticsSource(),
    poolId: "final",
    included: [1, 2],
  };
  await db()
    .insert(historicalStatistics)
    .values({
      editionSlug: slug,
      fixtureId: "one",
      mpId: 999177,
      version: 3,
      draft: snapshot,
      published: snapshot,
      publishedAt: new Date(0),
    });
}
describe.skipIf(!url)("complete historical database relations", () => {
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
  });
  beforeEach(async () => {
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    await db().execute(sql`TRUNCATE edition_state,users CASCADE`);
    await seed();
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("normalizes every saved season and retains exact public/private and analysis results", async () => {
    for (let n = 1; n <= 10; n++) if (n !== 7) await seed(`s${n}`);
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "jsonb");
    const before = {
      public: await readTournaments(true),
      private: await readTournaments(),
      performance: await playerMapPerformance(await publicPlayer(91003)),
    };
    const raw = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions);
    const statistics = await publicArchiveStatistics("s7");
    vi.stubEnv("OCLR_ARCHIVE_READ_MODEL", "");
    for (let n = 1; n <= 10; n++) {
      const slug = `s${n}`,
        preview = await backfillArchiveRelations(slug);
      expect(preview).toMatchObject({
        documents: 3,
        current: 0,
        stale: 3,
        created: 0,
      });
      expect(await backfillArchiveRelations(slug, true)).toMatchObject({
        current: 3,
        stale: 0,
        created: 3,
      });
      expect(await verifyArchiveRelations(db(), slug)).toMatchObject({
        documents: 3,
      });
    }
    expect(await db().select().from(historicalStatistics)).toEqual(raw);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    expect(await db().select().from(users)).toEqual([]);
    expect({
      public: await readTournaments(true),
      private: await readTournaments(),
      performance: await playerMapPerformance(await publicPlayer(91003)),
    }).toEqual(before);
    const query = await observe(() => publicArchiveStatistics("s7"));
    expect(query.value).toEqual(statistics);
    expect(sourceJson(query.statements)).toEqual([]);
    expect(
      query.statements.some((s) =>
        s.includes('from "archive_rel_statistics_source_games_scores"'),
      ),
    ).toBe(true);
    const detailed = await observe(() => publicArchiveStatistics("s7", "one"));
    expect(sourceJson(detailed.statements)).toEqual([]);
    expect(detailed.value.matchDetails).toHaveLength(1);
    expect(
      (await readTournament("s7"))!.edition.archive!.sourceFacts,
    ).toHaveLength(1);
    expect(
      (await readTournament("s7", undefined, true))!.edition.archive!
        .sourceFacts,
    ).toBeUndefined();
    expect(
      (
        await db().select().from(archiveRelArchiveQualifiersRecordsScores)
      ).every((r) => r.value_score === 0),
    ).toBe(true);
  });
  it("is idempotent under concurrency and updates only changed documents while retaining prior versions", async () => {
    const results = await Promise.all([
      backfillArchiveRelations("s7", true),
      backfillArchiveRelations("s7", true),
    ]);
    expect(results.map((r) => r.created).sort()).toEqual([0, 3]);
    const [before] = await db().select().from(historicalStatistics);
    const prior = await db().select().from(archiveRelationHeads);
    await db().transaction(async (tx) => {
      await tx
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "s7"))
        .for("update");
      await tx
        .update(historicalStatistics)
        .set({
          draft: { ...before.draft, allowUnlistedMaps: true },
          version: 4,
        })
        .where(eq(historicalStatistics.editionSlug, "s7"));
      expect(await syncArchiveRelations(tx, "s7")).toMatchObject({
        created: 1,
      });
    });
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(4);
    const next = await db().select().from(archiveRelationHeads);
    for (const key of ["archive", "999177:published"])
      expect(next.find((h) => h.documentKey === key)!.documentId).toBe(
        prior.find((h) => h.documentKey === key)!.documentId,
      );
    expect(await verifyArchiveRelations(db(), "s7")).toMatchObject({
      documents: 3,
    });
    expect(await backfillArchiveRelations("s7", true, true)).toMatchObject({
      created: 3,
    });
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(7);
  });
  it("invalidates legacy edits and removes withdrawn heads without deleting evidence", async () => {
    await backfillArchiveRelations("s7", true);
    await db()
      .update(historicalStatistics)
      .set({ published: null })
      .where(eq(historicalStatistics.editionSlug, "s7"));
    expect(await normalizedStatistics("s7", db())).toBeUndefined();
    expect((await publicArchiveStatistics("s7")).plays).toEqual([]);
    await expect(verifyArchiveRelations(db(), "s7")).rejects.toMatchObject({
      status: 409,
    });
    await backfillArchiveRelations("s7", true);
    expect(await db().select().from(archiveRelationHeads)).toHaveLength(2);
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(3);
    await db()
      .update(editionState)
      .set({
        configuration: sql`jsonb_set(configuration,'{published}','false')`,
      });
    expect(await readTournament("s7", undefined, true)).toBeUndefined();
    await expect(publicArchiveStatistics("s7")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("rolls back source writes, immutable history and typed documents together on an insert failure", async () => {
    await backfillArchiveRelations("s7", true);
    const raw = await db().select().from(historicalStatistics),
      history = await db().select().from(historicalStatisticsRevisions),
      heads = await db().select().from(archiveRelationHeads);
    await db().execute(
      sql`CREATE FUNCTION public.synthetic_relation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic relation failure'; END; $$`,
    );
    await db().execute(
      sql`CREATE TRIGGER synthetic_relation_failure BEFORE INSERT ON archive_rel_statistics_source_games_scores FOR EACH ROW EXECUTE FUNCTION public.synthetic_relation_failure()`,
    );
    try {
      await expect(
        db().transaction(async (tx) => {
          await tx
            .select()
            .from(editionState)
            .where(eq(editionState.slug, "s7"))
            .for("update");
          await tx
            .update(historicalStatistics)
            .set({ draft: { ...raw[0].draft, included: [1] }, version: 4 });
          await syncArchiveRelations(tx, "s7");
        }),
      ).rejects.toThrow();
    } finally {
      await db().execute(
        sql`DROP TRIGGER synthetic_relation_failure ON archive_rel_statistics_source_games_scores`,
      );
      await db().execute(
        sql`DROP FUNCTION public.synthetic_relation_failure()`,
      );
    }
    expect(await db().select().from(historicalStatistics)).toEqual(raw);
    expect(await db().select().from(historicalStatisticsRevisions)).toEqual(
      history,
    );
    expect(await db().select().from(archiveRelationHeads)).toEqual(heads);
    expect(await db().select().from(archiveRelationDocuments)).toHaveLength(3);
  });
  it("protects normalized history and rejects cross-season pointers", async () => {
    await backfillArchiveRelations("s7", true);
    await seed("s8");
    await backfillArchiveRelations("s8", true);
    const docs = await db().select().from(archiveRelationDocuments);
    await expect(
      db()
        .update(archiveRelationDocuments)
        .set({ contentHash: "b".repeat(64) }),
    ).rejects.toThrow();
    await expect(
      db().delete(archiveRelStatisticsSourceGamesScores),
    ).rejects.toThrow();
    await expect(
      db()
        .update(archiveRelationHeads)
        .set({ documentId: docs.find((d) => d.editionSlug === "s8")!.id })
        .where(eq(archiveRelationHeads.editionSlug, "s7")),
    ).rejects.toThrow();
    expect(
      archiveContentHash((await readTournament("s7"))!.edition.archive),
    ).toBe(archiveContentHash(completeArchive()));
  });
});
