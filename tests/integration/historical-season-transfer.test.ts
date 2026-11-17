import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "../../src/db";
import {
  editionEvents,
  editionState,
  historicalStatistics,
  historicalBrackets,
  historicalBracketMatches,
  historicalBracketAdvancements,
  staffRoles,
  users,
  transferredHistoricalStatisticsReleases,
} from "../../src/db/schema";
import {
  GET,
  POST,
} from "../../src/app/api/admin/tournaments/[edition]/archive-json/route";
import {
  archiveFromSeason,
  historicalSeasonJsonSchema,
  portableEdition,
  seasonJsonFromArchive,
} from "../../src/lib/historical-season-json";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";
import { readArchiveProgression } from "../../src/lib/archive-progression";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
import { statisticsSource } from "../fixtures/archive-statistics";
import { completeArchive } from "../fixtures/archive-relations";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";
import { assertTestDatabase } from "../database";
import {
  exportHistoricalSeason,
  transferHistoricalSeason,
} from "../../src/lib/historical-season-transfer";

const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 392401, username: "Synthetic transfer admin" };
const missingActor = { osuId: 392402, username: "Synthetic missing user" };
const other = { osuId: 392403, username: "Synthetic scoped admin" };
const slug = "transfer-archive";
const origin = "https://oclr.example.test";
async function clearSyntheticBracket() {
  await db()
    .delete(historicalBracketAdvancements)
    .where(eq(historicalBracketAdvancements.editionSlug, slug));
  await db()
    .delete(historicalBracketMatches)
    .where(eq(historicalBracketMatches.editionSlug, slug));
  await db()
    .delete(historicalBrackets)
    .where(eq(historicalBrackets.editionSlug, slug));
}
const target = {
  ...edition,
  slug,
  status: "completed" as const,
  published: false,
  registration: null,
};
vi.mock("../../src/lib/auth/user", () => ({
  requireUser: async () => ({
    osuId: 392401,
    username: "Synthetic transfer admin",
  }),
}));
vi.mock("../../src/lib/next-revalidation", () => ({
  revalidateCommittedPath: vi.fn(),
}));

function completePackage() {
  const archive = completeArchive(slug);
  const source = statisticsSource();
  source.games[0].scores[0].total = 0;
  const draft = {
    archiveKey: statisticsArchiveKey(archive),
    poolId: "final",
    source,
    included: [2],
  };
  const fixture = archive.matches[0];
  return seasonJsonFromArchive(
    portableEdition(target),
    archive,
    {
      sourceUrl: archive.sourceUrl.replace(/\/edit$/, ""),
      matches: [
        {
          fixtureId: fixture.id,
          lane: "grand-final",
          teamA: fixture.teamA,
          teamB: fixture.teamB,
          winnerSlot: 0,
          seedA: null,
          seedB: null,
        },
      ],
      advancements: [],
    },
    [
      {
        mpId: source.match.id,
        fixtureId: fixture.id,
        draft,
        releaseEvidence: {
          snapshot: { ...draft, included: [1, 2] },
          publishedAt: "2026-11-01T00:00:00.000Z",
        },
      },
    ],
  );
}

