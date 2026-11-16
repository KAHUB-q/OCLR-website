import { z } from "zod";
import { categories } from "./mappool-model";

const pool = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  version: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  stage: z.strictObject({
    id: z.uuid(),
    kind: z.enum(["group", "knockout", "exhibition"]),
  }),
  round: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    position: z.number().int().positive(),
  }),
  entryCount: z.number().int().nonnegative(),
});

export const showcasePoolsSchema = z.strictObject({ pools: z.array(pool) });
export const showcasePoolSchema = z.strictObject({
  pool,
  entries: z.array(
    z.strictObject({
      slot: z.string(),
      category: z.enum(categories),
      position: z.number().int().positive(),
      beatmapId: z.number().int().positive(),
      title: z.string(),
      difficulty: z.string(),
      coverUrl: z.string().startsWith("/api/v1/streaming/").nullable(),
    }),
  ),
});
export const showcaseVersionQuery = z.string().regex(/^(0|[1-9]\d{0,9})$/);
export const showcaseReadMaxBytes = 2097152;
export const showcasePath =
  "/api/v1/streaming/tournaments/{edition}/showcase/pools";
