import type { HistoricalArchive } from "./historical-archive";

/** Write-time correction authorized by the organizer (#899). Never call on reads. */
export function correctS2PoolArchive<
  T extends Pick<HistoricalArchive, "editionSlug" | "pools">,
>(archive: T): T {
  if (
    archive.editionSlug !== "s2" ||
    !archive.pools.some(
      (p) =>
        p.id === "gs" &&
        p.maps.some((m) => m.slot === "DT5" || m.slot === "TB1"),
    )
  )
    return archive;
  return {
    ...archive,
    pools: archive.pools.map((pool) =>
      pool.id === "gs"
        ? {
            ...pool,
            maps: pool.maps.filter(
              (map) => map.slot !== "DT5" && map.slot !== "TB1",
            ),
          }
        : pool,
    ),
  };
}
