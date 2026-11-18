import type { ExplicitReadData } from "./explicit-read-contracts";
import { eventMapKey } from "./event-statistics-model";
import { calculateRating } from "./yumu-rating";

export type SeasonSeries = NonNullable<ExplicitReadData<"publicSeasonSeries">>;
export type SeriesGame = SeasonSeries["games"][number];

function mapKey(game: SeriesGame, round: string) {
  if (!game.slot && game.beatmapId === null) return "";
  return eventMapKey({
    round,
    slot: game.slot ?? "—",
    mapId: game.beatmapId,
    title: "",
  });
}

export function seasonSeriesOptions(series: SeasonSeries | null) {
  const rounds = new Map<string, string>();
  const fixtures = new Map((series?.fixtures ?? []).map((f) => [f.id, f]));
  for (const f of fixtures.values()) rounds.set(f.roundId, f.roundName);
  const maps = new Map<
    string,
    { value: string; label: string; round: string }
  >();
  for (const g of series?.games ?? []) {
    const f = fixtures.get(g.fixtureId);
    if (!f) continue;
    const value = mapKey(g, f.roundId);
    if (value && !maps.has(value))
      maps.set(value, {
        value,
        label: [f.roundName, g.slot ?? "—", g.beatmapId]
          .filter((v) => v !== null)
          .join(" · "),
        round: f.roundId,
      });
  }
  return {
    rounds: [...rounds].map(([value, label]) => ({ value, label })),
    teams: (series?.teams ?? []).map((t) => ({ value: t.id, label: t.name })),
    maps: [...maps.values()],
  };
}

/** Round and map select whole games, never individual score rows. */
export function rateSeasonSeries(
  series: SeasonSeries | null,
  round = "",
  slot = "",
) {
  const fixtures = new Map(
    (series?.fixtures ?? [])
      .filter((f) => !round || f.roundId === round)
      .map((f) => [f.id, f]),
  );
  const games = (series?.games ?? []).filter((g) => {
    const f = fixtures.get(g.fixtureId);
    return f && (!slot || mapKey(g, f.roundId) === slot);
  });
  const report = calculateRating(games);
  const names = new Map(
    (series?.players ?? []).map((p) => [p.userId, p.username]),
  );
  const teams = new Map((series?.teams ?? []).map((t) => [t.id, t.name]));
  const appearances = new Map<number, Set<string>>();
  for (const g of games) {
    for (const s of g.scores) {
      const sides = appearances.get(s.userId) ?? new Set<string>();
      sides.add(s.teamId);
      appearances.set(s.userId, sides);
    }
  }
  return {
    publicFixtures: fixtures.size,
    fullyRated: [...fixtures.values()].filter((f) => f.complete).length,
    gameCount: report.gameCount,
    scoreCount: report.scoreCount,
    players: report.players.map((p) => {
      const teamIds = [...appearances.get(p.userId)!].sort();
      return {
        ...p,
        username: names.get(p.userId)!,
        teamIds,
        team: teamIds.map((id) => teams.get(id)!).join(" / "),
      };
    }),
  };
}

export function visibleSeriesPlayers(
  players: ReturnType<typeof rateSeasonSeries>["players"],
  team: string,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  return players.filter(
    (p) =>
      (!team || p.teamIds.includes(team)) &&
      (p.username.toLowerCase().includes(needle) ||
        String(p.userId).includes(needle)),
  );
}
