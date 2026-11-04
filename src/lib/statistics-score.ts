import { z } from "zod";

export const ezScoreMultiplierSchema = z
  .number()
  .min(0.0001)
  .max(100)
  .refine(
    (value) => /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(String(value)),
    "Use up to 4 decimal places for the EZ multiplier.",
  );
export const STATISTICS_SCORE_POLICY = "ez-score-v1";

/** Always start from the saved MP score, never a previous derived score. */
export function statisticsScore(
  rawScore: number,
  mods: readonly string[],
  ezMultiplier = 1,
) {
  const scoreMultiplier = mods.includes("EZ") ? ezMultiplier : 1;
  if (scoreMultiplier === 1)
    return { rawScore, scoreMultiplier, score: rawScore };
  ezScoreMultiplierSchema.parse(scoreMultiplier);
  if (!Number.isSafeInteger(rawScore) || rawScore < 0)
    throw new RangeError("Statistics require a safe nonnegative MP score.");
  // Decimal integer arithmetic avoids binary rounding at half-score boundaries.
  const units = BigInt(Math.round(scoreMultiplier * 10000));
  const score = Number((BigInt(rawScore) * units + 5000n) / 10000n);
  if (!Number.isSafeInteger(score))
    throw new RangeError(
      "Adjusted statistics score exceeds the safe integer range.",
    );
  return { rawScore, scoreMultiplier, score };
}
