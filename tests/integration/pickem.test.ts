import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db";
import {
  fixtures,
  matchResults,
  pickemPicks,
  pickemVisibility,
  resultRevisions,
  tournamentRounds,
  tournamentStages,
  users,
} from "../../src/db/schema";
import type { ScoringRules } from "../../src/lib/competition-model";
import {
  commandPickemFixture,
  pickemRead,
  savePickemPick,
  savePickemSettings,
  pickemNamedPredictions,
} from "../../src/lib/pickem";
import { assertTestDatabase } from "../database";
import { seedPublicDirectory } from "../fixtures/players";

import { GET as namedPredictionsRoute } from "../../src/app/api/tournaments/[edition]/pickem/fixtures/[fixtureId]/predictions/route";
const session = vi.hoisted(() => ({
  user: null as { osuId: number; username: string } | null,
}));
vi.mock("@/lib/auth/user", () => ({ currentUser: async () => session.user }));

const dbUrl = process.env.TEST_DATABASE_URL;
const slug = "test-cup";
const admin = { osuId: 281090, username: "Synthetic Prediction Admin" };
const alice = { osuId: 281091, username: "Synthetic Prediction Alice" };
const bob = { osuId: 281092, username: "Synthetic Prediction Bob" };
const rules: ScoringRules = {
  version: "synthetic-v1",
  mode: "osu",
  teamType: "team-vs",
  scoringType: "scorev2",
  aggregation: "sum",
  playersPerTeam: 2,
  series: { type: "first_to", wins: 5 },
  allowSubstitutions: false,
  allowShortHanded: false,
  failedScorePolicy: "include",
  tiedMapPolicy: "require_replay",
};
const future = (hours: number) => new Date(Date.now() + hours * 3600000);

