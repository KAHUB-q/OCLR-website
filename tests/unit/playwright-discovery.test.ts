import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Vitest's resolver can accept imports that Playwright's Node ESM loader rejects.
// Listing real specs exercises that loader without a server, database or browser.
it.each(["playwright.core.config.ts", "playwright.remote-core.config.ts"])(
  "%s discovers tests with the native Playwright loader",
  (config) => {
    const directory = mkdtempSync(join(tmpdir(), "oclr-discovery-test-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          config,
          "--list",
        ],
        {
          cwd: fileURLToPath(new URL("../../", import.meta.url)),
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            DATABASE_URL: "",
            TEST_DATABASE_URL: "postgresql://127.0.0.1:1/oclr_discovery_test",
            OCLR_MEDIA_DIR: directory,
            OCLR_TEST_BRACKETS_FILE: join(directory, "brackets.json"),
            OCLR_TEST_NO_DB_ATTEMPTS: join(directory, "db-attempts.log"),
          },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toMatch(/Total: [1-9]\d* tests in [1-9]\d* files/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
