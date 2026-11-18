import type { StatisticsPlay } from "./archive-statistics-model";
import type { ArchiveStatisticsSummary } from "./competition-detail-read-contracts";
import type { SeasonSeries, SeriesGame } from "./season-series-model";
import { ratingGameTotals } from "./yumu-rating";

/** Resolve identity and conflicts edition-wide, before the user can select a scope. */
export function seasonSeriesBuilder(
  fixtures: SeasonSeries["fixtures"],
  names: ReadonlyMap<number, string>,
  teams: ReadonlyMap<string, string>,
) {
  const games = new Map<number, SeriesGame>();
  const excluded = new Set<number>();
  const partial = new Set<string>();
  function exclude(fixtureId: string, gameId: number) {
    partial.add(fixtureId);
    const previous = games.get(gameId);
    if (previous) partial.add(previous.fixtureId);
    games.delete(gameId);
    excluded.add(gameId);
  }
  function add(raw: SeriesGame) {
    const { fixtureId, gameId, beatmapId, slot, winnerTeamId } = raw;
    if (
      excluded.has(gameId) ||
      raw.teamIds.some((id) => !id || !teams.has(id)) ||
      (beatmapId !== null &&
        (!Number.isSafeInteger(beatmapId) || beatmapId <= 0))
    )
      return exclude(fixtureId, gameId);
    const observed = new Map<number, SeriesGame["scores"][number]>();
    for (const { userId, teamId, total } of raw.scores) {
      const prior = observed.get(userId);
      if (
        !names.has(userId) ||
        (prior && (prior.teamId !== teamId || prior.total !== total))
      )
        return exclude(fixtureId, gameId);
      if (!prior) observed.set(userId, { userId, teamId, total });
    }
    // Construct the wire facts explicitly: no review evidence, source payload or private labels.
    const game = {
      fixtureId,
      gameId,
      beatmapId,
      slot,
      winnerTeamId,
      teamIds: [...raw.teamIds].sort(),
      scores: [...observed.values()].sort((a, b) => a.userId - b.userId),
    };
    const previous = games.get(gameId);
    if (
      typeof ratingGameTotals(game) === "string" ||
      (previous && JSON.stringify(previous) !== JSON.stringify(game))
    )
      return exclude(fixtureId, gameId);
    if (!previous) games.set(gameId, game);
  }
  function finish(): SeasonSeries {
    const accepted = [...games.values()].sort((a, b) => a.gameId - b.gameId);
    const rated = new Set(accepted.map((g) => g.fixtureId));
    const userIds = new Set(
      accepted.flatMap((g) => g.scores.map((s) => s.userId)),
    );
    const teamIds = new Set(accepted.flatMap((g) => g.teamIds));
    return {
      fixtures: fixtures.map((f) => ({
        ...f,
        complete: f.complete && rated.has(f.id) && !partial.has(f.id),
      })),
      games: accepted,
      players: [...userIds]
        .sort((a, b) => a - b)
        .map((userId) => ({ userId, username: names.get(userId)! })),
      teams: [...teamIds].sort().map((id) => ({ id, name: teams.get(id)! })),
    };
  }
  return { add, exclude, finish };
}

type ArchiveSeriesInput = {
  fixtures: Pick<
    ArchiveStatisticsSummary["fixtures"][number],
    "id" | "stage" | "covered"
  >[];
  poolFixtures?: { id: string; teamIds?: string[] }[];
  teams: ArchiveStatisticsSummary["teams"];
  players: Pick<
    ArchiveStatisticsSummary["players"][number],
    "osuId" | "username"
  >[];
  plays: Pick<
    StatisticsPlay,
    | "fixtureId"
    | "mpId"
    | "gameId"
    | "stage"
    | "beatmapId"
    | "slot"
    | "osuId"
    | "teamId"
    | "winnerTeamId"
    | "score"
  >[];
};

/** Consumes one public release, regardless of relational or snapshot storage. */
export function archiveSeasonSeries(data: ArchiveSeriesInput): SeasonSeries {
  const series = seasonSeriesBuilder(
    data.fixtures.map((f) => ({
      id: f.id,
      roundId: f.stage,
      roundName: f.stage,
      complete: f.covered,
    })),
    new Map(data.players.map((p) => [p.osuId, p.username])),
    new Map(data.teams.map((t) => [t.id, t.name])),
  );
  const released = new Map(
    data.fixtures.filter((f) => f.covered).map((f) => [f.id, f]),
  );
  const observedSides = new Map<string, Set<string>>();
  const fixtureSides = new Map(
    data.poolFixtures?.map((f) => [f.id, f.teamIds]),
  );
  const copies = new Map<string, ArchiveSeriesInput["plays"]>();
  for (const p of data.plays) {
    if (!released.has(p.fixtureId)) continue;
    const sides = observedSides.get(p.fixtureId) ?? new Set<string>();
    sides.add(p.teamId);
    observedSides.set(p.fixtureId, sides);
    // Compare complete copies from different MPs; never union two different lineups.
    const key = JSON.stringify([p.fixtureId, p.mpId, p.gameId]);
    const rows = copies.get(key);
    if (rows) rows.push(p);
    else copies.set(key, [p]);
  }
  for (const rows of copies.values()) {
    const first = rows[0];
    const { fixtureId, gameId, slot, beatmapId } = first;
    const fixture = released.get(fixtureId)!;
    if (
      rows.some(
        (p) =>
          p.stage !== fixture.stage ||
          p.slot !== slot ||
          p.beatmapId !== beatmapId ||
          p.winnerTeamId !== first.winnerTeamId,
      )
    ) {
      series.exclude(fixtureId, gameId);
      continue;
    }
    series.add({
      fixtureId,
      gameId,
      slot,
      beatmapId,
      // Older released summaries: only an unambiguous pair observed in this fixture suffices.
      teamIds: fixtureSides.get(fixtureId) ?? [
        ...observedSides.get(fixtureId)!,
      ],
      winnerTeamId: first.winnerTeamId ?? null,
      scores: rows.map((p) => ({
        userId: p.osuId,
        teamId: p.teamId,
        total: p.score,
      })),
    });
  }
  return series.finish();
}
