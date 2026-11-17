import { setTimeout } from "node:timers/promises";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, getPool, readOnlyData } from "@/db";
import { otrRatingCache } from "@/db/schema";
import { getPublicEditions } from "./content";
import { remoteMode } from "./data-source";
import { fetchOtrRating, OtrRequestError } from "./otr-rating-provider";
import { publicPlayersForEditions } from "./players";

async function publicPlayerIds() {
  return readOnlyData(async () => {
    const editions = (await getPublicEditions()).filter(
      (edition) => !edition.slug.startsWith("dev-"),
    );
    const { rows } = await publicPlayersForEditions(
      { q: "", edition: "", page: 1 },
      editions,
    );
    const ids = new Set(rows.map((player) => player.osuId));
    for (const { archive } of editions) {
      for (const player of archive?.players ?? []) ids.add(player.osuId);
      for (const replacement of archive?.rosterReplacements ?? []) {
        for (const player of replacement.people) {
          if (player.osuId !== null) ids.add(player.osuId);
        }
      }
    }
    return [...ids]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .sort((a, b) => a - b);
  });
}

async function pendingPlayers(database: Pick<ReturnType<typeof db>, "select">) {
  const ids = await publicPlayerIds();
  if (!ids.length) return { ids, tracked: 0 };
  const deferred = new Set(
    (
      await database
        .select({ osuId: otrRatingCache.osuId })
        .from(otrRatingCache)
        .where(
          and(
            inArray(otrRatingCache.osuId, ids),
            gt(otrRatingCache.retryAt, new Date()),
          ),
        )
    ).map((row) => row.osuId),
  );
  return { ids: ids.filter((id) => !deferred.has(id)), tracked: ids.length };
}

function nextTaipeiDay(now: Date) {
  const day = 24 * 60 * 60_000;
  const taipeiOffset = 8 * 60 * 60_000;
  return new Date(
    (Math.floor((now.getTime() + taipeiOffset) / day) + 1) * day - taipeiOffset,
  );
}

export async function refreshOtrRatings(apply = false) {
  if (remoteMode())
    throw new Error("o!TR refresh requires an operator database");
  const key = process.env.OTR_API_KEY?.trim();
  const counts = { tracked: 0, pending: 0, saved: 0, missing: 0, failed: 0 };
  if (!key) return { status: "disabled", ...counts };
  if (!apply) {
    const { ids, tracked } = await pendingPlayers(db());
    return { status: "preview", ...counts, tracked, pending: ids.length };
  }

  // The lock and all writes use one session. Losing that connection prevents
  // the next claim (and its request). Each claim and result commits separately.
  const client = await getPool().connect();
  client.on("error", () => {
    console.error("o!TR refresh lost its database connection.");
  });
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(1329810514, 1097) AS locked",
    );
    if (!lock.rows[0].locked) return { status: "busy", ...counts };
    const database = drizzle(client);
    const { ids, tracked } = await pendingPlayers(database);
    counts.tracked = tracked;
    counts.pending = ids.length;
    let status = "complete";

    for (const osuId of ids) {
      // Wait before the first request too, so consecutive worker runs cannot
      // send requests less than a second apart. Never send requests in parallel.
      await setTimeout(1000);
      const now = new Date();
      const retryAt = nextTaipeiDay(now);
      const [claim] = await database
        .insert(otrRatingCache)
        .values({ osuId, retryAt })
        .onConflictDoUpdate({
          target: otrRatingCache.osuId,
          set: { retryAt },
          setWhere: lte(otrRatingCache.retryAt, now),
        })
        .returning({ osuId: otrRatingCache.osuId });
      counts.pending--;
      if (!claim) continue;

      let rating;
      try {
        rating = await fetchOtrRating(osuId, key);
      } catch (error) {
        counts.failed++;
        if (error instanceof OtrRequestError) {
          if (error.status === 429) status = "rate-limited";
          if (error.status === 401 || error.status === 403)
            status = "unauthorized";
        }
        if (status !== "complete") break;
        continue;
      }

      await database
        .update(otrRatingCache)
        .set({ rating })
        .where(
          and(
            eq(otrRatingCache.osuId, osuId),
            eq(otrRatingCache.retryAt, retryAt),
          ),
        );
      if (rating) counts.saved++;
      else counts.missing++;
    }
    return { status, ...counts };
  } finally {
    // Destroy the session so its advisory lock cannot return to the pool.
    client.release(true);
  }
}
