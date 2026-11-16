import { z } from "zod";

export const matchVodUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .regex(/^https:\/\/[^/?#@\\]+(?:[/?#]|$)/i);
