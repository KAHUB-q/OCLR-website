import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDb, db } from "../../src/db";
import { otrRatingCache, registrations, users } from "../../src/db/schema";
import { getDirectoryOtrRatings, getOtrRating } from "../../src/lib/otr-rating";
import { refreshOtrRatings } from "../../src/lib/otr-rating-worker";
import { assertTestDatabase } from "../database";
import { edition } from "../fixtures/edition";
import { seedEditions } from "../fixtures/editions";

vi.mock("server-only", () => ({}));

const url = process.env.TEST_DATABASE_URL;
const [saved, missing, failed, limited, remaining, pending, hidden, demo] = [
  301060, 301061, 301062, 301063, 301064, 301065, 301066, 301067,
];
const rating = {
  value: 1572.48,
  fetchedAt: "2026-11-14T00:00:00.000Z",
  profileUrl: "https://otr.stagec.net/players/321?ruleset=0",
};

describe.skipIf(!url)("daily o!TR rating cache", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url);
    await db().execute(
      sql`TRUNCATE edition_state, users, otr_rating_cache CASCADE`,
    );
    await seedEditions([
      edition,
      { ...edition, slug: "otr-hidden-test", published: false },
      { ...edition, slug: "dev-otr-test" },
    ]);
    await db()
      .insert(users)
      .values(
        [saved, missing, failed, limited, remaining, pending, hidden, demo].map(
          (osuId) => ({ osuId, username: `Synthetic ${osuId}` }),
        ),
      );
    await db()
      .insert(registrations)
      .values(
        [saved, missing, failed, limited, remaining, pending, hidden, demo].map(
          (userId) => ({
            editionSlug:
              userId === hidden
                ? "otr-hidden-test"
                : userId === demo
                  ? "dev-otr-test"
                  : edition.slug,
            userId,
            status:
              userId === pending ? ("pending" as const) : ("accepted" as const),
            rulesVersion: "test-v1",
            answers: {},
          }),
        ),
      );
    await db()
      .insert(otrRatingCache)
      .values(
        [missing, failed].map((osuId) => ({
          osuId,
          rating,
          retryAt: new Date(0),
        })),
      );
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("serves stale values and cache misses without fetching or writing", async () => {
    vi.stubEnv("OTR_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const before = await db().select().from(otrRatingCache);
    expect(await getOtrRating(failed)).toEqual(rating);
    expect(await getOtrRating(saved)).toBeNull();
    expect(await getDirectoryOtrRatings([failed, saved, failed])).toEqual({
      [failed]: rating.value,
    });
    expect(await refreshOtrRatings(true)).toMatchObject({ status: "disabled" });
    expect(await db().select().from(otrRatingCache)).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("paces public refreshes across workers, retains stale values and stops on 429", async () => {
    vi.stubEnv("OTR_API_KEY", "synthetic-key");
    const starts: number[] = [];
    const fetch = vi.fn(async (url: URL) => {
      starts.push(performance.now());
      const id = Number(url.pathname.split("/")[3]);
      if (id === saved) {
        await expect(refreshOtrRatings(true)).resolves.toMatchObject({
          status: "busy",
        });
        return Response.json({
          playerInfo: { id: 321, osuId: saved },
          ruleset: 0,
          rating: { ruleset: 0, rating: 1630 },
        });
      }
      const status = id === missing ? 404 : id === failed ? 503 : 429;
      return new Response(null, { status });
    });
    vi.stubGlobal("fetch", fetch);

    expect(await refreshOtrRatings()).toMatchObject({
      status: "preview",
      tracked: 5,
      pending: 5,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(await refreshOtrRatings(true)).toEqual({
      status: "rate-limited",
      tracked: 5,
      pending: 1,
      saved: 1,
      missing: 1,
      failed: 2,
    });
    expect(fetch.mock.calls.map(([url]) => url.pathname)).toEqual(
      [saved, missing, failed, limited].map((id) => `/api/players/${id}/stats`),
    );
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1000);

    await closeDb();
    expect(await getOtrRating(saved)).toMatchObject({ value: 1630 });
    expect(await getOtrRating(missing)).toBeNull();
    expect(await getOtrRating(failed)).toEqual(rating);
    expect(await getDirectoryOtrRatings([saved, missing, failed])).toEqual({
      [saved]: 1630,
      [failed]: rating.value,
    });
    expect(await refreshOtrRatings()).toMatchObject({
      status: "preview",
      tracked: 5,
      pending: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
