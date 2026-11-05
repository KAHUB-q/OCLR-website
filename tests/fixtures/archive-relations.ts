import { statisticsArchive } from "./archive-statistics";
import { historicalArchiveSchema } from "../../src/lib/historical-archive";

/** Synthetic coverage of source-only collections, never real registrations or provider data. */
export function completeArchive(slug = "s7") {
  const archive = structuredClone(statisticsArchive);
  return historicalArchiveSchema.parse({
    ...archive,
    editionSlug: slug,
    formatVersion: 2,
    season: {
      startsAt: "2020-01-01T00:00:00+08:00",
      endsAt: null,
      timeZone: "Asia/Taipei",
      precision: "day",
    },
    finalPlacements: [
      {
        teamId: "alpha",
        placement: { start: 1, end: 2 },
        tied: true,
        official: false,
        scope: "final",
        source: "Synthetic placement",
      },
    ],
    unresolvedPlayers: [
      {
        id: "unknown",
        username: "Synthetic unresolved",
        teamId: "alpha",
        role: "player",
        tier: null,
        sourceRole: "VICE",
        source: "Synthetic evidence",
      },
    ],
    rosterReplacements: [
      {
        id: "replacement",
        teamId: "alpha",
        tier: null,
        replacedAt: null,
        note: "Unknown replacement order",
        source: "Synthetic replacement",
        people: [
          { osuId: null, username: "Unknown reserve", source: "Synthetic" },
          { osuId: 91999, username: "Known reserve", source: "Synthetic" },
        ],
      },
    ],
    qualifiers: [
      {
        name: "Synthetic qualifier",
        poolId: "final",
        source: "Synthetic",
        records: [
          {
            username: "Historical Player",
            source: "Synthetic",
            scores: [{ slot: archive.pools[0].maps[0].slot, score: 0 }],
          },
        ],
      },
    ],
    reviewTables: [
      {
        name: "Synthetic working table",
        note: "Not an official standing",
        rows: [
          { teamId: "alpha", wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 },
        ],
      },
    ],
    sourceFacts: [
      {
        category: "provenance",
        label: "Synthetic private evidence",
        text: "Not part of the public archive",
        source: "Synthetic",
      },
    ],
    pools: archive.pools.map((pool, i) =>
      i
        ? pool
        : {
            ...pool,
            maps: pool.maps.map((map, j) =>
              j
                ? map
                : {
                    ...map,
                    originalId: 99999,
                    difficultySnapshot: {
                      beatmapId: map.beatmapId!,
                      ruleset: "osu",
                      checksum: null,
                      fetchedAt: "2026-11-05T00:00:00Z",
                      base: {
                        stars: null,
                        bpm: 180,
                        duration: 0,
                        ar: 9,
                        od: 8,
                        cs: 4,
                        hp: null,
                      },
                      variants: {
                        NM: {
                          configuration: "NM",
                          mods: [],
                          ruleset: "osu",
                          stars: 0,
                          maxCombo: null,
                          values: { aim: 0, speed: 1.25 },
                          fetchedAt: "2026-11-05T00:00:00Z",
                        },
                      },
                    },
                  },
            ),
          },
    ),
    matches: archive.matches.map((m, i) =>
      i
        ? m
        : {
            ...m,
            round: { phase: "final", index: 1 },
            format: { maxGames: 8, winsRequired: 5 },
            timeZone: "Asia/Taipei",
            roomOpenedAt: "2020-01-01T00:00:00+08:00",
            adjudication: {
              kind: "technical",
              note: "Synthetic evidence",
              evidenceUrl: "https://example.com/evidence",
            },
            review: {
              status: "approved",
              approval: {
                approvedOn: "2020-01-02",
                source: "Synthetic approval",
              },
              workingScore: m.score,
              rawScore: [1, 1],
              possibleScore: null,
              note: "Synthetic review",
              startedAt: null,
              redTeamId: "beta",
              blueTeamId: "alpha",
              games: [
                {
                  gameId: 1,
                  beatmapId: 10001,
                  poolSlot: null,
                  startTime: "2020-01-01T00:00:00Z",
                  endTime: null,
                  disposition: "aborted-no-result",
                  totals: { red: 0, blue: 0 },
                  positivePlayers: { red: 0, blue: 0 },
                  teamFail: { red: false, blue: true },
                  winningColor: null,
                  interpretationStatus: "pending-confirmation",
                },
              ],
            },
          },
    ),
  });
}
