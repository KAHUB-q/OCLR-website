import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDb } from "@/db";
import {
  osuCachedImages,
  osuImageEvents,
  osuImagePolicies,
  users,
} from "@/db/schema";
import { manageOsuImages, readOsuImage } from "@/lib/osu-image-cache";
import {
  cachedImageUrl,
  officialImageUrl,
  type ImageVariant,
} from "@/lib/osu-image-urls";
import { GET } from "@/app/api/osu-images/[variant]/[id]/route";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const admin = { osuId: 1426001, username: "Cache test admin" };
const image = (value: number) =>
  new Response(new Uint8Array([255, 216, 255, value]));
const download = vi.fn<typeof fetch>();
const get = (variant: ImageVariant, id: number, tag?: string) =>
  GET(
    new Request("https://example.test", {
      headers: tag ? { "If-None-Match": tag } : {},
    }),
    { params: Promise.resolve({ variant, id: String(id) }) },
  );

it("only converts official image paths and redirects remote reads without a DB", async () => {
  expect(cachedImageUrl(officialImageUrl("avatar", 999) + "?v=123")).toBe(
    "/api/osu-images/avatar/999",
  );
  expect(cachedImageUrl(officialImageUrl("list", 123))).toBe(
    "/api/osu-images/list/123",
  );
  expect(cachedImageUrl("/custom/avatar.jpg")).toBe("/custom/avatar.jpg");
  vi.stubEnv("OCLR_DATA_SOURCE", "remote");
  try {
    expect((await get("list", 123)).headers.get("location")).toBe(
      officialImageUrl("list", 123),
    );
    expect((await get("avatar", -1)).status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
  }
});

describe.skipIf(!url)("osu! image cache", () => {
  beforeAll(async () => {
    assertTestDatabase(url);
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("ADMIN_OSU_IDS", String(admin.osuId));
    await db().insert(users).values(admin).onConflictDoNothing();
  });
  async function resetCache() {
    await db().execute(sql`truncate osu_cached_images, osu_image_events`);
    await db().update(osuImagePolicies).set({ invalidatedAt: null });
    await db()
      .update(osuImagePolicies)
      .set({ revision: 0, ttlHours: 24, capacityMiB: 64 })
      .where(eq(osuImagePolicies.kind, "avatar"));
  }
  beforeEach(async () => {
    await resetCache();
    download.mockReset().mockImplementation(async () => image(1));
    vi.stubGlobal("fetch", download);
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await resetCache();
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("refreshes every avatar on demand and revalidates browser ETags", async () => {
    const first = await get("avatar", 11);
    const etag = first.headers.get("etag")!;
    expect(first.status).toBe(200);
    expect(await first.bytes()).toEqual(new Uint8Array([255, 216, 255, 1]));
    await get("avatar", 22);
    await get("cover", 11);
    expect((await get("avatar", 11, etag)).status).toBe(304);
    expect(download).toHaveBeenCalledTimes(3);
    download.mockImplementation(async () => image(2));
    await manageOsuImages(admin, {
      action: "refreshAll",
      kind: "avatar",
    });
    expect(download).toHaveBeenCalledTimes(3);
    const refreshed = await get("avatar", 11, etag);
    expect(refreshed.status).toBe(200);
    expect(await refreshed.bytes()).toEqual(new Uint8Array([255, 216, 255, 2]));
    expect((await get("avatar", 22, etag)).status).toBe(200);
    expect((await get("cover", 11, etag)).status).toBe(304);
    expect(download).toHaveBeenCalledTimes(5);
  });

  it("deduplicates misses, reloads expired images, and retains old bytes when refreshing fails", async () => {
    await Promise.all([readOsuImage("cover", 55), readOsuImage("cover", 55)]);
    expect(download).toHaveBeenCalledTimes(1);
    await db().execute(
      sql`update osu_cached_images set fetched_at = now() - interval '1 year'`,
    );
    download.mockImplementation(async () => image(3));
    const result = await readOsuImage("cover", 55);
    expect(result?.data.at(-1)).toBe(3);
    download.mockImplementation(async () => new Response("<html/>"));
    await manageOsuImages(admin, { action: "refreshAll", kind: "background" });
    expect((await readOsuImage("cover", 55))?.etag).toBe(result?.etag);
  });

  it("invalidates covers and thumbnails across sets and audits the category", async () => {
    await readOsuImage("cover", 81);
    await readOsuImage("list", 81);
    await readOsuImage("list", 82);
    download.mockImplementation(async () => image(4));
    await manageOsuImages(admin, {
      action: "refreshAll",
      kind: "background",
    });
    expect((await readOsuImage("cover", 81))?.data.at(-1)).toBe(4);
    expect((await readOsuImage("list", 82))?.data.at(-1)).toBe(4);
    expect((await readOsuImage("list", 81))?.data.at(-1)).toBe(4);
    expect(download).toHaveBeenCalledTimes(6);
    expect(await db().select().from(osuImageEvents)).toMatchObject([
      { actorId: admin.osuId, kind: "background", operation: "refreshAll" },
    ]);
  });

  it("revalidates a download that was in flight during a sitewide refresh", async () => {
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    download.mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    });
    const first = readOsuImage("avatar", 77);
    await started.promise;
    try {
      await manageOsuImages(admin, { action: "refreshAll", kind: "avatar" });
    } finally {
      response.resolve(image(9));
    }
    expect((await first)?.data.at(-1)).toBe(9);
    expect((await readOsuImage("avatar", 77))?.data.at(-1)).toBe(1);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("applies the selected capacity immediately and enforces permission and revision", async () => {
    await readOsuImage("avatar", 1);
    await readOsuImage("avatar", 2);
    await readOsuImage("cover", 1);
    await db().execute(
      sql`update osu_cached_images set byte_size = 5 * 1024 * 1024, fetched_at = now() - (3 - image_id) * interval '1 hour'`,
    );
    const command = {
      action: "save",
      kind: "avatar",
      expectedRevision: 0,
      ttlHours: 1,
      capacityMiB: 8,
    } as const;
    await expect(
      manageOsuImages({ ...admin, osuId: 1426002 }, command),
    ).rejects.toMatchObject({ status: 403 });
    expect(await manageOsuImages(admin, command)).toMatchObject({
      revision: 1,
      capacityMiB: 8,
      ttlHours: 1,
    });
    await expect(manageOsuImages(admin, command)).rejects.toMatchObject({
      status: 409,
    });
    const remaining = await db()
      .select({ variant: osuCachedImages.variant, id: osuCachedImages.imageId })
      .from(osuCachedImages);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { variant: "cover", id: 1 },
        { variant: "avatar", id: 2 },
      ]),
    );
    expect(remaining).toHaveLength(2);
    await readOsuImage("avatar", 2);
    await readOsuImage("cover", 1);
    expect(download).toHaveBeenCalledTimes(4);
  });
});
