import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sql, eq } from "drizzle-orm";
import { db, closeDb } from "@/db";
import { users, sessions, registrations, staffRoles } from "@/db/schema";
import { createSession, revokeSession } from "@/lib/auth/sessions";
import { hashToken } from "@/lib/auth/tokens";
import { english } from "@/i18n/translate";
import { chatEvidence } from "@/lib/chat-sources";
import { POST } from "@/app/api/chat/route";
import { seedEditions } from "../fixtures/editions";
import { edition } from "../fixtures/edition";
import { historicalArchive } from "../fixtures/historical-archive";
import { assertTestDatabase } from "../database";

const context = vi.hoisted(() => ({ token: "" }));
vi.mock("@/i18n/server", () => ({
  getAppTranslations: async () => english,
}));
vi.mock("next/headers.js", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => ({ value: context.token }) }),
}));
const testUrl = process.env.TEST_DATABASE_URL;
const origin = "https://oclr.example";
const slug = "chat-cup-a";
function ask(questions = ["substitution?"], extra = {}, signal?: AbortSignal) {
  return POST(
    new Request(origin + "/api/chat", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        edition: slug,
        locale: "en",
        questions,
        ...extra,
      }),
      signal,
    }),
  );
}
const season = (slug: string, body: string) => ({
  ...edition,
  slug,
  eligibility: null,
  rules: { version: "v1", sections: [{ heading: "替补", body }] },
});
describe.skipIf(!testUrl)("authenticated tournament assistant", () => {
  beforeAll(async () => {
    assertTestDatabase(testUrl);
    vi.stubEnv("DATABASE_URL", testUrl);
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("OCLR_CHAT_MODEL", "test-chat");
    vi.stubEnv("OCLR_CHAT_PROXY_URL", "");
    vi.stubEnv("OCLR_CHAT_API_KEY", "synthetic-key");
    vi.stubEnv("OCLR_CHAT_BASE_URL", "https://provider.example/v1");
    await db().execute(sql`TRUNCATE users, edition_state CASCADE`);
    await db().insert(users).values({ osuId: 1425001, username: "Synthetic" });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });
  it("rejects unauthenticated, expired and revoked sessions before retrieval or model access", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    // The edition does not exist, so retrieval before authentication would return 404.
    context.token = "";
    expect((await ask()).status).toBe(401);
    context.token = (await createSession(1425001)).token;
    await db()
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.tokenHash, hashToken(context.token)));
    expect((await ask()).status).toBe(401);
    context.token = (await createSession(1425001)).token;
    await revokeSession(context.token);
    expect((await ask()).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("uses only currently published sections of the requested edition in all interface languages", async () => {
    await seedEditions([
      season(slug, "Alpha ruling"),
      season("chat-cup-b", "Beta ruling"),
    ]);
    for (const query of ["換人", "替补", "substitution"]) {
      for (const [id, expected] of [
        [slug, "Alpha ruling"],
        ["chat-cup-b", "Beta ruling"],
      ]) {
        const { sources } = await chatEvidence(id, query, "");
        expect(sources).toHaveLength(1);
        expect(sources[0].text).toContain(expected);
        expect(sources[0].url).toBe("/tournaments/" + id + "#rules-1");
      }
    }
    await seedEditions([season(slug, "Updated ruling")]);
    expect((await chatEvidence(slug, "換人", "")).sources[0].text).toContain(
      "Updated ruling",
    );
    await seedEditions([{ ...season(slug, "withdrawn"), rules: null }]);
    expect((await chatEvidence(slug, "換人", "")).sources).toEqual([]);
    await seedEditions([{ ...season(slug, "unpublished"), published: false }]);
    await expect(chatEvidence(slug, "換人", "")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("retrieves the published overview dates for natural time questions and refreshes changed dates", async () => {
    const e = season(slug, "Substitutes need approval.");
    const schedule = [{ label: "Opening round", at: "2030-05-09T02:00:00Z" }];
    await seedEditions([{ ...e, schedule }]);
    for (const question of [
      "什麼時候開始",
      "什么时候开始",
      "When does this season start?",
    ]) {
      const { sources } = await chatEvidence(slug, question, "");
      const dates = sources.filter(
        (s) => s.url === "/tournaments/" + slug + "#schedule",
      );
      expect(dates.map((s) => s.title)).toEqual(
        expect.arrayContaining(["Registration opens", "Opening round"]),
      );
      expect(dates.find((s) => s.title === "Opening round")!.text).toMatch(
        /2030.*Asia\/Taipei/,
      );
    }
    await seedEditions([{ ...e, registration: null, schedule: [] }]);
    expect(
      (await chatEvidence(slug, "什麼時候開始", "")).sources.some((s) =>
        s.url.endsWith("#schedule"),
      ),
    ).toBe(false);
  });
  it("answers registration totals from currently published data even without an index or provider", async () => {
    const cup = "count-test-cup";
    const other = "count-test-other";
    await seedEditions([
      season(cup, "Registration eligibility"),
      season(other, "Other rule"),
    ]);
    expect(
      (await chatEvidence(cup, "你可以回答什麼", "")).sources[0].text,
    ).toContain("Liru can answer");
    const accepted = 1425010;
    const pending = 1425011;
    await db()
      .insert(users)
      .values([
        { osuId: accepted, username: "Count Accepted" },
        { osuId: pending, username: "Count Pending" },
      ]);
    await db()
      .insert(registrations)
      .values([
        { userId: accepted, editionSlug: cup, answers: {}, status: "accepted" },
        { userId: pending, editionSlug: cup, answers: {}, status: "pending" },
        {
          userId: pending,
          editionSlug: other,
          answers: {},
          status: "accepted",
        },
      ]);
    context.token = (await createSession(accepted)).token;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    for (const question of [
      "有多少人報名了",
      "選手有多少",
      "报名人数是多少？",
      "How many people have registered?",
    ]) {
      const response = await ask(["你可以回答什麼", question], {
        edition: cup,
      });
      const text = await response.text();
      expect(text).toContain("public player directory: 1");
      expect(text).toContain(`/tournaments/${cup}/players`);
      expect(text).not.toContain("eligibility");
    }
    await db()
      .update(registrations)
      .set({ status: "withdrawn" })
      .where(eq(registrations.userId, accepted));
    expect(
      await (await ask(["有多少人報名了"], { edition: cup })).text(),
    ).toContain("public player directory: 0");
    const archive = structuredClone(historicalArchive);
    await seedEditions([
      {
        ...edition,
        slug: archive.editionSlug,
        archive,
        status: "completed",
        registration: null,
      },
    ]);
    expect(
      await (
        await ask(["有多少人報名了"], { edition: archive.editionSlug })
      ).text(),
    ).toContain(`historical roster lists ${archive.players.length}`);
    await seedEditions([{ ...season(cup, "Registration"), published: false }]);
    expect((await ask(["有多少人報名了"], { edition: cup })).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("answers public season counts with matching citations without embedding or generation", async () => {
    const archive = structuredClone(historicalArchive);
    const current = "empty-local-counts";
    await seedEditions([
      {
        ...edition,
        slug: archive.editionSlug,
        archive,
        status: "completed",
        registration: null,
      },
      season(current, "Empty edition"),
    ]);
    await db()
      .insert(users)
      .values({ osuId: 1425071, username: "Local counts" });
    context.token = (await createSession(1425071)).token;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "synthetic-test");
    try {
      for (const [question, answer, path] of [
        ["本屆有幾支隊伍？", "2 published teams", "teams"],
        ["比赛有几场？", "1 match.", "schedule"],
        [
          "How many matches have published results?",
          "1 match has a published result",
          "results",
        ],
        ["接下來有幾場比賽？", "0 upcoming matches", "schedule"],
        [
          "How many mappools are there this season?",
          "1 published mappool",
          "mappools",
        ],
        ["图池里有几张图？", "2 map slots", "mappools"],
      ]) {
        const reply = await (
          await ask([question], { edition: archive.editionSlug })
        ).text();
        expect(reply).toContain(answer);
        expect(reply).toContain(
          "/tournaments/" + archive.editionSlug + "/" + path,
        );
      }
      expect(
        await (await ask(["本屆有幾支隊伍？"], { edition: current })).text(),
      ).toContain("0 published teams");
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv("OCLR_CHAT_EMBEDDING_MODEL", "");
    }
  });
  it("streams cited public evidence through the configured compatible provider and discards client instructions", async () => {
    context.token = (await createSession(1425001)).token;
    await seedEditions([season(slug, "Only after referee approval.")]);
    await db()
      .insert(registrations)
      .values({
        userId: 1425001,
        editionSlug: slug,
        answers: { private: "Synthetic private answer" },
        statusReason: "Synthetic staff note",
      });
    const upstream = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://provider.example/v1/chat/completions");
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer synthetic-key",
      );
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        model: "test-chat",
        stream: true,
        max_tokens: 650,
      });
      expect(body).not.toHaveProperty("max_completion_tokens");
      expect(JSON.stringify(body.messages)).toContain(
        "Only after referee approval.",
      );
      expect(JSON.stringify(body.messages)).not.toContain("Beta ruling");
      expect(JSON.stringify(body.messages)).not.toMatch(
        /Synthetic private answer|Synthetic staff note/,
      );
      const chunks = [
        {
          choices: [
            {
              index: 0,
              delta: { content: "Check with the referee." },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ];
      return new Response(
        chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") +
          "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    vi.stubGlobal("fetch", upstream);
    expect((await ask(["substitution?"], { tools: {} })).status).toBe(400);
    const log = vi.spyOn(console, "info");
    const response = await ask();
    const text = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const traceId = response.headers.get("X-OCLR-Chat-Request-Id");
    expect(traceId).toBeTruthy();
    const events = log.mock.calls
      .filter(
        ([tag, value]) =>
          tag === "[liru-chat]" && JSON.parse(value).requestId === traceId,
      )
      .map(([, value]) => JSON.parse(value));
    expect(events.map((e) => e.event)).toEqual([
      "upstream_start",
      "upstream_http",
      "answer_received",
    ]);
    expect(events[1].status).toBe(200);
    expect(JSON.stringify(events)).not.toMatch(
      /referee|substitution|synthetic-key/i,
    );
    log.mockRestore();
    expect(text.indexOf('"type":"source-url"')).toBeGreaterThan(
      text.indexOf("Check with the referee."),
    );
    expect(text).toContain("Check with the referee.");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(await (await ask(["zzz"])).text()).toContain("couldn’t find");
    expect(upstream).toHaveBeenCalledTimes(1);
    await db().insert(staffRoles).values({
      userId: 1425001,
      grantedBy: 1425001,
      role: "referee",
      editionSlug: slug,
    });
    const staffReply = await (await ask()).text();
    expect(staffReply).toContain("Check with the referee.");
    expect(staffReply).not.toMatch(
      /Synthetic private answer|Synthetic staff note/,
    );
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("refreshes scheduled time, scores and pool entries from the published edition", async () => {
    const archive = structuredClone(historicalArchive);
    const published = {
      ...edition,
      slug: archive.editionSlug,
      status: "completed",
      registration: null,
      archive,
    };
    await seedEditions([published]);
    const query = async (question: string) =>
      JSON.stringify(
        (await chatEvidence(published.slug, question, "")).sources,
      );
    expect(await query("match score")).toContain("6–2");
    expect(await query("mappool NM1")).toContain("Historical Title");
    archive.matches[0].scheduledAt = "2030-01-02T12:00:00Z";
    archive.matches[0].score = [2, 5];
    archive.pools[0].maps[0].title = "New published title";
    await seedEditions([published]);
    const match = await query("match score");
    expect(match).toContain("2–5");
    expect(match).toContain("2030-01-02");
    expect(match).not.toContain("6–2");
    expect(await query("mappool NM1")).toContain("New published title");
  });
  it("limits repeated requests by account before spending provider calls", async () => {
    await db()
      .insert(users)
      .values({ osuId: 1425002, username: "Synthetic quota account" });
    context.token = (await createSession(1425002)).token;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    for (let i = 0; i < 8; i++)
      expect(
        (await ask(["question"], { edition: "unpublished-test" })).status,
      ).toBe(404);
    expect((await ask()).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("sends the official OpenAI limit and logs only recognized invalid request fields", async () => {
    await db()
      .insert(users)
      .values({ osuId: 1425020, username: "Parameter test" });
    context.token = (await createSession(1425020)).token;
    await seedEditions([season(slug, "Use a substitute.")]);
    vi.stubEnv("OCLR_CHAT_BASE_URL", "https://api.openai.com/v1");
    const log = vi.spyOn(console, "info");
    const upstream = vi.fn(async (url, init) => {
      expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
      const body = JSON.parse(init.body);
      expect(body.max_completion_tokens).toBe(650);
      expect(body).not.toHaveProperty("max_tokens");
      return Response.json(
        {
          error: {
            code: "unsupported_value",
            param: "model",
            message: "private upstream text",
          },
        },
        { status: 400 },
      );
    });
    vi.stubGlobal("fetch", upstream);
    try {
      const text = await (await ask()).text();
      expect(upstream).toHaveBeenCalledOnce();
      expect(text).toContain("provider-unavailable");
      const lines = log.mock.calls.map(([, line]) => line).join("\n");
      expect(lines).toContain(
        '"event":"invalid_request","status":400,"code":"unsupported_value","param":"model"',
      );
      expect(lines + text).not.toMatch(/private upstream text|synthetic-key/);
    } finally {
      log.mockRestore();
      vi.stubEnv("OCLR_CHAT_BASE_URL", "https://provider.example/v1");
    }
  });
  it("reports a reasoning-only completion as an empty answer without attaching citations", async () => {
    await db()
      .insert(users)
      .values({ osuId: 1425012, username: "Empty answer" });
    context.token = (await createSession(1425012)).token;
    await seedEditions([season(slug, "Use a substitute.")]);
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          'data: {"choices":[{"index":0,"delta":{"reasoning_content":"internal"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const text = await (await ask()).text();
    expect(text).toContain("provider-unavailable");
    expect(text).not.toMatch(/source-url|internal/);
  });
  it("suppresses provider error bodies and propagates cancellation", async () => {
    context.token = (await createSession(1425001)).token;
    await seedEditions([season(slug, "Use a substitute.")]);
    const upstream = vi.fn(
      async () => new Response("private upstream diagnostics", { status: 429 }),
    );
    vi.stubGlobal("fetch", upstream);
    const log = vi.spyOn(console, "info");
    const failed = await (await ask()).text();
    const logged = log.mock.calls.map(([, line]) => line).join("\n");
    log.mockRestore();
    expect(logged).toContain('"event":"upstream_http","status":429');
    expect(logged).toContain('"event":"upstream_error"');
    expect(logged).not.toMatch(
      /private upstream diagnostics|synthetic-key|substitution/,
    );
    expect(failed).toContain("provider-unavailable");
    expect(failed).not.toContain("private upstream diagnostics");
    expect(failed).not.toContain('"type":"source-url"');
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      async (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => {
              cancelled = true;
              reject(init.signal!.reason);
            },
            { once: true },
          );
          started();
        }),
    );
    const response = await ask(undefined, {}, controller.signal);
    const done = response.text();
    await ready;
    controller.abort();
    await done;
    expect(cancelled).toBe(true);
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(deadline.signal);
    try {
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const timedOut = (await ask()).text();
      await waiting;
      deadline.abort(new DOMException("deadline", "TimeoutError"));
      expect(await timedOut).toContain("provider-timeout");
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally {
      timeout.mockRestore();
    }
    vi.stubEnv("OCLR_CHAT_MODEL", "");
    try {
      expect((await ask()).status).toBe(503);
    } finally {
      vi.stubEnv("OCLR_CHAT_MODEL", "test-chat");
    }
  });
});
