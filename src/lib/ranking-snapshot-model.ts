import { z } from "zod";
import { appearances } from "./preferences";
import { playerClassificationReadContract } from "./player-leaderboard-model";

const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();
const count = z.int().nonnegative();
const coverage = {
  editions: count,
  unavailableEditions: z.array(z.string()),
};
const snapshotState = {
  state: z.enum(["pending", "ready"]),
  calculatedAt: nullableString,
};
const careerTotals = z.strictObject({
  championships: count,
  runnerUps: count,
  thirdPlaces: count,
  seasons: count,
  firstPlaces: count,
  secondPlaces: count,
  thirdPlaceMaps: count,
  mapsPlayed: count,
  mapsWon: count,
  mapsLost: count,
  mapsTied: count,
  mapWinRate: nullableNumber,
  averageAccuracy: nullableNumber,
  longestWinStreak: count,
});
const careerRow = z.strictObject({
  osuId: z.int().positive(),
  career: careerTotals,
});
export const careerRankingSnapshot = z.strictObject({
  ...coverage,
  players: z.array(careerRow),
});
export const careerLeaderboardReadContract = careerRankingSnapshot.extend({
  ...snapshotState,
  players: z.array(
    careerRow.extend({
      username: z.string(),
      pp: nullableNumber,
      classification: playerClassificationReadContract.nullable(),
      avatarUrl: nullableString,
      coverUrl: nullableString,
    }),
  ),
});

const beatmapRow = z.strictObject({
  beatmapId: z.int().positive(),
  beatmapSetId: nullableNumber,
  title: z.string(),
  difficulty: nullableString,
  slot: z.string(),
  season: nullableString,
  editionName: z.string(),
  appearance: z.enum(appearances).nullable(),
  round: z.string(),
  archive: z.boolean(),
  roundId: z.string(),
  stars: nullableNumber,
  fittedStars: nullableNumber,
  fittedOffset: nullableNumber,
  picks: count.nullable(),
  bans: count.nullable(),
  plays: count,
  averageAccuracy: nullableNumber,
  averageCombo: nullableNumber,
});
export const beatmapRankingSnapshot = z.strictObject({
  ...coverage,
  maps: z.array(beatmapRow),
});
export const beatmapLeaderboardReadContract =
  beatmapRankingSnapshot.extend(snapshotState);

export type CareerRankingSnapshot = z.infer<typeof careerRankingSnapshot>;
export type BeatmapRankingSnapshot = z.infer<typeof beatmapRankingSnapshot>;
export type CareerLeaderboard = z.infer<typeof careerLeaderboardReadContract>;
export type BeatmapLeaderboard = z.infer<typeof beatmapLeaderboardReadContract>;
export type CareerLeaderboardRow = CareerLeaderboard["players"][number];
export type BeatmapLeaderboardRow = BeatmapLeaderboard["maps"][number];
