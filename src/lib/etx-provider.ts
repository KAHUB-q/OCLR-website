import { z } from "zod";
import type { EtxRating } from "./etx-rating";
import { readRatingBody } from "./rating-provider-body";
import { etxMods, type EtxMod, type EtxMods } from "./etx-rating-model";

const modFields = {
  NM: "osuNoModDuelStarRating",
  HD: "osuHiddenDuelStarRating",
  HR: "osuHardRockDuelStarRating",
  DT: "osuDoubleTimeDuelStarRating",
  FM: "osuFreeModDuelStarRating",
} as const satisfies Record<EtxMod, string>;

const stars = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .pipe(z.number().finite().nonnegative());
const payloadSchema = z.object({
  osuUserId: z
    .union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()])
    .optional(),
  duelRating: z.looseObject({
    osuDuelStarRating: stars,
    osuDuelProvisional: z.boolean().nullish(),
    osuDuelOutdated: z.boolean().nullish(),
  }),
});

export async function fetchEtxRating(
  osuId: number,
): Promise<EtxRating | "throttled" | null> {
  if (!Number.isSafeInteger(osuId) || osuId <= 0)
    throw new Error("Invalid osu! UID");
  const url = new URL(
    "https://www.eliteronix.de/elitebotix/api/player-duelrating",
  );
  url.searchParams.set("u", String(osuId));
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    if (response.status === 404) {
      const missing = await readRatingBody(
        response,
        (text) =>
          text.trim() === "No duel rating found for the specified osu! user id",
      );
      if (missing) return null;
    } else {
      void response.body?.cancel().catch(() => {});
      if (response.status === 429) return "throttled";
    }
    throw new Error("ETX rating request failed");
  }
  const { osuUserId, duelRating } = payloadSchema.parse(
    await readRatingBody<unknown>(response, JSON.parse),
  );
  if (osuUserId !== undefined && String(osuUserId) !== String(osuId))
    throw new Error("ETX returned a different player");
  const mods: EtxMods = {};
  for (const mod of etxMods) {
    const value = duelRating[modFields[mod]];
    if (value != null) mods[mod] = stars.parse(value);
  }
  return {
    value: duelRating.osuDuelStarRating,
    provisional: duelRating.osuDuelProvisional ?? null,
    outdated: duelRating.osuDuelOutdated ?? null,
    mods,
  };
}
