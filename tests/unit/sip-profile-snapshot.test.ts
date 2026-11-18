import { afterEach, expect, it, vi } from "vitest";
import { fetchSipRating } from "../../src/lib/sip-provider";
import { sipResponse } from "../fixtures/sip-response";

const id = 73101;
const sample = sipResponse(id, -8);
const read = () => fetchSipRating(id, "synthetic");
function respond(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body)),
  );
}
afterEach(() => vi.unstubAllGlobals());

it("projects the bounded rating dictionaries without copying player identity", async () => {
  respond(sample);
  expect(await read()).toEqual({
    kind: "rating",
    value: -8,
    snapshot: {
      rating: sample.rating,
      modifications: sample.modifications,
      skillsets: sample.skillsets,
    },
  });
  respond({ ...sample, rating: null, modifications: null, skillsets: null });
  expect(await read()).toEqual({
    kind: "rating",
    value: null,
    snapshot: {
      rating: null,
      modifications: null,
      skillsets: null,
    },
  });
});

it.each([
  { ...sample, playerId: id + 1 },
  { ...sample, rating: { value: 5 } },
  { ...sample, skillsets: { Aim: { ...sample.rating, combo: 1.1 } } },
  { ...sample, modifications: [] },
  {
    ...sample,
    skillsets: Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => [`skill${i}`, sample.rating]),
    ),
  },
])("rejects a mismatched or malformed response", async (body) => {
  respond(body);
  await expect(read()).rejects.toThrow();
});

it.each([
  [403, "unauthorized"],
  [404, "not-found"],
  [429, "rate-limited"],
] as const)(
  "distinguishes HTTP %i from a successful unrated player",
  async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status })),
    );
    expect(await read()).toEqual({ kind });
  },
);

it("sets a deadline and does not convert a timeout to a missing rating", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Synthetic timeout", "TimeoutError");
      }),
    );
    await expect(read()).rejects.toThrow();
    expect(timeout).toHaveBeenCalledWith(5000);
  } finally {
    timeout.mockRestore();
  }
});
