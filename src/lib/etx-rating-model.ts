import { z } from "zod";

export const etxMods = ["NM", "HD", "HR", "DT", "FM"] as const;
export type EtxMod = (typeof etxMods)[number];
export const etxCsvColumns: Record<EtxMod, string> = {
  NM: "noModDuelStarRating",
  HD: "hiddenDuelStarRating",
  HR: "hardRockDuelStarRating",
  DT: "doubleTimeDuelStarRating",
  FM: "freeModDuelStarRating",
};

// Saved maps contain only available values. A CSV patch can additionally contain
// null (clear this mod); an absent patch key means leave that mod alone.
export const etxModsSchema = z.partialRecord(
  z.enum(etxMods),
  z.number().finite().nonnegative(),
);
export type EtxMods = z.infer<typeof etxModsSchema>;
export type EtxModPatch = Partial<Record<EtxMod, number | null>>;
