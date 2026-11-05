import { z } from "zod";
import { difficultyConfigurations, difficultyMods } from "./mappool-model";

const metric = z.number().finite().nonnegative().nullable();
const attributes = z.object({
  configuration: z.enum(difficultyConfigurations),
  mods: z.array(z.string()),
  ruleset: z.enum(["osu", "taiko", "fruits", "mania"]),
  stars: z.number().finite().nonnegative(),
  maxCombo: z.number().int().nonnegative().nullable(),
  values: z.record(z.string(), z.number().finite()),
  fetchedAt: z.iso.datetime({ offset: true }),
});
export const difficultySnapshotSchema = z
  .object({
    beatmapId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    ruleset: z.enum(["osu", "taiko", "fruits", "mania"]),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{32}$/i)
      .nullable(),
    fetchedAt: z.iso.datetime({ offset: true }),
    base: z.object({
      stars: metric,
      bpm: metric,
      duration: metric,
      ar: metric,
      od: metric,
      cs: metric,
      hp: metric,
    }),
    variants: z.partialRecord(z.enum(difficultyConfigurations), attributes),
  })
  .superRefine((s, context) => {
    for (const [key, a] of Object.entries(s.variants)) {
      if (
        key !== a.configuration ||
        a.ruleset !== s.ruleset ||
        JSON.stringify(a.mods) !==
          JSON.stringify(difficultyMods[a.configuration])
      )
        context.addIssue({
          code: "custom",
          message: "Difficulty snapshot identity/configuration mismatch.",
        });
    }
  });