describe.skipIf(!url)("database historical season JSON", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("ADMIN_OSU_IDS", [admin.osuId, missingActor.osuId].join(","));
    vi.stubEnv("APP_URL", origin);
    await clearSyntheticBracket();
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await db().insert(users).values([admin, other]);
    await seedEditions([target, { ...target, slug: "different-archive" }]);
    await db().insert(staffRoles).values({
      userId: other.osuId,
      role: "admin",
      editionSlug: "different-archive",
      grantedBy: admin.osuId,
    });
  });

  afterAll(async () => {
    await clearSyntheticBracket();
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("exports each historical season from the same database format", async () => {
    const example = completeArchive();
    for (let n = 1; n <= 10; n++) {
      const season = `s${n}`;
      const plan = (await readArchiveProgression(season))!;
      const teamIds = [
        ...new Set(plan.matches.flatMap((match) => [match.teamA, match.teamB])),
      ];
      const archive =
        n === 10
          ? historicalArchiveSchema.parse(
              JSON.parse(readFileSync("docs/imports/s10-archive.json", "utf8")),
            )
          : historicalArchiveSchema.parse({
              ...example,
              editionSlug: season,
              sourceUrl: plan.bracket.sourceUrl,
              teams: teamIds.map((id) => ({
                id,
                name: id,
                source: "Synthetic team",
              })),
              players: teamIds.map((teamId, i) => ({
                teamId,
                osuId: 992000 + i,
                username: `Synthetic Captain ${i}`,
                role: "captain",
                tier: 0,
                source: "Synthetic player",
              })),
              unresolvedPlayers: undefined,
              rosterReplacements: undefined,
              standings: [],
              picks: [],
              finalPlacements: undefined,
              qualifiers: undefined,
              reviewTables: undefined,
              matches: plan.matches.map((m) => ({
                ...example.matches[0],
                id: m.fixtureId,
                teamA: m.teamA,
                teamB: m.teamB,
                score: m.winnerSlot === 0 ? [1, 0] : [0, 1],
                review: undefined,
                mpUrls: [],
              })),
            });
      await seedEditions([
        { ...target, slug: season, published: true, archive },
      ]);
      const result = await exportHistoricalSeason(admin, season);
      expect(historicalSeasonJsonSchema.safeParse(result).success).toBe(true);
      expect(result.competition.bracket?.matches).toHaveLength(
        plan.matches.length,
      );
      expect(result.competition.bracket?.advancements).toHaveLength(
        plan.advancements.length,
      );
      expect(result.edition).not.toHaveProperty("published");
    }
  });

  it("rejects unauthorized access and invalid commands, rolls back, then roundtrips through the route", async () => {
    const source = completePackage();
    const bracket = source.competition.bracket!;
    const room = source.statistics[0];
    await seedEditions([
      {
        ...target,
        published: true,
        archive: archiveFromSeason(source),
      },
    ]);
    await db().insert(historicalBrackets).values({
      editionSlug: slug,
      sourceUrl: bracket.sourceUrl,
      matchCount: 1,
      advancementCount: 0,
    });
    await db()
      .insert(historicalBracketMatches)
      .values({
        ...bracket.matches[0],
        editionSlug: slug,
        position: 0,
      });
    await db()
      .insert(historicalStatistics)
      .values({
        editionSlug: slug,
        mpId: room.mpId,
        fixtureId: room.fixtureId,
        draft: room.draft,
        published: room.releaseEvidence!.snapshot,
        publishedAt: new Date(room.releaseEvidence!.publishedAt!),
      });

    const context = { params: Promise.resolve({ edition: slug }) };
    const path = `${origin}/api/admin/tournaments/${slug}/archive-json`;
    const initial = await GET(new Request(path), context);
    expect(initial.status).toBe(200);
    const exported = await initial.text();
    const input = JSON.parse(exported);
    expect(input).toEqual(JSON.parse(JSON.stringify(source)));

    await db()
      .delete(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, slug));
    await clearSyntheticBracket();
    await seedEditions([target]);

    const request = (command: object) =>
      new Request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          Origin: origin,
        },
        body: new Blob([new Uint8Array(gzipSync(JSON.stringify(command)))]),
      });
    await expect(exportHistoricalSeason(other, slug)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      transferHistoricalSeason(other, slug, input, 0),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      transferHistoricalSeason(admin, "different-archive", input, 0),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      transferHistoricalSeason(admin, slug, { ...input, version: 7 }, 0),
    ).rejects.toThrow("version");
    const missing = structuredClone(input);
    missing.statistics[0].fixtureId = "unknown";
    await expect(
      transferHistoricalSeason(admin, slug, missing, 0),
    ).rejects.toThrow("statistics.0.fixtureId");

    const previewCommand = {
      action: "preview",
      expectedRevision: 0,
      package: input,
    };
    const response = await POST(request(previewCommand), context);
    expect(response.status).toBe(200);
    const { previewToken } = await response.json();
    expect(typeof previewToken).toBe("string");
    expect(
      await db()
        .select()
        .from(historicalStatistics)
        .where(eq(historicalStatistics.editionSlug, slug)),
    ).toEqual([]);
    const changedFile = {
      ...input,
      edition: { ...input.edition, name: "Another archive" },
    };
    await expect(
      transferHistoricalSeason(admin, slug, changedFile, 0, previewToken),
    ).rejects.toMatchObject({ status: 409 });
    // The final audit insert fails on its actor FK after writing archive, bracket and stats.
    await expect(
      transferHistoricalSeason(missingActor, slug, input, 0, previewToken),
    ).rejects.toThrow();
    const [rolledBack] = await db()
      .select()
      .from(editionState)
      .where(eq(editionState.slug, slug));
    expect(rolledBack.configurationVersion).toBe(0);
    expect(rolledBack.configuration?.archive).toBeUndefined();
    expect(
      await db()
        .select()
        .from(historicalStatistics)
        .where(eq(historicalStatistics.editionSlug, slug)),
    ).toEqual([]);

    const commit = {
      ...previewCommand,
      action: "import",
      previewToken,
      confirmed: true,
    };
    const outcomes = await Promise.all([
      POST(request(commit), context),
      POST(request(commit), context),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    for (const response of outcomes) await response.json();

    const downloaded = await GET(new Request(path), context);
    expect(downloaded.headers.get("Cache-Control")).toBe("private, no-store");
    expect(downloaded.headers.get("Content-Disposition")).toContain(
      `${slug}-historical-season.v1.json`,
    );
    expect(await downloaded.text()).toBe(exported);
    const [stats] = await db()
      .select()
      .from(historicalStatistics)
      .where(eq(historicalStatistics.editionSlug, slug));
    expect(stats.published).toBeNull();
    const [evidence] = await db()
      .select()
      .from(transferredHistoricalStatisticsReleases)
      .where(eq(transferredHistoricalStatisticsReleases.editionSlug, slug));
    expect(evidence.snapshot.included).toEqual([1, 2]);

    const next = await transferHistoricalSeason(admin, slug, input, 1);
    expect(next).toMatchObject({ action: "preview", changed: false });
    if (next.action !== "preview") throw new Error("Missing preview");
    await expect(
      transferHistoricalSeason(admin, slug, input, 1, next.previewToken),
    ).resolves.toMatchObject({ revision: 1, changed: false });
    expect(
      await db()
        .select()
        .from(editionEvents)
        .where(eq(editionEvents.editionSlug, slug)),
    ).toHaveLength(1);
  });
});
