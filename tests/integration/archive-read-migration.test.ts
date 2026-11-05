import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertTestDatabase } from "../database";
import {
  statisticsArchive,
  statisticsSource,
} from "../fixtures/archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";
const base = process.env.TEST_DATABASE_URL;
describe.skipIf(!base)(
  "historical relational migration and immutable JSONB history",
  () => {
    it("preserves saved data on upgrade and retains edits/withdrawal transactionally", async () => {
      assertTestDatabase(base);
      const name = `oclr_archive_migration_${randomUUID().replaceAll("-", "")}_test`;
      const admin = new Pool({ connectionString: base });
      const url = new URL(base);
      url.pathname = `/${name}`;
      const folder = mkdtempSync(
        join(tmpdir(), "oclr-archive-migration-test-"),
      );
      let pool: Pool | undefined;
      try {
        await admin.query(
          `CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`,
        );
        pool = new Pool({ connectionString: url.toString() });
        cpSync("drizzle", folder, { recursive: true });
        const file = join(folder, "meta/_journal.json"),
          journal = JSON.parse(readFileSync(file, "utf8"));
        journal.entries = journal.entries.filter(
          (e: { idx: number }) => e.idx < 77,
        );
        writeFileSync(file, JSON.stringify(journal));
        await migrate(drizzle(pool), { migrationsFolder: folder });
        await pool.query(
          "INSERT INTO edition_state(slug,configuration) VALUES ('s7',$1)",
          [JSON.stringify({ archive: statisticsArchive })],
        );
        const snapshot = {
          archiveKey: statisticsArchiveKey(statisticsArchive),
          source: statisticsSource(),
          poolId: "final",
          included: [1, 2],
        };
        await pool.query(
          "INSERT INTO historical_statistics(edition_slug,mp_id,fixture_id,version,draft,published,published_at) VALUES ('s7',999177,'one',3,$1,$1,'2026-01-01T00:00:00Z')",
          [JSON.stringify(snapshot)],
        );
        const saved = (await pool.query("SELECT * FROM historical_statistics"))
          .rows;
        await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
        await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
        expect(
          (await pool.query("SELECT * FROM historical_statistics")).rows,
        ).toEqual(saved);
        const initial = (
          await pool.query("SELECT * FROM historical_statistics_revisions")
        ).rows;
        expect(initial).toHaveLength(1);
        expect(initial[0].draft).toEqual(saved[0].draft);
        expect(initial[0].published).toEqual(saved[0].published);
        await pool.query("BEGIN");
        await pool.query(
          "UPDATE historical_statistics SET version=4,published=NULL,published_at=NULL",
        );
        await pool.query("ROLLBACK");
        expect(
          (await pool.query("SELECT * FROM historical_statistics_revisions"))
            .rows,
        ).toEqual(initial);
        await pool.query(
          "UPDATE historical_statistics SET version=4,published=NULL,published_at=NULL",
        );
        const retained = (
          await pool.query(
            "SELECT * FROM historical_statistics_revisions ORDER BY version",
          )
        ).rows;
        expect(retained).toHaveLength(2);
        expect(retained[0].published).toEqual(snapshot);
        expect(retained[1].published).toBeNull();
        await expect(
          pool.query("DELETE FROM historical_statistics_revisions"),
        ).rejects.toMatchObject({ code: "55000" });
        await expect(
          pool.query(
            "UPDATE historical_statistics_revisions SET fixture_id='changed'",
          ),
        ).rejects.toMatchObject({ code: "55000" });
        await pool.query("DELETE FROM historical_statistics");
        expect(
          (await pool.query("SELECT * FROM historical_statistics_revisions"))
            .rows,
        ).toHaveLength(2);
      } finally {
        await pool?.end();
        await admin.query(`DROP DATABASE IF EXISTS ${name}`);
        await admin.end();
        rmSync(folder, { recursive: true, force: true });
      }
    });
  },
);
