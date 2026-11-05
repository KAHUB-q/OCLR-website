import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { HttpError } from "../../src/lib/http";
import {
  assertArchiveOperatorEnvironment,
  archiveOperatorDiagnostic,
} from "../../scripts/archive-operator-diagnostics";

const secret =
  "postgresql://private_user:private_password@private_host/private_db";
const context = { phase: "apply" as const, slug: "s2" };
describe("safe historical operator diagnostics", () => {
  it("rejects missing configuration and remote mode before database access", () => {
    expect(() => assertArchiveOperatorEnvironment({})).toThrow(/DATABASE_URL/);
    expect(() =>
      assertArchiveOperatorEnvironment({ DATABASE_URL: "  " }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      assertArchiveOperatorEnvironment({
        DATABASE_URL: secret,
        OCLR_DATA_SOURCE: "remote",
      }),
    ).toThrow(/local database/);
    expect(() =>
      assertArchiveOperatorEnvironment({ DATABASE_URL: secret }),
    ).not.toThrow();
  });
  it.each(["42P01", "42501", "28P01", "ECONNREFUSED"])(
    "recognizes nested %s without exposing driver messages, SQL, params or credentials",
    (code) => {
      const error = new Error(`Failed query containing ${secret}`, {
        cause: Object.assign(new Error(`Rejected credential ${secret}`), {
          code,
          query: "SELECT private_answer",
          parameters: [secret],
        }),
      });
      const diagnostic = archiveOperatorDiagnostic(error, context);
      expect(diagnostic).toMatchObject({ ...context, code });
      expect(JSON.stringify(diagnostic)).not.toMatch(
        /private_user|private_password|private_host|private_db|private_answer|Failed query/,
      );
    },
  );
  it("handles aggregate connection errors and cyclic wrappers", () => {
    const nested = new AggregateError(
      [Object.assign(new Error(secret), { code: "ECONNREFUSED" })],
      secret,
    );
    expect(archiveOperatorDiagnostic(nested, context).code).toBe(
      "ECONNREFUSED",
    );
    const cyclic: { cause?: unknown; code: string } = { code: secret };
    cyclic.cause = cyclic;
    const result = archiveOperatorDiagnostic(cyclic, {
      phase: "discover",
      slug: secret,
    });
    expect(result.code).toBe("OPERATION_FAILED");
    expect(result).not.toHaveProperty("slug");
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("does not print unknown errors or unapproved HttpError messages", () => {
    const diagnostic = archiveOperatorDiagnostic(
      new HttpError(409, secret),
      context,
    );
    expect(diagnostic.code).toBe("OPERATION_FAILED");
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
    expect(
      archiveOperatorDiagnostic(
        new HttpError(
          409,
          "Historical relations are stale; run the reviewed apply first.",
        ),
        context,
      ).message,
    ).toBe("Historical relations are stale; run the reviewed apply first.");
  });
  it("identifies schema validation without logging source values or issue paths", () => {
    const result = z
      .object({ private_answer: z.number() })
      .safeParse({ private_answer: secret });
    if (result.success) throw new Error("Invalid synthetic fixture");
    const diagnostic = archiveOperatorDiagnostic(result.error, context);
    expect(diagnostic.code).toBe("DATA_VALIDATION");
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /private_answer|private_password/,
    );
  });
  it("returns a nonzero CLI exit with an environment diagnostic before discovering seasons", () => {
    const folder = mkdtempSync(
      join(tmpdir(), "oclr-operator-environment-test-"),
    );
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          createRequire(import.meta.url).resolve("tsx"),
          resolve("scripts/normalize-archives.ts"),
          "--dry-run",
        ],
        {
          cwd: folder,
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            DATABASE_URL: "",
            OCLR_DATA_SOURCE: "database",
            TSX_TSCONFIG_PATH: resolve("tsconfig.json"),
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      const diagnostic = JSON.parse(result.stderr.trim());
      expect(diagnostic).toMatchObject({
        code: "DATABASE_URL_MISSING",
        phase: "environment",
      });
      expect(diagnostic.message).toContain("/etc/oclr/runtime.env");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
