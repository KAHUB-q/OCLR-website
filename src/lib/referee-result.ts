import type { RefereeResultGame, SeriesOutcome } from "./match-model";
import type { RefereeWorkspace } from "./referee-workspace";

export type RefereeResultReview = {
  revision: number;
  dependencyFingerprint: string;
  games: RefereeResultGame[];
  series: SeriesOutcome;
  blocker: string | null;
};

/** Count only the final attempt for each active pick or tiebreak. */
export function previewRefereeResult(
  workspace: RefereeWorkspace,
): RefereeResultReview | null {
  const { session, projection, rules, fixture, dependencyFingerprint } =
    workspace;
  if (!session) return null;

  const games: RefereeResultGame[] = [];
  let unresolved = false;
  let homeWins = 0;
  let awayWins = 0;
  let tiedMaps = 0;
  for (const pick of projection.activeSelections) {
    if (pick.kind === "ban") continue;
    const attempt = pick.attempts.at(-1);
    if (!attempt) {
      unresolved = true;
      continue;
    }
    const winner = attempt.winnerTeamId;
    const validWinner =
      attempt.status === "completed" &&
      (winner === fixture.homeTeamId || winner === fixture.awayTeamId) &&
      winner !== null;
    const validTie =
      attempt.status === "tied" &&
      session.basis.tiedMapPolicy === "count_as_draw";
    if (!validWinner && !validTie) {
      unresolved = true;
      continue;
    }
    if (validTie) tiedMaps++;
    else if (winner === fixture.homeTeamId) homeWins++;
    else awayWins++;
    games.push({
      attemptId: attempt.id,
      beatmapId: pick.beatmapId,
      category: pick.category,
      winnerTeamId: validTie ? null : winner,
    });
  }
  const draw = homeWins === awayWins;
  const series = session.basis.series;
  let blocker: string | null = null;
  if (fixture.status === "cancelled")
    blocker = "Cancelled fixtures cannot receive a scored result.";
  else if (
    !fixture.homeTeamId ||
    !fixture.awayTeamId ||
    fixture.homeTeamId === fixture.awayTeamId ||
    !session.basis.teamIds.includes(fixture.homeTeamId) ||
    !session.basis.teamIds.includes(fixture.awayTeamId)
  )
    blocker = "Both fixture teams must match the saved referee record.";
  else if (!rules)
    blocker = "The round scoring rules have not been configured.";
  else if (unresolved)
    blocker = "Resolve the current map or record a replay before continuing.";
  else if (!games.length) blocker = "Include at least one completed game.";
  else if (draw && !(series?.type === "fixed_maps" && series.allowDraw))
    blocker = "The saved referee outcomes do not determine a series winner.";
  return {
    revision: session.revision,
    dependencyFingerprint,
    games,
    series: {
      homeWins,
      awayWins,
      tiedMaps,
      includedGames: games.length,
      winnerTeamId:
        blocker || draw
          ? null
          : homeWins > awayWins
            ? fixture.homeTeamId
            : fixture.awayTeamId,
      draw: !blocker && draw,
      complete: !blocker,
    },
    blocker,
  };
}
