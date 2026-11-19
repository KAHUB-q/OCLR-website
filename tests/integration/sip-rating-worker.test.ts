import { closeDb, db } from "../../src/db";
import {
  importedPlayerRatings,
  registrations,
  sipRatingCache,
  users,
} from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { sipResponse } from "../fixtures/sip-response";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { publicPlayerDirectoryModel } from "../../src/lib/public-read-models";
import { refreshSipRatings } from "../../src/lib/sip-rating-worker";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

const url = process.env.TEST_DATABASE_URL;
const slug = "s11";
const ids = [90401, 90402, 90403, 90404, 90405, 90406, 90407, 90408, 90409];
const [
  updated,
  modOnly,
  skillOnly,
  unrated,
  missing,
  failed,
  limited,
  deferred,
  pending,
] = ids;

describe.skipIf(!url)("Daily S11 SIP cache", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("SIP_API_TOKEN", "synthetic-worker-token");
    await db().execute(sql`TRUNCATE edition_state, users CASCADE`);
    await seedEditions([{ ...edition, slug }, edition]);
    await db()
      .insert(users)
      .values(ids.map((osuId) => ({ osuId, username: `Synthetic ${osuId}` })));
    await db()
      .insert(registrations)
      .values(
        ids.map((userId) => ({
          editionSlug: slug,
          userId,
          status:
            userId === pending ? ("pending" as const) : ("accepted" as const),
          rulesVersion: "test-v1",
          answers: {},
        })),
      );
    await db().insert(importedPlayerRatings).values({
      editionSlug: slug,
      userId: deferred,
      source: "sip",
      value: 9876,
    });
    await db()
      .insert(sipRatingCache)
      .values([
        { osuId: failed, value: 2920, fetchedAt: new Date("2025-01-01") },
        {
          osuId: missing,
          value: 0,
          fetchedAt: new Date("2025-01-01"),
          snapshot: {
            rating: sipResponse(missing, 0).rating,
            modifications: null,
            skillsets: null,
          },
        },
      ]);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await closeDb();
  });

  it("paces provider calls, excludes private players and serves only verified saved totals", async () => {
    const calls: { id: number; at: number }[] = [];
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const id = Number(input.split("/").at(-1));
      calls.push({ id, at: performance.now() });
      expect(input).toBe(`https://skillissue.app/ratings/${id}`);
      expect(new Headers(init.headers).get("source")).toBe(
        "synthetic-worker-token",
      );
      expect(init.redirect).toBe("error");
      if (id === updated) {
        expect((await refreshSipRatings(true)).stopped).toBe("busy");
        return Response.json(sipResponse(id, 4567));
      }
      if (id === modOnly || id === skillOnly || id === unrated) {
        const sample = sipResponse(id, 0);
        return Response.json({
          ...sample,
          rating: null,
          modifications: id === modOnly ? sample.modifications : {},
          skillsets: id === skillOnly ? sample.skillsets : null,
        });
      }
      if (id === missing) return new Response(null, { status: 404 });
      if (id === failed) return Response.json(sipResponse(id + 1, 9999));
      return new Response(null, { status: 429 });
    });

    expect((await refreshSipRatings(false)).pending).toBe(8);
    expect(calls).toHaveLength(0);
    expect(await refreshSipRatings(true)).toEqual({
      pending: 8,
      updated: 3,
      missing: 2,
      failed: 1,
      stopped: "rate-limited",
    });
    expect(calls.map(({ id }) => id)).toEqual([
      updated,
      modOnly,
      skillOnly,
      unrated,
      missing,
      failed,
      limited,
    ]);
    for (let i = 1; i < calls.length; i++)
      expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(990);

    // Successful and unrated players need no second request on the same day.
    expect((await refreshSipRatings(false)).pending).toBe(3);
    const { rows } = await publicPlayerDirectoryModel(slug);
    expect(rows.find((row) => row.osuId === updated)?.importedRatings).toEqual({
      sip: 4567,
    });
    expect(rows.find((row) => row.osuId === failed)?.importedRatings).toEqual({
      sip: 2920,
    });
    expect(rows.find((row) => row.osuId === missing)?.importedRatings).toEqual({
      sip: 0,
    });
    const [retained] = await db()
      .select()
      .from(sipRatingCache)
      .where(eq(sipRatingCache.osuId, missing));
    expect(retained).toMatchObject({
      value: 0,
      fetchedAt: new Date("2025-01-01"),
      notFoundAt: expect.any(Date),
      snapshot: {
        rating: sipResponse(missing, 0).rating,
        modifications: null,
        skillsets: null,
      },
    });
    const [fresh] = await db()
      .select()
      .from(sipRatingCache)
      .where(eq(sipRatingCache.osuId, updated));
    expect(fresh.snapshot).toEqual({
      rating: sipResponse(updated, 4567).rating,
      modifications: sipResponse(updated, 4567).modifications,
      skillsets: sipResponse(updated, 4567).skillsets,
    });
    expect(
      rows.find((row) => row.osuId === deferred)?.importedRatings,
    ).toBeUndefined();
    expect(rows.some((row) => row.osuId === pending)).toBe(false);
    expect(calls).toHaveLength(7);
  });
});
