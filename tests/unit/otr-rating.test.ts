import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOtrRating,
  OtrRequestError,
} from "../../src/lib/otr-rating-provider";

const stats = {
  playerInfo: { id: 321, osuId: 1060 },
  ruleset: 0,
  rating: { ruleset: 0, rating: 1572.48 },
};

afterEach(() => vi.unstubAllGlobals());

describe("o!TR player rating provider", () => {
  it("requests osu!standard by osu! UID and keeps only the public rating", async () => {
    const fetch = vi.fn(async () => Response.json(stats));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchOtrRating(1060, "synthetic-key")).toEqual({
      value: 1572.48,
      fetchedAt: expect.any(String),
      profileUrl: "https://otr.stagec.net/players/321?ruleset=0",
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        "https://otr.stagec.net/api/players/1060/stats?keyType=osu&ruleset=0",
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer synthetic-key" },
        cache: "no-store",
        redirect: "error",
      }),
    );
  });

  it("rejects mismatched identities and modes and reports provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(stats))
        .mockResolvedValueOnce(Response.json({ ...stats, ruleset: 1 }))
        .mockResolvedValueOnce(new Response(null, { status: 429 })),
    );
    await expect(fetchOtrRating(1061, "test")).rejects.toThrow(
      "different player",
    );
    await expect(fetchOtrRating(1060, "test")).rejects.toThrow();
    await expect(fetchOtrRating(1060, "test")).rejects.toEqual(
      new OtrRequestError(429),
    );
  });

  it("distinguishes a confirmed missing rating from a provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...stats, rating: null }))
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );
    await expect(fetchOtrRating(1060, "test")).resolves.toBeNull();
    await expect(fetchOtrRating(1060, "test")).resolves.toBeNull();
    await expect(fetchOtrRating(1060, "test")).rejects.toHaveProperty(
      "status",
      503,
    );
  });
});
