/** Operator-run public metadata preparation; no DB or tournament writes.
 * Export approved OSU_CLIENT_ID/OSU_CLIENT_SECRET; they are never printed.
 * Commit the generated public catalog after review. Never runs during a read. */
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  fetchBeatmap,
  prepareDifficultySnapshot,
} from "../src/lib/osu-beatmaps";
import { difficultySnapshotSchema } from "../src/lib/difficulty-snapshot";
import {
  difficultyConfigurations,
  type DifficultyConfiguration,
  type DifficultySnapshot,
} from "../src/lib/mappool-model";

export async function prepareCatalog(
  ids: number[],
  configurations: DifficultyConfiguration[],
  output: string,
) {
  const catalog: { version: 1; maps: Record<string, DifficultySnapshot> } = {
    version: 1,
    maps: {},
  };
  try {
    const existing = JSON.parse(await readFile(output, "utf8"));
    if (
      existing.version !== 1 ||
      !existing.maps ||
      typeof existing.maps !== "object" ||
      Array.isArray(existing.maps)
    )
      throw new Error("Invalid catalog format.");
    for (const [id, row] of Object.entries(existing.maps ?? {})) {
      const parsed = difficultySnapshotSchema.parse(row);
      if (String(parsed.beatmapId) !== id)
        throw new Error("Catalog identity mismatch.");
      catalog.maps[id] = parsed;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const failures: number[] = [];
  for (const id of [...new Set(ids)]) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("Invalid beatmap ID.");
    let prepared: DifficultySnapshot;
    try {
      const snapshot = await prepareDifficultySnapshot(
        await fetchBeatmap(id),
        configurations,
      );
      prepared = difficultySnapshotSchema.parse(snapshot);
    } catch {
      failures.push(id);
      // Keep the old complete snapshot and its original timestamp on failure.
      console.error(
        `Could not prepare BID ${id}; existing snapshot preserved.`,
      );
      continue;
    }
    const maps = { ...catalog.maps, [id]: prepared };
    const temporary = `${output}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ version: 1, maps }, null, 2)}\n`,
    );
    await rename(temporary, output);
    catalog.maps = maps;
    console.log(`Prepared official difficulty previews for BID ${id}.`);
  }
  return failures;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const ids = (value("--ids") ?? "").split(",").filter(Boolean).map(Number);
  if (args.includes("--archives")) {
    for (const file of await readdir("docs/imports")) {
      if (!/^s\d+(?:-confirmed)?-archive\.json$/.test(file)) continue;
      const archive = JSON.parse(
        await readFile(`docs/imports/${file}`, "utf8"),
      );
      for (const pool of archive.pools ?? [])
        for (const map of pool.maps ?? [])
          if (map.beatmapId) ids.push(map.beatmapId);
    }
  }
  const configs = (value("--mods") ?? "HD,HR,DT,EZ").split(",");
  if (
    !ids.length ||
    configs.some(
      (c) => !difficultyConfigurations.includes(c as DifficultyConfiguration),
    )
  )
    throw new Error(
      "Use --ids BID,... or --archives, and supported --mods HD,HR,DT,EZ,...",
    );
  const failed = await prepareCatalog(
    ids,
    configs as DifficultyConfiguration[],
    resolve(
      value("--output") ??
        process.env.OCLR_DIFFICULTY_CATALOG_FILE ??
        "src/data/difficulty-previews.json",
    ),
  );
  if (failed.length) process.exitCode = 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error(
      "Difficulty preparation failed. Check inputs and approved provider configuration.",
    );
    process.exitCode = 1;
  });
}
