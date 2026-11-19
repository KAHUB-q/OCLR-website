import { z } from "zod";

import { sipSnapshotSchema } from "./sip-rating-model";
import { readRatingBody } from "./rating-provider-body";

const ratingResponse = sipSnapshotSchema.extend({
  playerId: z.int().positive(),
  activeUsername: z.string().min(1).max(128),
  countryCode: z.string().min(1).max(8),
});

export async function fetchSipRating(osuId: number, token: string) {
  if (!Number.isSafeInteger(osuId) || osuId < 1)
    throw new Error("Invalid osu! ID.");

  const response = await fetch(`https://skillissue.app/ratings/${osuId}`, {
    headers: { source: token, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    // Release the connection without reading or logging error payloads.
    void response.body?.cancel().catch(() => {});
    if (response.status === 404) return { kind: "not-found" } as const;
    if (response.status === 401 || response.status === 403)
      return { kind: "unauthorized" } as const;
    if (response.status === 429) return { kind: "rate-limited" } as const;
    throw new Error("Skill Issue rating request failed.");
  }

  const parsed = ratingResponse.safeParse(
    await readRatingBody<unknown>(response, JSON.parse),
  );
  if (!parsed.success || parsed.data.playerId !== osuId)
    throw new Error("Skill Issue returned an invalid rating.");

  const { rating, modifications, skillsets } = parsed.data;
  return {
    kind: "rating",
    value: rating?.value ?? null,
    snapshot: { rating, modifications, skillsets },
  } as const;
}
