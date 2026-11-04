/** Stored competition kind; authored round names never determine official status. */
export const competitionStages = ["group", "knockout", "exhibition"] as const;
export type CompetitionStageKind = (typeof competitionStages)[number];
export function competitionStageLabel(stage: string) {
  return stage === "group"
    ? "Group Stage"
    : stage === "knockout"
      ? "Knockout Stage"
      : stage === "exhibition"
        ? "Exhibition"
        : "Unknown stage";
}
export const exhibitionNotice =
  "Exhibition results are excluded from official tournament results, career records, ratings and awards.";
