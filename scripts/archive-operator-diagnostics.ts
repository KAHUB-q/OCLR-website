import { ZodError } from "zod";
import { HttpError } from "../src/lib/http";

const messages = {
  DATABASE_URL_MISSING:
    "DATABASE_URL is not configured. On the managed host, run as oclr and export /etc/oclr/runtime.env before running this command. The CLI does not load the systemd EnvironmentFile.",
  LOCAL_DATABASE_REQUIRED:
    "Historical operator commands require the local database adapter; check OCLR_DATA_SOURCE privately.",
  "42P01":
    "A required database table is missing. Check the deployed release and apply its reviewed migrations through the normal deployment workflow.",
  "42703":
    "A required database column is missing. Check the deployed release and its applied migrations.",
  "42501":
    "The configured database role lacks a required privilege. Ask the database operator to review the approved runtime grants.",
  "28P01":
    "Database authentication failed. Check the configured credentials privately.",
  "28000":
    "Database access was rejected. Check authentication and source-host access rules privately.",
  "3D000":
    "The configured database does not exist. Check the intended target privately; do not create a replacement database.",
  "40001":
    "A concurrent transaction changed the source. Run dry-run again before retrying the operation.",
  "40P01":
    "A database transaction conflicted with another operation. Run dry-run again before retrying.",
  "57014":
    "The database cancelled the operation or its statement timed out. Review the operator session and database limits.",
  "23503":
    "A source relationship failed validation. Review the affected season and applied schema; do not bypass the constraint.",
  "23505":
    "A uniqueness constraint rejected the operation. Review concurrent work and the affected season.",
  "55000":
    "An immutable history constraint rejected a write. Keep the existing evidence and review the operation.",
  ECONNREFUSED:
    "The database connection was refused. Check the configured host, port and listener privately.",
  ECONNRESET:
    "The database connection was interrupted. Check connectivity before retrying.",
  ETIMEDOUT:
    "The database connection timed out. Check the configured network and listener privately.",
  ENOTFOUND:
    "The configured database host could not be resolved. Check its DNS name privately.",
  EAI_AGAIN:
    "Database host resolution temporarily failed. Check DNS before retrying.",
  DATA_VALIDATION:
    "Saved historical data failed schema validation. The original JSONB is retained; review the affected season without posting source data or credentials.",
  OPERATION_FAILED:
    "Historical normalization failed. Check the release, configuration, database and affected season privately; source JSONB is retained.",
} as const;
type DiagnosticCode = keyof typeof messages;
class ConfigurationError extends Error {
  constructor(
    readonly code: "DATABASE_URL_MISSING" | "LOCAL_DATABASE_REQUIRED",
  ) {
    super(messages[code]);
  }
}

export function assertArchiveOperatorEnvironment(
  environment: Readonly<{
    DATABASE_URL?: string;
    OCLR_DATA_SOURCE?: string;
  }> = {
    DATABASE_URL: process.env.DATABASE_URL,
    OCLR_DATA_SOURCE: process.env.OCLR_DATA_SOURCE,
  },
) {
  if (environment.OCLR_DATA_SOURCE === "remote")
    throw new ConfigurationError("LOCAL_DATABASE_REQUIRED");
  if (!environment.DATABASE_URL?.trim())
    throw new ConfigurationError("DATABASE_URL_MISSING");
}

const safeMessages = new Set([
  "Background calculation requires an operator database.",
  "Historical source metadata is incomplete; run the reviewed normalization first.",
  "Use [slugs...] [--dry-run | --apply [--rebuild]] [--verify].",
  "Invalid edition slug.",
  "Saved historical archive is required.",
  "Historical relations are stale; run the reviewed apply first.",
  "Historical relational verification failed; source JSONB was preserved.",
]);
export type ArchiveOperatorPhase =
  "arguments" | "environment" | "discover" | "preview" | "apply" | "verify";

/** Emit allowlisted codes/messages only: driver errors may contain SQL, URLs and source values. */
export function archiveOperatorDiagnostic(
  error: unknown,
  context: { phase: ArchiveOperatorPhase; slug?: string },
) {
  let code: DiagnosticCode = "OPERATION_FAILED";
  const queue: unknown[] = [error],
    seen = new Set<unknown>();
  while (queue.length && seen.size < 12) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    // A nested AggregateError/cause is common for pg and Drizzle connection errors.
    try {
      if (value instanceof ZodError) {
        code = "DATA_VALIDATION";
        break;
      }
      const candidate = "code" in value ? value.code : undefined;
      if (typeof candidate === "string" && Object.hasOwn(messages, candidate)) {
        code = candidate as DiagnosticCode;
        break;
      }
      if ("cause" in value) queue.push(value.cause);
      if ("errors" in value && Array.isArray(value.errors))
        queue.push(...value.errors.slice(0, 8));
    } catch {
      /* Do not invoke or print untrusted error accessors further. */
    }
  }
  let approvedMessage: string | undefined;
  if (code === "OPERATION_FAILED") {
    try {
      const candidate = error instanceof HttpError ? error.message : undefined;
      if (typeof candidate === "string" && safeMessages.has(candidate))
        approvedMessage = candidate;
    } catch {
      /* Hostile accessors/proxies must remain a generic diagnostic. */
    }
  }
  const slug =
    context.slug && /^[a-z0-9][a-z0-9-]{0,79}$/.test(context.slug)
      ? context.slug
      : undefined;
  return {
    error: "historical_normalization_failed",
    code,
    phase: context.phase,
    ...(slug ? { slug } : {}),
    message: approvedMessage ?? messages[code],
  };
}
