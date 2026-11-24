import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { chatSourceVectors as vectors } from "@/db/schema";
import { refreshChatIndex } from "@/lib/chat-index-worker";
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
