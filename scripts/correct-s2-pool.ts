import env from "@next/env";
import { closeDb } from "../src/db";
import { correctS2PoolData } from "../src/lib/archive-pool-correction";

env.loadEnvConfig(process.cwd());
try {
  const args = process.argv.slice(2);
  if (
    args.some(
      (a) =>
        a !== "--apply" &&
        a !== "--dry-run" &&
        !/^--expected-revision=\d+$/.test(a),
    ) ||
    (args.includes("--apply") && args.includes("--dry-run"))
  )
    throw new Error("Use [--dry-run] or --apply --expected-revision=N.");
  const revision = args
    .find((a) => a.startsWith("--expected-revision="))
    ?.split("=")[1];
  console.log(
    JSON.stringify(
      await correctS2PoolData({
        apply: args.includes("--apply"),
        expectedRevision: revision === undefined ? undefined : Number(revision),
      }),
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "S2 correction failed.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
