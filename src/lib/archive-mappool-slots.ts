import type { HistoricalArchive } from "./historical-archive";

/** Organizer correction: S2 GS never had DT5 or TB1 (#850).
 * Keep raw evidence intact (including the statistics fingerprint); apply the
 * same projection to old saves, import previews, counts and regenerated data. */
export function archiveMappoolMaps(
  pool: Pick<HistoricalArchive["pools"][number], "id" | "maps">,
  editionSlug: string,
) {
  return editionSlug === "s2" && pool.id === "gs"
    ? pool.maps.filter((map) => !["DT5", "TB1"].includes(map.slot))
    : pool.maps;
}
