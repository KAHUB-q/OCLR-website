import { z } from "zod";

export const exhibitionNamesSchema = z
  .object({
    red: z.string().trim().min(1).max(100),
    blue: z.string().trim().min(1).max(100),
  })
  .strict();
export const exhibitionSidesSchema = z
  .object({
    redId: z.uuid(),
    blueId: z.uuid(),
    redName: exhibitionNamesSchema.shape.red,
    blueName: exhibitionNamesSchema.shape.blue,
  })
  .strict()
  .refine((value) => value.redId !== value.blueId);
export type ExhibitionSides = z.infer<typeof exhibitionSidesSchema>;

/** Fixture-local identities, never rows in the official teams directory. */
export function openExhibitionSides(
  fixture: {
    exhibitionSides?: ExhibitionSides | null;
    homeTeamId?: string | null;
    awayTeamId?: string | null;
  },
  stage?: string,
) {
  if (
    (stage !== undefined && stage !== "exhibition") ||
    fixture.homeTeamId ||
    fixture.awayTeamId
  )
    return null;
  const parsed = exhibitionSidesSchema.safeParse(fixture.exhibitionSides);
  return parsed.success ? parsed.data : null;
}
export function exhibitionParticipants(sides: ExhibitionSides) {
  return [
    { id: sides.redId, name: sides.redName },
    { id: sides.blueId, name: sides.blueName },
  ] as const;
}
