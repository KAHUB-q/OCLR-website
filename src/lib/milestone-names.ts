export const milestoneNames = {
  draft: ["draft"],
  group: ["group_stage", "swiss"],
  knockout: ["quarterfinals", "semifinals", "finals", "grand_finals"],
} as const;

export type MilestoneKind = keyof typeof milestoneNames;

export function isMilestoneName(kind: MilestoneKind | undefined, name: string) {
  return (
    kind !== undefined && milestoneNames[kind].some((value) => value === name)
  );
}

export function milestoneName(name: string, tr: (message: string) => string) {
  switch (name) {
    case "draft":
      return tr("Draft ceremony");
    case "group_stage":
      return tr("Group stage");
    case "swiss":
      return tr("Swiss round");
    case "quarterfinals":
      return tr("Quarter-Finals");
    case "semifinals":
      return tr("Semi-Finals");
    case "finals":
      return tr("Finals");
    case "grand_finals":
      return tr("Grand Finals");
    default:
      return name;
  }
}
