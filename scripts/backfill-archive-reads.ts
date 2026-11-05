import { HttpError } from "../src/lib/http";
import env from "@next/env";
import { closeDb, db } from "../src/db";
import { editionState } from "../src/db/schema";
import { isNotNull } from "drizzle-orm";
import { backfillArchiveReads } from "../src/lib/archive-read";

env.loadEnvConfig(process.cwd());
try {
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        a.startsWith("--") &&
        a !== "--apply" &&
        a !== "--dry-run" &&
        a !== "--rebuild",
    ) ||
    (args.includes("--apply") && args.includes("--dry-run"))
  )
    throw new HttpError(
      400,
      "Use [slugs...] [--dry-run] or [slugs...] --apply.",
    );
  const selected = args.filter((a) => !a.startsWith("--"));
  if (selected.some((s) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(s)))
    throw new HttpError(400, "Invalid edition slug.");
  const slugs = selected.length
    ? selected
    : (
        await db()
          .select()
          .from(editionState)
          .where(isNotNull(editionState.configuration))
      )
        .filter((s) => s.configuration?.archive)
        .map((s) => s.slug);
  for (const slug of slugs)
    console.log(
      JSON.stringify(
        await backfillArchiveReads(
          slug,
          args.includes("--apply"),
          args.includes("--rebuild"),
        ),
      ),
    );
} catch (error) {
  console.error(
    error instanceof HttpError
      ? error.message
      : "Archive backfill failed; check the configured database and reviewed operation.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
