import { afterEach, expect, it, vi } from "vitest";
import { fetchEtxRating } from "../../src/lib/etx-provider";

afterEach(() => vi.unstubAllGlobals());

function reply(payload: unknown) {
  const request = vi.fn().mockResolvedValue(Response.json(payload));
  vi.stubGlobal("fetch", request);
  return request;
}

it("requests one osu! UID and projects the total and five observed mod ratings", async () => {
  const request = reply({
    osuUserId: "42",
    duelRating: {
      osuDuelStarRating: "5.12345",
      osuNoModDuelStarRating: "0.00",
      osuHiddenDuelStarRating: 5.1,
      osuHardRockDuelStarRating: "4.25",
      osuDoubleTimeDuelStarRating: 6,
      osuFreeModDuelStarRating: "2.75",
      osuDuelProvisional: false,
      osuDuelOutdated: true,
      osuHiddenDuelStarRatingLimited: true,
    },
  });
  await expect(fetchEtxRating(42)).resolves.toEqual({
    value: 5.12345,
    provisional: false,
    outdated: true,
    mods: { NM: 0, HD: 5.1, HR: 4.25, DT: 6, FM: 2.75 },
  });
  const [url, options] = request.mock.calls[0];
  expect(String(url)).toBe(
    "https://www.eliteronix.de/elitebotix/api/player-duelrating?u=42",
  );
  expect(options).toMatchObject({
    redirect: "error",
    cache: "no-store",
    signal: expect.any(AbortSignal),
  });
});

it.each([{ osuUserId: 42 }, {}])(
  "uses the requested UID when an optional echoed UID is absent or matching",
  async (identity) => {
    reply({
      ...identity,
      duelRating: {
        osuDuelStarRating: 0,
        osuNoModDuelStarRating: null,
        osuHiddenDuelStarRating: 0,
        osuDuelProvisional: null,
      },
    });
    await expect(fetchEtxRating(42)).resolves.toEqual({
      value: 0,
      mods: { HD: 0 },
      provisional: null,
      outdated: null,
    });
  },
);

it.each([
  { osuUserId: "43", duelRating: { osuDuelStarRating: "5" } },
  { osuUserId: null, duelRating: { osuDuelStarRating: "5" } },
  { duelRating: { osuDuelStarRating: null } },
  { duelRating: { osuDuelStarRating: "", osuHiddenDuelStarRating: "3" } },
  { duelRating: { osuDuelStarRating: -1 } },
  { duelRating: { osuDuelStarRating: "5", osuHardRockDuelStarRating: "NaN" } },
  { duelRating: { osuDuelStarRating: "5", osuDuelOutdated: "false" } },
])(
  "rejects a mismatched identity or malformed observation",
  async (payload) => {
    reply(payload);
    await expect(fetchEtxRating(42)).rejects.toThrow();
  },
);

it("distinguishes the documented missing rating and rate limit from transient failures", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("No duel rating found for the specified osu! user id", {
        status: 404,
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(new Response("Unknown route", { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(new Response("malformed JSON"))
    .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
  vi.stubGlobal("fetch", request);
  await expect(fetchEtxRating(42)).resolves.toBeNull();
  await expect(fetchEtxRating(42)).resolves.toBe("throttled");
  for (let failure = 0; failure < 4; failure++)
    await expect(fetchEtxRating(42)).rejects.toThrow();
  await expect(fetchEtxRating(0)).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(6);
});

it("rejects an oversized provider body before storing any fields", async () => {
  reply({ duelRating: { osuDuelStarRating: 5 }, padding: "x".repeat(65536) });
  await expect(fetchEtxRating(42)).rejects.toThrow(
    "Invalid rating response body",
  );
});
