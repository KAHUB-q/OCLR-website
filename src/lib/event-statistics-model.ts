import type { EventScore } from "./event-statistics";

// A slot is only meaningful within its round and beatmap identity. Preview
// maps without numeric IDs retain their literal title as the identity fallback.
export type EventMapIdentity = Pick<
  EventScore,
  "round" | "slot" | "mapId" | "title"
>;
export function eventMapKey(score: EventMapIdentity) {
  return JSON.stringify([score.round, score.slot, score.mapId ?? score.title]);
}

export function groupEventMaps(scores: EventScore[]) {
  const maps = new Map<
    string,
    { key: string; label: string; plays: EventScore[] }
  >();
  for (const score of scores) {
    const key = eventMapKey(score);
    const map = maps.get(key);
    if (map) map.plays.push(score);
    else
      maps.set(key, {
        key,
        label: `${score.round} · ${score.slot} · ${score.mapId ?? score.title}`,
        plays: [score],
      });
  }
  return [...maps.values()];
}

function rankMapPlays(plays: EventScore[], by: "team" | "player") {
  const best = new Map<string | number, number>();
  function recordBest(id: string | number, score: number) {
    const previous = best.get(id);
    if (previous === undefined || score > previous) best.set(id, score);
  }
  if (by === "team") {
    for (const game of eventTeamGames(plays))
      recordBest(game.teamId, game.total);
  } else {
    for (const play of plays) recordBest(play.osuId, play.score);
  }

  const placements = new Map<
    string | number,
    { rank: number; score: number }
  >();
  const sorted = [...best].sort((a, b) => b[1] - a[1]);
  let rank = 0;
  sorted.forEach(([id, score], index) => {
    // Equal scores share a rank, and the next rank skips the tied competitors.
    if (index === 0 || score !== sorted[index - 1][1]) rank = index + 1;
    placements.set(id, { rank, score });
  });
  return placements;
}

// Scores already reflect the selected round/map scope. Team selection only
// controls visible rows; every participant in that scope remains a competitor.
export function eventPlacementRows(
  scores: EventScore[],
  by: "team" | "player",
  team = "",
) {
  const identity = by === "team" ? "teamId" : "osuId";
  const maps = groupEventMaps(scores).map(({ key, plays }) => ({
    key,
    placements: rankMapPlays(plays, by),
  }));
  const participants = new Map<string | number, EventScore[]>();
  for (const score of scores) {
    const id = score[identity];
    const plays = participants.get(id);
    if (plays) plays.push(score);
    else participants.set(id, [score]);
  }
  return [...participants]
    .filter(([, plays]) => !team || plays.some((play) => play.teamId === team))
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([id, plays]) => {
      const name = plays.map((score) => score[by]).sort()[0];
      const row: Record<string, string | number | null> = {
        _identity: id,
        ...(by === "player" ? { _osuId: id } : { _teamId: id }),
        [by === "team" ? "Team" : "Player"]: name,
        "Average placement": null,
        "Average score":
          plays.reduce((total, score) => total + score.score, 0) /
          (by === "team"
            ? new Set(plays.map((score) => eventGameKey(score))).size
            : plays.length),
      };
      const ranks: number[] = [];
      for (const map of maps) {
        const placement = map.placements.get(id);
        row[`${map.key}:rank`] = placement?.rank ?? null;
        row[`${map.key}:score`] = placement?.score ?? null;
        if (placement) ranks.push(placement.rank);
      }
      row["Average placement"] = ranks.length
        ? ranks.reduce((total, rank) => total + rank, 0) / ranks.length
        : null;
      return row;
    });
}

export function eventGameKey(score: Pick<EventScore, "fixture" | "game">) {
  return JSON.stringify([score.fixture, score.game]);
}
export function eventTeamGameKey(
  score: Pick<EventScore, "fixture" | "game" | "teamId">,
) {
  return JSON.stringify([score.fixture, score.game, score.teamId]);
}
/** Team/game identity never depends on display names or delimiter concatenation. */
export function eventTeamGames(plays: EventScore[]) {
  const groups = new Map<string, EventScore[]>();
  for (const score of plays) {
    const key = eventTeamGameKey(score);
    const group = groups.get(key);
    if (group) group.push(score);
    else groups.set(key, [score]);
  }
  return [...groups]
    .map(([key, scores]) => ({
      key,
      teamId: scores[0].teamId,
      name: scores.map((s) => s.team).sort()[0],
      total: scores.reduce((sum, score) => sum + score.score, 0),
      mp: scores[0].mp,
    }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
