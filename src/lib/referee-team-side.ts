type FixtureTeams = {
  homeTeamId: string | null;
  awayTeamId: string | null;
};

// The first side (home) occupies the red slots. Open exhibitions also
// project their explicit red and blue identities as home and away.
export function refereeTeamSide(
  fixture: FixtureTeams,
  teamId: string | null | undefined,
) {
  if (teamId && teamId === fixture.homeTeamId) return "red";
  if (teamId && teamId === fixture.awayTeamId) return "blue";
  return "neutral";
}
