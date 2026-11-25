import { z } from "zod";
import type { WriteApiOperation } from "./write-api-contract";

export const chatPromptLimit = 3000;
const revision = z.number().int().min(0).max(2147483647);

export const updateChatPromptWrite = {
  id: "updateChatPrompt",
  path: "/api/admin/settings/chat",
  method: "PATCH",
  access: "browser",
  maxBodyBytes: 20000,
  request: z.strictObject({
    prompt: z
      .string()
      .max(chatPromptLimit)
      .trim()
      .refine((prompt) => !prompt.includes("\0")),
    expectedRevision: revision.max(2147483646),
  }),
  summary: "Update the sitewide Liru chat prompt",
  description:
    "Requires a local browser session and global configure_tournament permission. A blank prompt restores the built-in behavior. A stale revision is rejected and unchanged saves do not create audit events.",
  successStatus: 200,
  successDescription: "The saved prompt and its current revision.",
  successHeaders: { "Cache-Control": z.literal("no-store") },
  response: z.strictObject({
    prompt: z.string().max(chatPromptLimit),
    revision,
  }),
  errors: {
    400: "Invalid prompt or revision.",
    401: "A signed-in website session is required.",
    403: "Origin, authentication channel or required permission rejected.",
    409: "The current prompt revision differs from the supplied revision.",
    413: "The request body exceeds the allowed size.",
    415: "JSON is required.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: ["src/components/site-chat-prompt-form.tsx"],
} as const satisfies WriteApiOperation;
