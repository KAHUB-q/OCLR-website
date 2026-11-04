import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db";
import {
  editionState,
  mappools,
  mappoolEntries,
  mappoolEvents,
  users,
  staffRoles,
} from "../../src/db/schema";
import { mappoolCommand } from "../../src/lib/mappools";
import { historicalPoolChoices } from "../../src/lib/exhibition-pools";
import { fetchBeatmaps } from "../../src/lib/osu-beatmaps";
import { HttpError } from "../../src/lib/http";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { assertTestDatabase } from "../database";
vi.mock("../../src/lib/osu-beatmaps", async (original) => ({
  ...(await original<typeof import("../../src/lib/osu-beatmaps")>()),
  fetchBeatmaps: vi.fn(),
}));
const url = process.env.TEST_DATABASE_URL;
const actor = { osuId: 788001, username: "Synthetic Exhibition Admin" };
const mapper = { osuId: 788002, username: "Synthetic Exhibition Mappooler" };
const outsider = { osuId: 788003, username: "Synthetic Other Edition" };
const confirm = { confirmed: true };
const metadata = {
  setId: 1,
  title: "Synthetic verified map",
  artist: "Synthetic",
  difficulty: "Test",
  mapper: "Test",
  stars: 4,
  bpm: 180,
  duration: 90,
  mode: "osu" as const,
};
describe.skipIf(!url)("exhibition historical pool selection", () => {
  let targetId: string;
  beforeAll(() => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(actor.osuId));
  });
  beforeEach(async () => {
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([
      edition,
      {
        ...edition,
        slug: "past-test",
        status: "completed",
        registration: null,
        archive: { ...historicalArchive, editionSlug: "past-test" },
      },
      {
        ...edition,
        slug: "hidden-test",
        published: false,
        status: "completed",
        registration: null,
        archive: { ...historicalArchive, editionSlug: "hidden-test" },
      },
      { ...edition, slug: "saved-past-test", status: "completed" },
    ]);
    await db().insert(users).values([actor, mapper, outsider]);
    await db()
      .insert(staffRoles)
      .values([
        {
          userId: mapper.osuId,
          role: "mappooler",
          editionSlug: "test-cup",
          grantedBy: actor.osuId,
        },
        {
          userId: outsider.osuId,
          role: "mappooler",
          editionSlug: "hidden-test",
          grantedBy: actor.osuId,
        },
      ]);
    const rounds = await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "round_create",
      stage: "exhibition",
      name: "Synthetic Exhibition",
      position: 1,
    });
    const pools = await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "pool_create",
      roundId: rounds.rounds[0].id,
      name: "Synthetic Exhibition Pool",
    });
    targetId = pools.pools[0].id;
    vi.mocked(fetchBeatmaps)
      .mockReset()
      .mockImplementation(
        async (ids) =>
          new Map(
            ids.map((beatmapId) => [
              beatmapId,
              {
                beatmapId,
                metadata,
                fetchedAt: "2026-01-01T00:00:00Z",
                fingerprint: "a".repeat(64),
              },
            ]),
          ),
      );
  });
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  async function selection() {
    const sources = await historicalPoolChoices("test-cup");
    const source = sources.find((pool) => pool.editionSlug === "past-test")!;
    expect(source).toBeDefined();
    expect(sources.some((pool) => pool.editionSlug === "hidden-test")).toBe(
      false,
    );
    return {
      ...confirm,
      action: "history_import",
      poolId: targetId,
      expectedVersion: 0,
      sourceEdition: source.editionSlug,
      sourcePool: source.poolId,
      sourceFingerprint: source.fingerprint,
      sourceKeys: source.maps
        .filter((map) => map.category !== "FM")
        .map((map) => map.key),
    };
  }
  it("copies selected public archive maps with provenance, appends by category, audits once and preserves source", async () => {
    const command = await selection();
    const before = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, "past-test"));
    const workspace = await mappoolCommand(mapper, "test-cup", command);
    const entries = workspace.entries.filter(
      (entry) => entry.poolId === targetId,
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every((entry) => entry.source?.editionSlug === "past-test"),
    ).toBe(true);
    expect(entries[0].metadata).toEqual(metadata);
    expect(workspace.pools[0].version).toBe(1);
    expect(
      await db()
        .select()
        .from(editionState)
        .where(eq(editionState.slug, "past-test")),
    ).toEqual(before);
    expect(
      await db()
        .select()
        .from(mappoolEvents)
        .where(eq(mappoolEvents.action, "history_import")),
    ).toHaveLength(1);
    await expect(
      mappoolCommand(actor, "test-cup", command),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      mappoolCommand(actor, "test-cup", { ...command, expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db()
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, targetId)),
    ).toHaveLength(entries.length);
  });
  it("rejects hidden, changed and forged sources and unauthorized destinations before provider work", async () => {
    const command = await selection();
    for (const bad of [
      { sourceEdition: "hidden-test" },
      { sourceFingerprint: "0".repeat(64) },
      { sourceKeys: ["NM99"] },
      { sourceEdition: "test-cup" },
    ])
      await expect(
        mappoolCommand(actor, "test-cup", { ...command, ...bad }),
      ).rejects.toBeInstanceOf(HttpError);
    await expect(
      mappoolCommand(outsider, "test-cup", command),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchBeatmaps).not.toHaveBeenCalled();
    expect(await db().select().from(mappoolEntries)).toHaveLength(0);
  });
  it("revalidates source publication after provider lookup and rolls back the entire import", async () => {
    const command = await selection();
    const lookup = vi.mocked(fetchBeatmaps).getMockImplementation()!;
    vi.mocked(fetchBeatmaps).mockImplementationOnce(async (...args) => {
      await db()
        .update(editionState)
        .set({
          configuration: sql`jsonb_set(configuration, '{published}', 'false')`,
        })
        .where(eq(editionState.slug, "past-test"));
      return lookup(...args);
    });
    await expect(
      mappoolCommand(actor, "test-cup", command),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db().select().from(mappoolEntries)).toHaveLength(0);
    expect(
      (await db().select().from(mappools).where(eq(mappools.id, targetId)))[0]
        .version,
    ).toBe(0);
  });
  it("requires an unlocked exhibition pool and keeps provider failures atomic", async () => {
    const command = await selection();
    vi.mocked(fetchBeatmaps).mockResolvedValueOnce(
      new Map([[1, new HttpError(502, "Synthetic provider failure.")]]),
    );
    await expect(
      mappoolCommand(actor, "test-cup", command),
    ).rejects.toMatchObject({ status: 502 });
    await db()
      .update(mappools)
      .set({ selectionLockedAt: new Date() })
      .where(eq(mappools.id, targetId));
    await expect(
      mappoolCommand(actor, "test-cup", command),
    ).rejects.toMatchObject({ status: 409 });
    await db()
      .update(mappools)
      .set({ selectionLockedAt: null, lockedAt: new Date() })
      .where(eq(mappools.id, targetId));
    await expect(
      mappoolCommand(actor, "test-cup", command),
    ).rejects.toMatchObject({ status: 409 });
    const formal = await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "round_create",
      stage: "group",
      name: "Formal",
      position: 1,
    });
    const pools = await mappoolCommand(actor, "test-cup", {
      ...confirm,
      action: "pool_create",
      roundId: formal.rounds.find((round) => round.stage === "group")!.id,
      name: "Formal pool",
    });
    await expect(
      mappoolCommand(actor, "test-cup", {
        ...command,
        poolId: pools.pools.find((pool) => pool.name === "Formal pool")!.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await db().select().from(mappoolEntries)).toHaveLength(0);
  });
  it("lists only released saved pools from completed editions and copies them without changing their rows", async () => {
    const { tournamentRounds, tournamentStages } =
      await import("../../src/db/schema");
    const [stage] = await db()
      .insert(tournamentStages)
      .values({ editionSlug: "saved-past-test", kind: "group" })
      .returning();
    const [round] = await db()
      .insert(tournamentRounds)
      .values({
        editionSlug: "saved-past-test",
        stageId: stage.id,
        name: "Past",
        position: 1,
      })
      .returning();
    const [published] = await db()
      .insert(mappools)
      .values({
        editionSlug: "saved-past-test",
        roundId: round.id,
        name: "Released",
        publishedAt: new Date(),
      })
      .returning();
    await db().insert(mappools).values({
      editionSlug: "saved-past-test",
      roundId: round.id,
      name: "PRIVATE POOL",
    });
    await db().insert(mappoolEntries).values({
      poolId: published.id,
      category: "HD",
      position: 3,
      beatmapId: 75,
      metadata,
    });
    const before = await db()
      .select()
      .from(mappoolEntries)
      .where(eq(mappoolEntries.poolId, published.id));
    const choices = await historicalPoolChoices("test-cup");
    expect(
      choices.filter((pool) => pool.editionSlug === "saved-past-test"),
    ).toHaveLength(1);
    const source = choices.find((pool) => pool.poolId === published.id)!;
    const result = await mappoolCommand(actor, "test-cup", {
      ...(await selection()),
      sourceEdition: source.editionSlug,
      sourcePool: source.poolId,
      sourceFingerprint: source.fingerprint,
      sourceKeys: [source.maps[0].key],
    });
    expect(
      result.entries.find((entry) => entry.poolId === targetId),
    ).toMatchObject({
      category: "HD",
      position: 1,
      source: { slot: "HD3", poolId: published.id },
    });
    expect(
      await db()
        .select()
        .from(mappoolEntries)
        .where(eq(mappoolEntries.poolId, published.id)),
    ).toEqual(before);
    expect(
      await db()
        .select()
        .from(mappoolEvents)
        .where(
          and(
            eq(mappoolEvents.action, "history_import"),
            eq(mappoolEvents.poolId, targetId),
          ),
        ),
    ).toHaveLength(1);
  });
});
