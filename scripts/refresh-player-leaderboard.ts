import env from "@next/env";
import { closeDb } from "../src/db";
import { refreshPlayerLeaderboard } from "../src/lib/player-leaderboard-worker";
import {
  assertArchiveOperatorEnvironment,
  archiveOperatorDiagnostic,
} from "./archive-operator-diagnostics";

env.loadEnvConfig(process.cwd());
let phase: "arguments" | "environment" | "apply" | "preview" = "arguments";
try {
  const args = process.argv.slice(2);
  if (
    args.some((a) => !["--dry-run", "--apply", "--rebuild"].includes(a)) ||
    (args.includes("--dry-run") && args.includes("--apply")) ||
    (args.includes("--rebuild") && !args.includes("--apply"))
  )
    throw new Error("ARGUMENTS");
  phase = "environment";
  assertArchiveOperatorEnvironment();
  phase = args.includes("--apply") ? "apply" : "preview";
  console.log(
    JSON.stringify(
      await refreshPlayerLeaderboard(
        args.includes("--apply"),
        args.includes("--rebuild"),
      ),
    ),
  );
} catch (error) {
  // Never print driver messages, SQL/parameters, URLs or raw source data.
  const diagnostic = archiveOperatorDiagnostic(error, { phase });
  const code = diagnostic.code;
  if (phase === "arguments")
    console.error("Use --dry-run or --apply [--rebuild].");
  else if (["DATABASE_URL_MISSING", "LOCAL_DATABASE_REQUIRED"].includes(code))
    console.error(
      `Player leaderboard calculation: ${code}. Load the approved exported operator environment.`,
    );
  else
    console.error(
      `Player leaderboard calculation failed [${code}] during ${phase}: ${diagnostic.message}`,
    );
  process.exitCode = 1;
} finally {
  await closeDb();
}
