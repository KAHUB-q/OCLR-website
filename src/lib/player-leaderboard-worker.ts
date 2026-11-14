import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db, readOnlyData } from "@/db";
import {
  playerLeaderboardRows,
  playerLeaderboardVersions,
  rankingSnapshots,
} from "@/db/schema";
import { archiveArtworkSetIds } from "./archive-artwork";
import { publicArchiveStatistics } from "./archive-statistics-reads";
import { readTournaments } from "./tournament-reads";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";
import { HttpError } from "./http-error";
import { projectPlayerLeaderboard } from "./player-leaderboard-projector";
import {
  leaderboardSource,
  matchingLeaderboard,
  leaderboardRow,
  PLAYER_LEADERBOARD_PROJECTOR,
} from "./player-leaderboard-cache";
import { projectCareerLeaderboard } from "./player-career";
import { projectBeatmapLeaderboard } from "./beatmap-leaderboard";
import {
  hasRankingSnapshot,
  rankingSnapshotSources,
} from "./ranking-snapshot-cache";
import {
  beatmapRankingSnapshot,
  careerRankingSnapshot,
} from "./ranking-snapshot-model";

type RankingReader = Parameters<typeof rankingSnapshotSources>[0];

async function rankingWork(
  reader: RankingReader,
  sourceHash: string,
  rebuild: boolean,
) {
  const hashes = await rankingSnapshotSources(reader, sourceHash);
  return {
    hashes,
    career:
      rebuild || !(await hasRankingSnapshot(reader, "career", hashes.career)),
    beatmap:
      rebuild || !(await hasRankingSnapshot(reader, "beatmap", hashes.beatmap)),
  };
}

/** Explicit operator/background job, never invoked by page/API reads. A small
 * writer transaction holds only the job lock while projection uses a separate
 * read-only repeatable snapshot. Source changes supersede the result safely.
 */
