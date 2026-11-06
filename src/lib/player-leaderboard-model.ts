import type { PlayerClass } from "./player-class";
import type { DirectoryArt } from "./osu-profiles";

export type PlayerLeaderboardRow = {
  osuId: number;
  username: string;
  team: string | null;
  pp: number | null;
  mra: number;
  rws: number | null;
  classification: PlayerClass | null;
  wins: number;
  losses: number;
  draws: number;
  appearances: number;
  winRate: number | null;
  participation: number | null;
  nm: number;
  mod: number;
  hd: number;
  hr: number;
  dt: number;
};

export type PlayerLeaderboard = {
  players: PlayerLeaderboardRow[];
  editions: number;
  unavailableEditions: number;
  maps: number;
  skippedMaps: number;
  /** Saved avatar/cover art for the card list, keyed by osu! id. */
  art: Map<number, DirectoryArt>;
  state: "ready" | "pending";
  calculatedAt: string | null;
};

export type PlayerLeaderboardCore = Omit<
  PlayerLeaderboard,
  "art" | "state" | "calculatedAt"
>;
export type PlayerLeaderboardWire = Omit<PlayerLeaderboard, "art"> & {
  art: Record<string, DirectoryArt>;
};
