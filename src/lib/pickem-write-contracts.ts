import { z } from "zod";
import {
  pickemAdminBody,
  pickemOutcomes,
  pickemPickBody,
  pickemScore,
  pickemSettingsBody,
} from "./pickem-model";
import type { WriteApiOperation } from "./write-api-contract";

const version = z.number().int().nonnegative();
const instant = z.iso.datetime({ offset: true });
const saved = z.strictObject({
  outcomeKey: z.enum(pickemOutcomes),
  score: pickemScore.nullable(),
  version,
  updatedAt: instant,
});
const error = z.object({
  error: z.string(),
  code: z.string().optional(),
  current: saved.nullable().optional(),
});
const browser = {
  access: "browser",
  maxBodyBytes: 4096,
  successStatus: 200,
  errors: {
    400: "Invalid prediction or command.",
    401: "An active browser session is required.",
    403: "Origin, authentication channel or edition access rejected.",
    404: "The tournament or match is unavailable.",
    409: "The window, selection or expected version changed.",
    413: "Request body too large.",
    415: "Send JSON data.",
    500: "Unexpected failure.",
  },
  errorResponses: { 400: error, 404: error, 409: error },
} as const;
const admin = {
  ...browser,
  consumers: ["src/components/pickem-admin.tsx"],
} as const;

export const savePickemWrite = {
  ...browser,
  id: "savePickemPrediction",
  path: "/api/tournaments/{edition}/pickem/fixtures/{fixtureId}/pick",
  method: "PUT",
  parameters: { fixtureId: z.uuid() },
  request: pickemPickBody,
  summary: "Save the signed-in player's match prediction",
  description:
    "Provide an Idempotency-Key UUID header. A new selection expects null for expectedVersion. Set publishAfterMatch to true to acknowledge that anyone can see the selection and optional score with the osu! name after the match ends. The server checks the published match, deadline, window version, and optional score against its frozen series rules.",
  successDescription: "Saved personal prediction and authoritative deadline.",
  response: z.strictObject({ saved, closesAt: instant, serverNow: instant }),
  consumers: ["src/components/pickem-match-card.tsx"],
} as const satisfies WriteApiOperation;

export const changePickemSettingsWrite = {
  ...admin,
  id: "changePickemSettings",
  path: "/api/admin/tournaments/{edition}/pickem/settings",
  method: "PUT",
  request: pickemSettingsBody,
  summary: "Enable or disable a tournament's Pick’em",
  description:
    "Requires configure_tournament in this edition. A change is audited in the settings transaction.",
  successDescription: "Current enabled status and settings version.",
  response: z.strictObject({ enabled: z.boolean(), version }),
} as const satisfies WriteApiOperation;

export const commandPickemWindowWrite = {
  ...admin,
  id: "commandPickemWindow",
  path: "/api/admin/tournaments/{edition}/pickem/fixtures/{fixtureId}",
  method: "POST",
  request: pickemAdminBody,
  parameters: { fixtureId: z.uuid() },
  summary: "Open, tighten, close or void a match prediction window",
  description:
    "Requires configure_tournament in this edition, eligible published fixtures, and matching versions. A window's deadline can only move earlier. Opening optionally enables exact score predictions.",
  successDescription:
    "The window ID, version, score mode and effective deadline.",
  response: z.strictObject({
    id: z.uuid(),
    version,
    closesAt: instant,
    scoreEnabled: z.boolean(),
    voidReason: z.string().nullable(),
  }),
} as const satisfies WriteApiOperation;
