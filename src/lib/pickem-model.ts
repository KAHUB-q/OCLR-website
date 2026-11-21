import { z } from "zod";
import type { ScoringRules } from "./competition-model";

export const pickemOutcomes = ["home", "away", "draw"] as const;
export type PickemOutcome = (typeof pickemOutcomes)[number];

export const pickemScore = z
  .object({
    homeWins: z.number().int().min(0).max(99),
    awayWins: z.number().int().min(0).max(99),
  })
  .strict();
export type PickemScore = z.infer<typeof pickemScore>;
export type PickemRules = Pick<ScoringRules, "series" | "tiedMapPolicy">;
export const pickemScoringVersion = 1;

export function pickemRules(rules: ScoringRules): PickemRules {
  return { series: rules.series, tiedMapPolicy: rules.tiedMapPolicy };
}

export function pickemOutcomesFor({
  series,
  tiedMapPolicy,
}: PickemRules): readonly PickemOutcome[] {
  return series.type === "fixed_maps" &&
    series.allowDraw &&
    (series.count % 2 === 0 || tiedMapPolicy === "count_as_draw")
    ? pickemOutcomes
    : ["home", "away"];
}

export function scoreOutcome({
  homeWins,
  awayWins,
}: PickemScore): PickemOutcome {
  return homeWins === awayWins ? "draw" : homeWins > awayWins ? "home" : "away";
}

export function legalPickemScore(
  rules: PickemRules,
  outcome: PickemOutcome,
  score: PickemScore,
) {
  if (!pickemScore.safeParse(score).success || scoreOutcome(score) !== outcome)
    return false;
  const { series, tiedMapPolicy } = rules;
  const { homeWins, awayWins } = score;
  if (series.type === "first_to")
    return (
      Math.max(homeWins, awayWins) === series.wins &&
      Math.min(homeWins, awayWins) < series.wins
    );
  if (outcome === "draw" && !series.allowDraw) return false;
  const played = homeWins + awayWins;
  return tiedMapPolicy === "count_as_draw"
    ? played <= series.count
    : played === series.count;
}

export function pickemPoints(
  pick: { outcomeKey: PickemOutcome; score: PickemScore | null },
  outcome: PickemOutcome,
  comparable: PickemScore | null,
) {
  const outcomePoints = Number(pick.outcomeKey === outcome);
  const scorePoints = Number(
    Boolean(
      outcomePoints &&
      pick.score &&
      comparable &&
      pick.score.homeWins === comparable.homeWins &&
      pick.score.awayWins === comparable.awayWins,
    ),
  );
  return { outcomePoints, scorePoints, points: outcomePoints + scorePoints };
}

const uuid = z.uuid();
export const pickemPickBody = z
  .object({
    windowId: uuid,
    outcomeKey: z.enum(pickemOutcomes),
    score: pickemScore.nullish(),
    expectedVersion: z.number().int().positive().nullable(),
  })
  .strict();
const version = z.number().int().nonnegative();
export const pickemSettingsBody = z
  .object({
    enabled: z.boolean(),
    expectedVersion: version,
  })
  .strict();
export const pickemVisibilityBody = z
  .object({
    listed: z.boolean(),
    expectedVersion: version,
  })
  .strict();

const closesAt = z.iso.datetime({ offset: true });
const windowVersion = { windowId: uuid, expectedVersion: version };
export const pickemAdminBody = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("open"),
      closesAt,
      fixtureVersion: version,
      scoreEnabled: z.boolean(),
    })
    .strict(),
  z
    .object({ action: z.literal("tighten"), closesAt, ...windowVersion })
    .strict(),
  z.object({ action: z.literal("close"), ...windowVersion }).strict(),
  z.object({ action: z.literal("void"), ...windowVersion }).strict(),
]);

export function pickemReturnPath(value: string | null) {
  if (
    !value ||
    !/^\/tournaments\/[a-z0-9-]{1,80}\/pickem(?:\/(?:mine|leaderboard))?$/.test(
      value,
    )
  )
    return null;
  return value;
}

export function pickemPage<T>(rows: T[], cursor = 0, size = 25) {
  const next = cursor + size;
  return {
    rows: rows.slice(cursor, next),
    nextCursor: next < rows.length ? next : null,
  };
}
