import { db, readOnlyData } from "@/db";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import { leaderboardSource } from "./player-leaderboard-cache";
import {
  databasePlayerLeaderboard,
  supportsRankingReads,
} from "./player-leaderboard";
import {
  matchingRankingSnapshot,
  rankingSnapshotSources,
  type RankingKind,
} from "./ranking-snapshot-cache";
import {
  beatmapRankingSnapshot,
  careerRankingSnapshot,
  type BeatmapLeaderboard,
  type CareerLeaderboard,
} from "./ranking-snapshot-model";

const pending = () => ({
  state: "pending" as const,
  calculatedAt: null,
  editions: 0,
  unavailableEditions: [],
});
const pendingCareer = (): CareerLeaderboard => ({ ...pending(), players: [] });
const pendingBeatmaps = (): BeatmapLeaderboard => ({ ...pending(), maps: [] });

async function readSnapshot(kind: RankingKind) {
  const source = await leaderboardSource(db());
  if (!source.sourceHash) return undefined;
  const hashes = await rankingSnapshotSources(db(), source.sourceHash);
  return matchingRankingSnapshot(db(), kind, hashes[kind]);
}

export async function databaseCareerLeaderboard(): Promise<CareerLeaderboard> {
  if (!process.env.DATABASE_URL) return pendingCareer();
  return readOnlyData(async () => {
    const snapshot = await readSnapshot("career");
    if (!snapshot) return pendingCareer();
    const result = careerRankingSnapshot.parse(snapshot.result);
    const performance = await databasePlayerLeaderboard();
    if (performance.state !== "ready") return pendingCareer();
    const players = new Map(performance.players.map((row) => [row.osuId, row]));
    return {
      ...result,
      players: result.players.flatMap(({ osuId, career }) => {
        const player = players.get(osuId);
        if (!player) return [];
        const art = performance.art[osuId];
        return [
          {
            osuId,
            career,
            username: player.username,
            pp: player.pp,
            classification: player.classification,
            avatarUrl: art?.avatarUrl ?? null,
            coverUrl: art?.coverUrl ?? null,
          },
        ];
      }),
      state: "ready",
      calculatedAt: snapshot.calculatedAt.toISOString(),
    };
  });
}

export async function databaseBeatmapLeaderboard(): Promise<BeatmapLeaderboard> {
  if (!process.env.DATABASE_URL) return pendingBeatmaps();
  return readOnlyData(async () => {
    const snapshot = await readSnapshot("beatmap");
    if (!snapshot) return pendingBeatmaps();
    return {
      ...beatmapRankingSnapshot.parse(snapshot.result),
      state: "ready",
      calculatedAt: snapshot.calculatedAt.toISOString(),
    };
  });
}

export async function careerLeaderboard(): Promise<CareerLeaderboard> {
  if (!remoteMode()) return databaseCareerLeaderboard();
  if (!(await supportsRankingReads(35))) return pendingCareer();
  return frontendResource<CareerLeaderboard>("careerLeaderboard");
}

export async function beatmapLeaderboard(): Promise<BeatmapLeaderboard> {
  if (!remoteMode()) return databaseBeatmapLeaderboard();
  if (!(await supportsRankingReads(35))) return pendingBeatmaps();
  return frontendResource<BeatmapLeaderboard>("beatmapLeaderboard");
}
