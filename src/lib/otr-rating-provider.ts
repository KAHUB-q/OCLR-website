import { z } from "zod";
import type { OtrRating } from "./otr-rating-cache";

const origin = "https://otr.stagec.net";
const standardRuleset = 0;
const playerStats = z.object({
  playerInfo: z.object({ id: z.int().positive(), osuId: z.int().positive() }),
  ruleset: z.literal(standardRuleset),
  rating: z
    .object({ ruleset: z.literal(standardRuleset), rating: z.number() })
    .nullable(),
});

export class OtrRequestError extends Error {
  constructor(readonly status: number) {
    super("o!TR rating request failed");
  }
}

/** Only the background worker calls the provider. */
export async function fetchOtrRating(
  osuId: number,
  key: string,
): Promise<OtrRating | null> {
  const url = new URL(`/api/players/${osuId}/stats`, origin);
  url.searchParams.set("keyType", "osu");
  url.searchParams.set("ruleset", String(standardRuleset));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(2000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new OtrRequestError(response.status);

  const stats = playerStats.parse(await response.json());
  if (stats.playerInfo.osuId !== osuId)
    throw new Error("o!TR returned a different player");
  if (!stats.rating) return null;

  return {
    value: stats.rating.rating,
    fetchedAt: new Date().toISOString(),
    // The public website resolves numeric paths by o!TR ID first.
    profileUrl: `${origin}/players/${stats.playerInfo.id}?ruleset=${standardRuleset}`,
  };
}
