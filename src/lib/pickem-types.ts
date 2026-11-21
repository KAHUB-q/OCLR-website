import type { PickemOutcome, PickemRules, PickemScore } from "./pickem-model";

export type PickemSaved = {
  outcomeKey: PickemOutcome;
  score: PickemScore | null;
  version: number;
  updatedAt: string;
};

export type PickemStatus = "open" | "closed" | "pending" | "settled" | "void";
export type PickemTeam = { id: string; name: string; avatarKey: string | null };
export type PickemFixture = {
  fixtureId: string;
  windowId: string;
  label: string;
  roundId: string;
  roundName: string;
  scheduledAt: string | null;
  closesAt: string;
  timeZone: string;
  home: PickemTeam;
  away: PickemTeam;
  status: PickemStatus;
  voidReason: string | null;
  outcomes: readonly PickemOutcome[];
  scoreRules: PickemRules | null;
  mine: PickemSaved | null;
  distribution?: { outcomeKey: PickemOutcome; count: number }[];
  result: {
    outcomeKey: PickemOutcome;
    score: PickemScore | null;
    revision: number;
  } | null;
  points: { outcomePoints: number; scorePoints: number; points: number } | null;
};

export type PickemRank = {
  position: number;
  tied: boolean;
  username: string;
  mine: boolean;
  points: number;
  correct: number;
  exact: number;
  settled: number;
};

export type PickemNamedPage = {
  rows: {
    username: string;
    outcomeKey: PickemOutcome;
    score: PickemScore | null;
  }[];
  nextCursor: number | null;
};
