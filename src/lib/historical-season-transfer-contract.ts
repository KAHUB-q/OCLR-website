import { z } from "zod";
import { editionSlugSchema } from "./editions";
import { historicalSeasonJsonSchema } from "./historical-season-json";
import type { WriteApiOperation } from "./write-api-contract";

import { historicalSeasonJsonLimit } from "./request-body-limits";

const requestMetadata = z.strictObject({
  action: z.enum(["preview", "import"]),
  expectedRevision: z.number().int().nonnegative(),
  confirmed: z.literal(true).optional(),
  previewToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
function requireImportConfirmation(
  input: z.output<typeof requestMetadata>,
  ctx: z.RefinementCtx,
) {
  if (input.action === "import") {
    if (!input.confirmed)
      ctx.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Confirm the import.",
      });
    if (!input.previewToken)
      ctx.addIssue({
        code: "custom",
        path: ["previewToken"],
        message: "Validate the file before importing.",
      });
  } else if (input.confirmed || input.previewToken) {
    ctx.addIssue({
      code: "custom",
      path: ["action"],
      message: "Preview does not accept confirmation.",
    });
  }
}
const request = requestMetadata
  .extend({ package: historicalSeasonJsonSchema })
  .superRefine(requireImportConfirmation);

const count = z.number().int().nonnegative();
const previewResponse = z.strictObject({
  action: z.literal("preview"),
  previewToken: requestMetadata.shape.previewToken.unwrap(),
  counts: z.strictObject({
    teams: count,
    players: count,
    picks: count,
    results: count,
    incomplete: count,
    pools: count,
    maps: count,
  }),
  staff: count,
  fixtures: count,
  statistics: count,
  releaseEvidence: count,
  bracketMatches: count,
  changed: z.boolean(),
});
export type HistoricalSeasonPreview = z.output<typeof previewResponse>;
const importResponse = z.strictObject({
  action: z.literal("import"),
  revision: count,
  changed: z.boolean(),
});
export const historicalSeasonTransferRequest = requestMetadata
  .extend({ package: z.unknown().nonoptional() })
  .superRefine(requireImportConfirmation);

export const transferHistoricalSeasonWrite = {
  id: "transferHistoricalSeason",
  path: "/api/admin/tournaments/{edition}/archive-json",
  method: "POST",
  access: "browser",
  parameters: { edition: editionSlugSchema },
  maxBodyBytes: historicalSeasonJsonLimit,
  request,
  summary: "Preview or import a private historical season package",
  description:
    "Requires edition configure_tournament permission and a private completed target without registration or live data. Preview returns counts and a token bound to the file and target state. Import requires confirmation and the matching preview. Gzip is accepted up to 8 MiB compressed. Prior releases remain evidence and require local publication.",
  successStatus: 200,
  successDescription: "Preview counts or the committed revision.",
  response: z.discriminatedUnion("action", [previewResponse, importResponse]),
  errors: {
    400: "Invalid package, action, version, season, or reference.",
    401: "An active browser session is required.",
    403: "Origin, authentication channel, or edition permission rejected.",
    404: "The tournament was not found.",
    409: "Target state, revision, bracket, or statistics conflict.",
    413: "The JSON or compressed request exceeds its size limit.",
    415: "Expected JSON with identity or gzip encoding.",
    500: "Unexpected failure.",
    503: "Site origin configuration is unavailable or invalid.",
  },
  consumers: ["src/components/archive-importer.tsx"],
} as const satisfies WriteApiOperation;
