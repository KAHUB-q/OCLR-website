import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { chatSourceVectors as vectors } from "@/db/schema";
import { refreshChatIndex } from "@/lib/chat-index-worker";
import { chatEvidence } from "@/lib/chat-sources";
import { searchSeasonIndex } from "@/lib/chat-vectors";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { assertTestDatabase } from "../database";

const url = process.env.TEST_DATABASE_URL;
const archived = {
  ...edition,
  slug: historicalArchive.editionSlug,
  status: "completed" as const,
  registration: null,
  archive: structuredClone(historicalArchive),
};
const calls: string[][] = [];
let embeddingUnavailable = false;
beforeAll(async () => {
  if (!url) return;
  assertTestDatabase(url);
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("OCLR_CHAT_BASE_URL", "https://synthetic.invalid/v1");
  vi.stubEnv("OCLR_CHAT_MODEL", "chat-test");
  vi.stubEnv("OCLR_CHAT_PROXY_URL", "");
  vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "embedding-test");
  vi.stubGlobal("fetch", async (address: string, opts: RequestInit) => {
    expect(String(address)).toBe("https://synthetic.invalid/v1/embeddings");
    const { input } = JSON.parse(String(opts.body)) as { input: string[] };
    calls.push(input);
    if (embeddingUnavailable) return new Response(null, { status: 503 });
    return Response.json({
      object: "list",
      data: input.map((text, index) => ({
        object: "embedding",
        index,
        embedding:
          text.includes("Historical Title") || text === "星際旋律是哪首？"
            ? [1, 0]
            : [0, 1],
      })),
      model: "embedding-test",
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  });
  await db().execute(sql`TRUNCATE edition_state CASCADE`);
});
afterAll(async () => {
  await closeDb();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.skipIf(!url)(
  "indexes complete published seasons incrementally, finds semantic hits and suppresses withdrawn sources before refresh",
  async () => {
    const other = { ...edition, slug: "other-test-cup" };
    await seedEditions([
      archived,
      other,
      {
        ...other,
        slug: "unpublished-index-test",
        published: false,
        summary: "PRIVATE-UNRELEASED",
      },
    ]);
    const first = await refreshChatIndex();
    expect(first).toMatchObject({ status: "complete", failed: 0 });
    expect(first.updated).toBeGreaterThan(0);
    expect(calls.flat().join(" ")).not.toContain("PRIVATE-UNRELEASED");
    const stored = await db()
      .select({ collection: vectors.collection })
      .from(vectors)
      .where(eq(vectors.editionSlug, archived.slug));
    expect(stored.map((s) => s.collection)).toEqual(
      expect.arrayContaining([
        "overview",
        "players",
        "teams",
        "draft",
        "matches",
        "mappools",
        "staff",
      ]),
    );
    calls.length = 0;
    expect(await refreshChatIndex()).toMatchObject({
      updated: 0,
      removed: 0,
      failed: 0,
    });
    expect(calls).toHaveLength(0);
    const semantic = await searchSeasonIndex(archived, "星際旋律是哪首？", "");
    expect(
      semantic.some(
        (s) =>
          s.url.includes("/mappools/") && s.text.includes("Historical Title"),
      ),
    ).toBe(true);
    expect(
      (await searchSeasonIndex(other, "星際旋律是哪首？", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(false);
    embeddingUnavailable = true;
    expect(
      (await searchSeasonIndex(archived, "Historical Title", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(true);
    embeddingUnavailable = false;
    const changed = structuredClone(archived);
    changed.archive.pools[0].maps[0].title = "Replacement track";
    await seedEditions([changed]);
    expect(
      (await searchSeasonIndex(changed, "Historical Title", "")).some((s) =>
        s.text.includes("Historical Title"),
      ),
    ).toBe(false);
    calls.length = 0;
    expect(await refreshChatIndex()).toMatchObject({
      updated: 1,
      removed: 1,
      failed: 0,
    });
    expect(calls.flat()).toHaveLength(1);
    vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "other-model");
    expect((await refreshChatIndex()).updated).toBeGreaterThan(1);
    await seedEditions([{ ...changed, published: false }]);
    expect((await refreshChatIndex()).removed).toBeGreaterThan(0);
    expect(
      await db()
        .select({ id: vectors.digest })
        .from(vectors)
        .where(eq(vectors.editionSlug, archived.slug)),
    ).toEqual([]);
  },
);

it.skipIf(!url)(
  "indexes public artwork once per image and returns the matching difficulty for a visual query",
  async () => {
    const season = structuredClone(archived);
    const maps = season.archive.pools[0].maps;
    maps[0].beatmapSetId = 8899001;
    maps[1].beatmapSetId = 8899002;
    await seedEditions([season]);
    await db().execute(sql`TRUNCATE chat_artwork_captions, osu_cached_images`);
    vi.stubEnv("OCLR_CHAT_VISION_MODEL", "vision-test");
    vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "artwork-embedding-test");
    const requests: string[] = [];
    const first = "Anime girl under cherry blossoms. 美少女、櫻花、樱花";
    const second = "Snowy mountain peaks. 雪山、山峰";
    const sharp = (await import("sharp")).default;
    const pix = await Promise.all(
      ["red", "blue"].map((background) =>
        sharp({ create: { width: 8, height: 8, channels: 3, background } })
          .jpeg()
          .toBuffer(),
      ),
    );
    let visions = 0;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const address = new URL(input);
      requests.push(address.pathname);
      if (address.hostname === "assets.ppy.sh") {
        const image = address.pathname.includes("8899001") ? pix[0] : pix[1];
        return new Response(new Uint8Array(image), {
          headers: { "content-type": "image/jpeg" },
        });
      }
      expect(address.origin).toBe("https://synthetic.invalid");
      const body = JSON.parse(String(init.body));
      if (address.pathname.endsWith("/chat/completions")) {
        expect(body.model).toBe("vision-test");
        const image = body.messages[0].content.find(
          (part: { type: string }) => part.type === "image_url",
        );
        expect(image.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
        const { data } = await sharp(
          Buffer.from(image.image_url.url.split(",")[1], "base64"),
        )
          .raw()
          .toBuffer({ resolveWithObject: true });
        visions++;
        return Response.json({
          id: "caption",
          object: "chat.completion",
          created: 1,
          model: "vision-test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: data[0] > data[2] ? first : second,
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 },
        });
      }
      expect(address.pathname).toBe("/v1/embeddings");
      return Response.json({
        object: "list",
        data: body.input.map((value: string, index: number) => ({
          object: "embedding",
          index,
          embedding: value.includes("美少女") ? [1, 0] : [0, 1],
        })),
        model: body.model,
        usage: { prompt_tokens: 1, total_tokens: 1 },
      });
    });
    const indexed = await refreshChatIndex();
    expect(indexed.failed).toBe(0);
    expect(visions).toBe(2);
    const visual = "譜面BG圖是美少女的譜面/map";
    const results = (await chatEvidence(season.slug, visual, "選手有多少"))
      .sources;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      url: "https://osu.ppy.sh/beatmaps/123456",
      text: first,
    });
    expect(results[0].title).toContain(maps[0].slot);
    expect((await refreshChatIndex()).updated).toBe(0);
    expect(visions).toBe(2);
    season.archive.pools[0].maps = [maps[1]];
    await seedEditions([season]);
    expect((await chatEvidence(season.slug, visual, "")).sources).toEqual([]);
    vi.stubEnv("OCLR_CHAT_VISION_MODEL", "");
    expect((await refreshChatIndex()).removed).toBeGreaterThan(0);
    expect(
      requests.filter((path) => path === "/v1/chat/completions"),
    ).toHaveLength(2);
  },
);
