import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Edition } from "../../src/lib/editions";
import { edition } from "../fixtures/edition";
import { HttpError } from "../../src/lib/http";

const fake = vi.hoisted(() => ({
  grants: [] as { editionSlug: string | null }[],
  editions: [] as Edition[],
  sessionError: null as Error | null,
}));
vi.mock("@/db", () => ({
  db: () => ({
    select: () => ({ from: () => ({ where: async () => fake.grants }) }),
  }),
}));
vi.mock("@/lib/content", () => ({ getEditions: async () => fake.editions }));
vi.mock("@/lib/auth/user", () => ({
  requireBrowserSession: async () => {
    if (fake.sessionError) throw fake.sessionError;
    return { osuId: 123 };
  },
}));
vi.mock("@/i18n/server", () => ({
  getAppTranslations: async () => (message: string) => message,
}));
vi.mock("@/components/ui", () => ({
  PageHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import Page from "../../src/app/streaming/page";
import { streamingAccessEditions } from "../../src/lib/streaming-api";

beforeEach(() => {
  fake.grants = [{ editionSlug: null }];
  fake.editions = [];
  fake.sessionError = null;
});

describe("streaming API account entry", () => {
  it("opens the live edition ahead of upcoming editions and never lists historical seasons", async () => {
    fake.editions = [
      { ...edition, slug: "history", status: "completed" },
      { ...edition, slug: "upcoming" },
      { ...edition, slug: "current", status: "live" },
    ];
    expect((await streamingAccessEditions(123)).map((e) => e.slug)).toEqual([
      "upcoming",
      "current",
    ]);
    await expect(Page()).rejects.toThrow("REDIRECT:/streaming/current");
  });

  it("opens the upcoming edition when no published live edition is available", async () => {
    fake.editions = [
      { ...edition, slug: "unpublished", status: "live", published: false },
      { ...edition, slug: "history", status: "completed" },
      { ...edition, slug: "upcoming" },
    ];
    expect((await streamingAccessEditions(123)).map((e) => e.slug)).toEqual([
      "upcoming",
    ]);
    await expect(Page()).rejects.toThrow("REDIRECT:/streaming/upcoming");
  });

  it("respects edition-scoped Streamer grants", async () => {
    fake.grants = [{ editionSlug: "assigned" }];
    fake.editions = [
      { ...edition, slug: "other", status: "live" },
      { ...edition, slug: "assigned" },
    ];
    await expect(Page()).rejects.toThrow("REDIRECT:/streaming/assigned");
  });

  it.each(["empty", "completed", "unpublished", "unassigned"] as const)(
    "shows an empty state without historical links when editions are %s",
    async (state) => {
      fake.grants = [{ editionSlug: "history" }];
      fake.editions =
        state === "empty"
          ? []
          : [
              {
                ...edition,
                slug: "history",
                name: "Historical season",
                status: state === "completed" ? "completed" : "live",
                published: state !== "unpublished",
              },
            ];
      if (state === "unassigned") fake.grants = [{ editionSlug: "other" }];
      const html = renderToStaticMarkup(await Page());
      expect(html).toContain("No tournaments available.");
      expect(html).not.toContain("Historical season");
      expect(html).not.toContain('href="/streaming/');
    },
  );

  it("requires an active Streamer grant", async () => {
    fake.grants = [];
    fake.editions = [edition];
    await expect(streamingAccessEditions(123)).rejects.toMatchObject({
      status: 403,
    });
    await expect(Page()).rejects.toThrow("NOT_FOUND");
  });

  it("keeps the browser sign-in requirement", async () => {
    fake.sessionError = new HttpError(401, "Sign in with osu! to continue.");
    await expect(Page()).rejects.toThrow("REDIRECT:/login");
  });
});
