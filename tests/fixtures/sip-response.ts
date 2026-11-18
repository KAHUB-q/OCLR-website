export function sipRating(name: string, value: number) {
  return {
    name,
    value,
    sr: 5.42,
    globalRank: 31,
    countryRank: 2,
    pp: 0,
    accuracy: 0.26,
    combo: 0.74,
  };
}
export function sipResponse(playerId: number, value: number) {
  return {
    playerId,
    activeUsername: "Synthetic player",
    countryCode: "TW",
    rating: sipRating("rating", value),
    modifications: { "Hard Rock": sipRating("Hard Rock", 0) },
    skillsets: { "High AR": sipRating("High AR", -12) },
  };
}
