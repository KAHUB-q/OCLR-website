import { statisticsArchive, statisticsSource } from "./archive-statistics";
import { statisticsArchiveKey } from "../../src/lib/archive-statistics-key";

/** Synthetic large unselected histories plus unrelated fixtures; never provider data. */
export function archiveQueryFixture(gameCount = 80) {
  const archive = structuredClone(statisticsArchive);
  for (const [id, teamId] of [
    [91006, "alpha"],
    [91007, "alpha"],
    [91008, "beta"],
    [91009, "beta"],
  ] as const)
    archive.players.push({
      osuId: id,
      username: `Synthetic reserve ${id}`,
      teamId,
      role: "player",
      tier: null,
      source: "Synthetic roster",
    });
  archive.teams.push(
    { id: "gamma", name: "Synthetic Gamma", source: "Synthetic roster" },
    { id: "delta", name: "Synthetic Delta", source: "Synthetic roster" },
  );
  archive.players.push(
    ...statisticsArchive.players.map((p) => ({
      ...p,
      osuId: p.osuId + 1000,
      username: `Unrelated synthetic ${p.osuId}`,
      teamId: p.teamId === "alpha" ? "gamma" : "delta",
      tier: p.role === "captain" ? 0 : null,
    })),
  );
  archive.matches.push({
    ...archive.matches[0],
    id: "other",
    teamA: "gamma",
    teamB: "delta",
    score: [1, 0],
    mpUrls: ["https://osu.ppy.sh/community/matches/999178"],
  });
  const source = statisticsSource(),
    template = source.games[0];
  const ids = [91001, 91003, 91006, 91007, 91002, 91004, 91008, 91009];
  source.games = Array.from({ length: gameCount }, (_, i) => ({
    ...structuredClone(template),
    id: i + 1,
    beatmapId: 10001 + (i % 2),
    scores: ids
      .filter((uid) => !(i === 1 && uid === 91003))
      .map((uid, j) => ({
        ...structuredClone(template.scores[j % 4]),
        osuId: uid,
        slot: j,
        team:
          archive.players.find((p) => p.osuId === uid)!.teamId === "alpha"
            ? ("blue" as const)
            : ("red" as const),
        total:
          (archive.players.find((p) => p.osuId === uid)!.teamId === "alpha"
            ? 800000
            : 600000) -
          (ids.indexOf(uid) % 4) * 15000,
      })),
  }));
  const other = statisticsSource();
  other.match.id = 999178;
  other.fingerprint = "b".repeat(64);
  other.games = [
    {
      ...other.games[0],
      id: 1001,
      scores: other.games[0].scores.map((s) => ({
        ...s,
        osuId: s.osuId! + 1000,
      })),
    },
  ];
  const key = statisticsArchiveKey(archive);
  const rows = [source, other].map((value, i) => {
    const snapshot = {
      archiveKey: key,
      source: value,
      poolId: "final",
      included: i ? [1001] : [1, 2],
    };
    return {
      editionSlug: "s7",
      mpId: value.match.id,
      fixtureId: i ? "other" : "one",
      version: 3,
      draft: snapshot,
      published: snapshot,
      publishedAt: new Date(0),
    };
  });
  return { archive, rows };
}
