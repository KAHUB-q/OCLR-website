import { closeDb } from "../src/db";
import { refreshOtrRatings } from "../src/lib/otr-rating-worker";
import {
  archiveOperatorDiagnostic,
  assertArchiveOperatorEnvironment,
} from "./archive-operator-diagnostics";

let phase: "arguments" | "environment" | "preview" | "apply" = "arguments";
try {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args[0] && !["--dry-run", "--apply"].includes(args[0]))
  )
    throw new Error("Invalid arguments.");
  phase = "environment";
  assertArchiveOperatorEnvironment();
  const apply = args[0] === "--apply";
  phase = apply ? "apply" : "preview";
  const result = await refreshOtrRatings(apply);
  console.log(JSON.stringify(result));
  if (result.failed) process.exitCode = 1;
} catch (error) {
  if (phase === "arguments") console.error("Use --dry-run or --apply.");
  else {
    const { code } = archiveOperatorDiagnostic(error, { phase });
    console.error(`o!TR refresh failed [${code}] during ${phase}.`);
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
