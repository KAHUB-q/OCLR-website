import { z } from "zod";

import { sipSnapshotSchema } from "./sip-rating-model";

const ratingResponse = sipSnapshotSchema.extend({
  playerId: z.int().positive(),
  activeUsername: z.string().min(1).max(128),
  countryCode: z.string().min(1).max(8),
});

// Bound bytes as well as the saved dictionary shapes, including when the
// response is chunked or its Content-Length describes compressed bytes.
async function readRatingBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Skill Issue response.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 64 * 1024) throw new Error("Oversized Skill Issue response.");
      text += decoder.decode(part.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    void reader.cancel().catch(() => {});
    throw new Error("Invalid Skill Issue response body.");
  } finally {
    reader.releaseLock();
  }
}

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

  const parsed = ratingResponse.safeParse(await readRatingBody(response));
  if (!parsed.success || parsed.data.playerId !== osuId)
    throw new Error("Skill Issue returned an invalid rating.");

  const { rating, modifications, skillsets } = parsed.data;
  return {
    kind: "rating",
    value: rating?.value ?? null,
    snapshot: { rating, modifications, skillsets },
  } as const;
}