export async function refreshPlayerLeaderboard(apply = false, rebuild = false) {
  if (remoteMode() || (apply && inReadChannel()))
    throw new HttpError(
      403,
      "Background calculation requires an operator database.",
    );
  if (!apply)
    return readOnlyData(async () => {
      const source = await leaderboardSource(db());
      const ready = await matchingLeaderboard(db(), source.sourceHash);
      const work =
        source.sourceHash &&
        (await rankingWork(db(), source.sourceHash, false));
      return {
        status:
          ready && work && !work.career && !work.beatmap
            ? "current"
            : "pending",
        career: work && !work.career ? "current" : "pending",
        beatmap: work && !work.beatmap ? "current" : "pending",
        created: false,
        sourceComplete: source.sourceHash !== null,
        editions: source.editions,
        players: ready?.players ?? 0,
      };
    });
  return db().transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(1329810514, 916) AS locked`,
    );
    if (!lock.rows[0].locked) return { status: "busy", created: false };
    const source = await leaderboardSource(tx);
    if (!source.sourceHash)
      throw new HttpError(
        409,
        "Historical source metadata is incomplete; run the reviewed normalization first.",
      );
    const sourceHash = source.sourceHash;
    const existing = await matchingLeaderboard(tx, sourceHash);
    const work = await rankingWork(tx, sourceHash, rebuild);
    const refreshPerformance = !existing || rebuild;
    if (!refreshPerformance && !work.career && !work.beatmap)
      return {
        status: "current",
        created: false,
        editions: source.editions,
        players: existing.players,
        career: "current",
        beatmap: "current",
      };
    const calculated = await readOnlyData(async () => {
      const start = await leaderboardSource(db());
      if (start.sourceHash !== sourceHash) return null;
      const hashes = await rankingSnapshotSources(db(), sourceHash);
      if (!isDeepStrictEqual(hashes, work.hashes)) return null;
      const editions = (await readTournaments(true)).map((row) => row.edition);
      // Reuse each public statistics read across the three projections. Read serially
      // because these services use nested transactions on the same connection.
      const statistics = new Map<
        string,
        ReturnType<typeof publicArchiveStatistics>
      >();
      const readStatistics: typeof publicArchiveStatistics = (slug) => {
        const saved = statistics.get(slug);
        if (saved) return saved;
        const requested = publicArchiveStatistics(slug);
        statistics.set(slug, requested);
        return requested;
      };
      const performance = refreshPerformance
        ? await projectPlayerLeaderboard(editions, readStatistics)
        : null;
      const career = work.career
        ? await projectCareerLeaderboard(
            editions,
            performance?.players.map(({ osuId }) => osuId) ??
              (
                await db()
                  .select({ osuId: playerLeaderboardRows.osuId })
                  .from(playerLeaderboardRows)
                  .where(eq(playerLeaderboardRows.generationId, existing!.id))
              ).map(({ osuId }) => osuId),
            readStatistics,
          )
        : null;
      const beatmap = work.beatmap
        ? await projectBeatmapLeaderboard(editions, readStatistics)
        : null;
      return { performance, career, beatmap };
    });
    // Cover art is optional. Only the worker may request missing official metadata,
    // and the read-only database snapshot has already been released.
    const maps = calculated?.beatmap?.maps;
    if (maps && process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET) {
      const missing = maps.filter((row) => row.beatmapSetId === null);
      if (missing.length) {
        const setIds = await archiveArtworkSetIds(
          missing.map((row) => row.beatmapId),
        ).catch((): Record<number, number | null> => ({}));
        for (const row of missing)
          row.beatmapSetId = setIds[row.beatmapId] ?? null;
      }
    }
    const current = await leaderboardSource(tx);
    if (
      !calculated ||
      current.sourceHash !== sourceHash ||
      !isDeepStrictEqual(
        await rankingSnapshotSources(tx, current.sourceHash),
        work.hashes,
      )
    )
      return { status: "superseded", created: false };

    const { performance, career, beatmap } = calculated;
    if (performance) await savePerformance(tx, current.sourceHash, performance);
    if (career)
      await tx.insert(rankingSnapshots).values({
        kind: "career",
        sourceHash: work.hashes.career,
        result: careerRankingSnapshot.parse(career),
      });
    if (beatmap)
      await tx.insert(rankingSnapshots).values({
        kind: "beatmap",
        sourceHash: work.hashes.beatmap,
        result: beatmapRankingSnapshot.parse(beatmap),
      });
    return {
      status: "updated",
      created: true,
      editions: current.editions,
      players: performance?.players.length ?? existing!.players,
      career: career ? "updated" : "current",
      beatmap: beatmap ? "updated" : "current",
    };
  });
}

async function savePerformance(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  sourceHash: string,
  result: Awaited<ReturnType<typeof projectPlayerLeaderboard>>,
) {
  for (const player of result.players)
    if (
      Object.values(player).some(
        (v) => typeof v === "number" && !Number.isFinite(v),
      )
    )
      throw new Error("Background ranking produced invalid numeric data.");
  const [version] = await tx
    .insert(playerLeaderboardVersions)
    .values({
      sourceHash,
      projectorVersion: PLAYER_LEADERBOARD_PROJECTOR,
      editions: result.editions,
      unavailableEditions: result.unavailableEditions,
      maps: result.maps,
      skippedMaps: result.skippedMaps,
      players: result.players.length,
    })
    .returning();
  for (let offset = 0; offset < result.players.length; offset += 250)
    await tx.insert(playerLeaderboardRows).values(
      result.players.slice(offset, offset + 250).map((row, i) => {
        const { pp: _pp, classification, ...player } = row;
        void _pp;
        return {
          ...player,
          generationId: version.id,
          position: offset + i,
          classCategory: classification?.category ?? null,
          classCode: classification?.code ?? null,
        };
      }),
    );
  const restored = (
    await tx
      .select()
      .from(playerLeaderboardRows)
      .where(eq(playerLeaderboardRows.generationId, version.id))
      .orderBy(playerLeaderboardRows.position)
  ).map(leaderboardRow);
  if (!isDeepStrictEqual(restored, result.players))
    throw new Error("Background ranking roundtrip mismatch.");
}
