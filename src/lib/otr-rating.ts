import "server-only";

import { readCachedOtrRatings, type OtrRating } from "./otr-rating-cache";

export type { OtrRating } from "./otr-rating-cache";

export async function getOtrRating(osuId: number): Promise<OtrRating | null> {
  try {
    return (await readCachedOtrRatings([osuId])).get(osuId) ?? null;
  } catch {
    return null;
  }
}

export async function getDirectoryOtrRatings(
  osuIds: number[],
): Promise<Record<number, number>> {
  try {
    const ratings = await readCachedOtrRatings([...new Set(osuIds)]);
    return Object.fromEntries(
      [...ratings].map(([osuId, rating]) => [osuId, rating.value]),
    );
  } catch {
    return {};
  }
}