describe.skipIf(!dbUrl)(
  "Pick’em publication, submissions and settlement",
  () => {
    let fixture: typeof fixtures.$inferSelect;
    let homeId: string;
    let awayId: string;
    beforeAll(() => {
      assertTestDatabase(dbUrl);
      vi.stubEnv("DATABASE_URL", dbUrl);
      vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    });
    beforeEach(async () => {
      await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
      homeId = (await seedPublicDirectory(281100)).teamId;
      awayId = (await seedPublicDirectory(281200)).teamId;
      await db().insert(users).values([admin, alice, bob]);
      const [stage] = await db()
        .insert(tournamentStages)
        .values({ editionSlug: slug, kind: "group" })
        .returning();
      const [round] = await db()
        .insert(tournamentRounds)
        .values({
          editionSlug: slug,
          stageId: stage.id,
          position: 1,
          name: "Synthetic BO9",
          scoringRules: rules,
        })
        .returning();
      [fixture] = await db()
        .insert(fixtures)
        .values({
          editionSlug: slug,
          roundId: round.id,
          label: "Synthetic match",
          homeTeamId: homeId,
          awayTeamId: awayId,
          position: 1,
          scheduledAt: future(3),
          publishedAt: new Date(),
          timeZone: "Asia/Taipei",
        })
        .returning();
    });
    afterAll(async () => {
      await closeDb();
      vi.unstubAllEnvs();
    });

    async function opened() {
      await savePickemSettings(slug, admin, {
        enabled: true,
        expectedVersion: 0,
      });
      return commandPickemFixture(slug, admin, fixture.id, {
        action: "open",
        closesAt: future(2).toISOString(),
        fixtureVersion: fixture.version,
        scoreEnabled: true,
      });
    }

    async function publish(
      revision: number,
      homeWins: number,
      awayWins: number,
      approved = true,
    ) {
      const winners = [
        ...Array<string>(homeWins).fill(homeId),
        ...Array<string>(awayWins).fill(awayId),
      ];
      await db()
        .insert(resultRevisions)
        .values({
          fixtureId: fixture.id,
          revision,
          createdBy: admin.osuId,
          approvedBy: approved ? admin.osuId : null,
          approvedAt: approved ? new Date() : null,
          proposal: {
            schemaVersion: 1,
            fixtureVersion: fixture.version,
            roundId: fixture.roundId,
            poolVersion: null,
            poolSnapshot: null,
            teamIds: [homeId, awayId],
            rosterSnapshot: [
              { teamId: homeId, osuIds: [] },
              { teamId: awayId, osuIds: [] },
            ],
            rulesSnapshot: rules,
            sourceFingerprint: "a".repeat(64),
            decisions: [],
            publicNote: "",
            games: [],
            referee: {
              revision,
              games: winners.map((winnerTeamId, index) => ({
                attemptId: randomUUID(),
                beatmapId: index + 1,
                category: "NM",
                winnerTeamId,
              })),
            },
            series: {
              homeWins,
              awayWins,
              tiedMaps: 0,
              includedGames: winners.length,
              winnerTeamId: homeWins > awayWins ? homeId : awayId,
              draw: false,
              complete: true,
            },
          },
        });
      await db()
        .update(matchResults)
        .set({ publishedAt: new Date(), publishedRevision: revision })
        .where(eq(matchResults.fixtureId, fixture.id));
    }

    it("keeps picks private until cutoff and recalculates when the official revision changes", async () => {
      await expect(pickemRead(slug, null)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        savePickemSettings(slug, bob, { enabled: true, expectedVersion: 0 }),
      ).rejects.toMatchObject({ status: 403 });
      const window = await opened();
      const body = {
        windowId: window.id,
        expectedVersion: null,
        outcomeKey: "home" as const,
        publishAfterDeadline: true as const,
        score: { homeWins: 5, awayWins: 3 },
      };
      const requestId = randomUUID();
      const first = await savePickemPick(
        slug,
        alice,
        fixture.id,
        body,
        requestId,
      );
      expect(
        await savePickemPick(slug, alice, fixture.id, body, requestId),
      ).toEqual(expect.objectContaining({ saved: first.saved }));
      await expect(
        savePickemPick(
          slug,
          alice,
          fixture.id,
          { ...body, score: null },
          requestId,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        savePickemPick(
          slug,
          bob,
          fixture.id,
          { ...body, score: { homeWins: 4, awayWins: 3 } },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 400 });
      const competing = await Promise.allSettled(
        [1, 2].map(() =>
          savePickemPick(
            slug,
            bob,
            fixture.id,
            { ...body, score: null },
            randomUUID(),
          ),
        ),
      );
      expect(
        competing.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect((await pickemRead(slug, bob)).cards[0]).not.toHaveProperty(
        "distribution",
      );
      expect((await pickemRead(slug, null)).cards[0].mine).toBeNull();
      await expect(
        pickemNamedPredictions(slug, fixture.id, window.id),
      ).rejects.toMatchObject({ status: 409 });
      await db()
        .update(pickemPicks)
        .set({ namedAfterDeadline: false })
        .where(
          and(
            eq(pickemPicks.windowId, window.id),
            eq(pickemPicks.userId, bob.osuId),
          ),
        );
      await db().insert(pickemVisibility).values({
        editionSlug: slug,
        userId: bob.osuId,
        listed: false,
        version: 1,
      });

      const close = await commandPickemFixture(slug, admin, fixture.id, {
        action: "close",
        windowId: window.id,
        expectedVersion: window.version,
      });
      await expect(
        savePickemPick(
          slug,
          alice,
          fixture.id,
          { ...body, expectedVersion: 1 },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: "prediction_closed" });
      expect((await pickemRead(slug, null)).cards).toHaveLength(0);
      expect(
        (await pickemRead(slug, bob)).cards[0].distribution,
      ).toContainEqual({ outcomeKey: "home", count: 2 });
      expect(close.closesAt.getTime()).toBeLessThan(window.closesAt.getTime());
      const reveal = new Request(
        `http://localhost/api/tournaments/${slug}/pickem/fixtures/${fixture.id}/predictions?window=${window.id}`,
      );
      const context = {
        params: Promise.resolve({ edition: slug, fixtureId: fixture.id }),
      };
      session.user = null;
      expect((await namedPredictionsRoute(reveal, context)).status).toBe(401);
      session.user = bob;
      const revealed = await namedPredictionsRoute(reveal, context);
      expect(revealed.status).toBe(200);
      expect(revealed.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await revealed.json()).toEqual({
        rows: [
          {
            username: alice.username,
            outcomeKey: "home",
            score: { homeWins: 5, awayWins: 3 },
          },
        ],
        nextCursor: null,
      });
      session.user = null;

      await db()
        .update(fixtures)
        .set({ status: "ended" })
        .where(eq(fixtures.id, fixture.id));
      await db().insert(matchResults).values({ fixtureId: fixture.id });
      await publish(1, 5, 3, false);
      expect((await pickemRead(slug, alice)).cards[0]).toMatchObject({
        status: "pending",
        points: null,
      });
      await publish(2, 5, 3);
      const exact = await pickemRead(slug, alice, fixture.roundId);
      expect(exact.cards[0].points).toEqual({
        outcomePoints: 1,
        scorePoints: 1,
        points: 2,
      });
      expect(
        exact.leaderboard.map(({ username, points, position }) => [
          username,
          points,
          position,
        ]),
      ).toEqual([
        [alice.username, 2, 1],
        [bob.username, 1, 2],
      ]);

      await publish(3, 5, 1);
      const corrected = await pickemRead(slug, alice, fixture.roundId);
      expect(corrected.cards[0].points).toEqual({
        outcomePoints: 1,
        scorePoints: 0,
        points: 1,
      });
      expect(
        corrected.leaderboard.map(({ position, tied }) => [position, tied]),
      ).toEqual([
        [1, true],
        [1, true],
      ]);
      expect(corrected.seasonLeaderboard).toHaveLength(2);
      await db()
        .update(matchResults)
        .set({ publishedAt: null, publishedRevision: null })
        .where(eq(matchResults.fixtureId, fixture.id));
      const withdrawn = await pickemRead(slug, alice);
      expect(withdrawn.cards[0]).toMatchObject({
        status: "pending",
        points: null,
      });
      expect(withdrawn.seasonLeaderboard).toHaveLength(0);
    });

    it("keeps the earlier cutoff when rescheduled again and voids changed rules", async () => {
      const window = await opened();
      const earlier = future(1);
      await db()
        .update(fixtures)
        .set({ scheduledAt: earlier })
        .where(eq(fixtures.id, fixture.id));
      await db()
        .update(fixtures)
        .set({ scheduledAt: future(4) })
        .where(eq(fixtures.id, fixture.id));
      expect((await pickemRead(slug, alice)).cards[0].closesAt).toBe(
        earlier.toISOString(),
      );
      await savePickemPick(
        slug,
        alice,
        fixture.id,
        {
          windowId: window.id,
          expectedVersion: null,
          outcomeKey: "home",
          publishAfterDeadline: true,
        },
        randomUUID(),
      );
      await db()
        .update(tournamentRounds)
        .set({
          scoringRules: { ...rules, series: { type: "first_to", wins: 4 } },
        })
        .where(eq(tournamentRounds.id, fixture.roundId));
      expect((await pickemRead(slug, alice)).cards[0]).toMatchObject({
        status: "void",
        voidReason: "round_changed",
        points: null,
      });
      await expect(
        pickemNamedPredictions(slug, fixture.id, window.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        pickemNamedPredictions("private-test-cup", fixture.id, window.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        savePickemPick(
          "private-test-cup",
          alice,
          fixture.id,
          {
            windowId: window.id,
            expectedVersion: 1,
            outcomeKey: "away",
            publishAfterDeadline: true,
          },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  },
);
