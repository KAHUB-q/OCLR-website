import { and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { etxRatingCache } from "@/db/schema";
import type { EtxMods } from "./etx-rating-model";

export type EtxRating = {
  value: number;
  provisional: boolean | null;
  outdated: boolean | null;
  mods?: EtxMods;
};

/** Only look up IDs from the publication-checked directory. */
export async function readDirectoryEtxRatings(osuIds: number[]) {
  return new Map(
    [...(await readEtxRatingSnapshots(osuIds))].map(([osuId, { rating }]) => [
      osuId,
      rating && {
        value: rating.value,
        provisional: rating.provisional ?? undefined,
        outdated: rating.outdated ?? undefined,
      },
    ]),
  );
}

/** Only look up IDs with publication-checked participation. */
export async function readEtxRatingSnapshots(osuIds: number[]) {
  if (!osuIds.length)
    return new Map<number, { rating: EtxRating | null; fetchedAt: Date }>();
  const rows = await db()
    .select({
      osuId: etxRatingCache.osuId,
      rating: etxRatingCache.rating,
      fetchedAt: etxRatingCache.fetchedAt,
    })
    .from(etxRatingCache)
    .where(
      and(
        inArray(etxRatingCache.osuId, [...new Set(osuIds)]),
        isNotNull(etxRatingCache.fetchedAt),
      ),
    );
  const snapshots = new Map<
    number,
    { rating: EtxRating | null; fetchedAt: Date }
  >();
  for (const { osuId, rating, fetchedAt } of rows) {
    if (fetchedAt) snapshots.set(osuId, { rating, fetchedAt });
  }
  return snapshots;
}
