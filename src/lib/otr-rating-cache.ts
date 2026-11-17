import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { otrRatingCache } from "@/db/schema";

export type OtrRating = {
  value: number;
  fetchedAt: string;
  profileUrl: string;
};

export async function readCachedOtrRatings(osuIds: number[]) {
  if (!osuIds.length || !process.env.DATABASE_URL)
    return new Map<number, OtrRating>();

  const rows = await db()
    .select({ osuId: otrRatingCache.osuId, rating: otrRatingCache.rating })
    .from(otrRatingCache)
    .where(inArray(otrRatingCache.osuId, osuIds));
  const ratings = new Map<number, OtrRating>();
  for (const { osuId, rating } of rows) {
    if (rating) ratings.set(osuId, rating);
  }
  return ratings;
}
