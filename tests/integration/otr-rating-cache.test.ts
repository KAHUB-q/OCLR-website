import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "../../src/db";
import { otrRatingCache } from "../../src/db/schema";
import { readCachedOtrRating } from "../../src/lib/otr-rating-cache";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const rating = {
  value: 1572.48,
  fetchedAt: "2026-11-14T00:00:00.000Z",
  profileUrl: "https://otr.stagec.net/players/321?ruleset=0",
};

describe.skipIf(!url)("persistent o!TR rating cache", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    await db()
      .delete(otrRatingCache)
      .where(inArray(otrRatingCache.osuId, [301060, 301061, 301062]));
  });

  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("reuses successful and missing ratings across database connections", async () => {
    const ids = [301060, 301061];
    const load = vi
      .fn()
      .mockResolvedValueOnce(rating)
      .mockResolvedValueOnce(null);
    expect(await readCachedOtrRating(ids[0], load)).toEqual(rating);
    expect(await readCachedOtrRating(ids[1], load)).toBeNull();
    await closeDb();
    expect(await readCachedOtrRating(ids[0], load)).toEqual(rating);
    expect(await readCachedOtrRating(ids[1], load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares a refresh claim, keeps the previous rating during backoff and clears a confirmed missing rating", async () => {
    const osuId = 301062;
    const expire = () =>
      db()
        .update(otrRatingCache)
        .set({ retryAt: new Date(0) })
        .where(eq(otrRatingCache.osuId, osuId));
    await db()
      .insert(otrRatingCache)
      .values({ osuId, rating, retryAt: new Date(0) });

    const duringRefresh = vi.fn();
    let concurrentRating;
    const load = vi.fn(async () => {
      concurrentRating = await readCachedOtrRating(osuId, duringRefresh);
      throw new Error("Provider timeout");
    });
    expect(await readCachedOtrRating(osuId, load)).toEqual(rating);
    expect(concurrentRating).toEqual(rating);
    expect(await readCachedOtrRating(osuId, load)).toEqual(rating);
    expect(duringRefresh).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();

    await expire();
    const missing = vi.fn().mockResolvedValue(null);
    expect(await readCachedOtrRating(osuId, missing)).toBeNull();
    expect(await readCachedOtrRating(osuId, missing)).toBeNull();
    expect(missing).toHaveBeenCalledOnce();
  });
});
