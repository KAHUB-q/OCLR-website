import type { HistoricalArchive } from "../../src/lib/historical-archive";

/** Public map IDs with synthetic copy, modeling saved data from before the supplement. */
export const legacyS5Mappool: HistoricalArchive["pools"][number] = {
  id: "pool-2",
  name: "Synthetic legacy S5 pool",
  source: "Synthetic browser fixture",
  maps: [
    { slot: "DT2", beatmapId: 2567502 },
    { slot: "DT4", beatmapId: 2720295 },
  ].map((map) => ({
    ...map,
    title: `Synthetic legacy ${map.slot}`,
    mapper: null,
    stars: null,
    bpm: null,
    drainSeconds: null,
    cs: null,
    ar: null,
    od: null,
    source: "Synthetic browser fixture",
  })),
};
