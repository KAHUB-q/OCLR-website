import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { otrRatingCache } from "@/db/schema";

const ratingLifetime = 24 * 60 * 60_000;
const missingLifetime = 60 * 60_000;
const retryDelay = 5 * 60_000;

export type OtrRating = {
  value: number;
  fetchedAt: string;
  profileUrl: string;
};

export async function readCachedOtrRating(
  osuId: number,
  load: () => Promise<OtrRating | null>,
): Promise<OtrRating | null> {
  const database = db();
  const player = eq(otrRatingCache.osuId, osuId);
  const read = async () =>
    (await database.select().from(otrRatingCache).where(player))[0];

  const cached = await read();
  const now = new Date();
  if (cached && cached.retryAt > now) return cached.rating;

  // Claim the refresh before calling the provider. Other processes can serve
  // the saved rating while the claim is active, including after a failed call.
  const retryAt = new Date(now.getTime() + retryDelay);
  const [claim] = await database
    .insert(otrRatingCache)
    .values({ osuId, retryAt })
    .onConflictDoUpdate({
      target: otrRatingCache.osuId,
      set: { retryAt },
      setWhere: lte(otrRatingCache.retryAt, now),
    })
    .returning({ rating: otrRatingCache.rating });
  if (!claim) return (await read())?.rating ?? null;

  let rating: OtrRating | null;
  try {
    rating = await load();
  } catch {
    return claim.rating;
  }

  const [saved] = await database
    .update(otrRatingCache)
    .set({
      rating,
      retryAt: new Date(
        Date.now() + (rating ? ratingLifetime : missingLifetime),
      ),
    })
    .where(and(player, eq(otrRatingCache.retryAt, retryAt)))
    .returning({ rating: otrRatingCache.rating });
  if (!saved) return (await read())?.rating ?? null;
  return saved.rating;
}
