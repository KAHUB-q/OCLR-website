import env from "@next/env";
import { closeDb, db } from "../src/db";
import { editionState } from "../src/db/schema";
import { isNotNull } from "drizzle-orm";
import {
  backfillArchiveRelations,
  verifyArchiveRelations,
} from "../src/lib/archive-relations";
import { HttpError } from "../src/lib/http";

env.loadEnvConfig(process.cwd());
try {
  const args = process.argv.slice(2),
    allowed = ["--dry-run", "--apply", "--rebuild", "--verify"];
  if (
    args.some((a) => a.startsWith("--") && !allowed.includes(a)) ||
    (args.includes("--apply") && args.includes("--dry-run")) ||
    (args.includes("--rebuild") && !args.includes("--apply"))
  )
    throw new HttpError(
      400,
      "Use [slugs...] [--dry-run | --apply [--rebuild]] [--verify].",
    );
  const selected = args.filter((a) => !a.startsWith("--"));
  if (selected.some((s) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)))
    throw new HttpError(400, "Invalid edition slug.");
  const slugs = selected.length
    ? [...new Set(selected)]
    : (
        await db()
          .select()
          .from(editionState)
          .where(isNotNull(editionState.configuration))
      )
        .filter((s) => s.configuration?.archive)
        .map((s) => s.slug)
        .sort();
  const totals = { seasons: slugs.length, documents: 0, stale: 0, created: 0 };
  for (const slug of slugs) {
    const result = await backfillArchiveRelations(
      slug,
      args.includes("--apply"),
      args.includes("--rebuild"),
    );
    const verified = args.includes("--verify")
      ? await db().transaction((tx) => verifyArchiveRelations(tx, slug), {
          isolationLevel: "repeatable read",
          accessMode: "read only",
        })
      : undefined;
    totals.documents += result.documents;
    totals.stale += result.stale;
    totals.created += result.created;
    console.log(
      JSON.stringify({ ...result, ...(verified ? { verified } : {}) }),
    );
  }
  console.log(JSON.stringify({ total: totals }));
} catch (error) {
  console.error(
    error instanceof HttpError
      ? error.message
      : "Historical normalization failed; check the reviewed schema and configured database.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
