/** Stable values; skill names stay literal in every interface locale. */
export const skillsetGroups = [
  {
    name: "Aim",
    tags: ["jump", "wide-angle", "awkward-aim", "snap-aim", "aim-consistency"],
  },
  {
    name: "Tapping",
    tags: ["stream", "burst", "speed", "stamina", "deathstream"],
  },
  {
    name: "Control",
    tags: [
      "flow-aim",
      "aim-control",
      "alternating",
      "finger-control",
      "slider-aim",
    ],
  },
  {
    name: "Technical",
    tags: ["tech", "slider-tech", "rhythm-complexity", "complex-patterns"],
  },
  {
    name: "Reading",
    tags: ["low-ar", "high-ar", "hd-reading", "density", "overlap"],
  },
  {
    name: "Special",
    tags: ["precision", "gimmick", "hybrid", "marathon", "antimod"],
  },
] as const;
export type SkillsetTag = (typeof skillsetGroups)[number]["tags"][number];
export const skillsetTags = skillsetGroups.flatMap((group) => [...group.tags]);
export const skillsetLabels: Record<SkillsetTag, string> = {
  jump: "Jump",
  "wide-angle": "Wide Angle",
  "awkward-aim": "Awkward Aim",
  "snap-aim": "Snap Aim",
  "aim-consistency": "Aim Consistency",
  stream: "Stream",
  burst: "Burst",
  speed: "Speed",
  stamina: "Stamina",
  deathstream: "Deathstream",
  "flow-aim": "Flow Aim",
  "aim-control": "Aim Control",
  alternating: "Alternating",
  "finger-control": "Finger Control",
  "slider-aim": "Slider Aim",
  tech: "Tech",
  "slider-tech": "Slider Tech",
  "rhythm-complexity": "Rhythm Complexity",
  "complex-patterns": "Complex Patterns",
  "low-ar": "Low AR",
  "high-ar": "High AR",
  "hd-reading": "HD Reading",
  density: "Density",
  overlap: "Overlap",
  precision: "Precision",
  gimmick: "Gimmick",
  hybrid: "Hybrid",
  marathon: "Marathon",
  antimod: "Antimod",
};
export function canonicalSkillsets(
  tags: readonly SkillsetTag[],
): SkillsetTag[] {
  const selected = new Set(tags);
  return skillsetTags.filter((tag) => selected.has(tag));
}
