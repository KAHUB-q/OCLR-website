import type { AppTranslator } from "@/i18n/translate";

export function pickLiruSuggestions(tr: AppTranslator): string[] {
  const candidates = [
    tr("How many players are there?"),
    tr("How many upcoming matches are there?"),
    ...["HD", "NM", "HR", "DT", "FM", "TB", "ACE"].map((mod) =>
      tr("How many {mod} maps are there?", { mod }),
    ),
    tr("How many teams are there?"),
    tr("How many matches are there?"),
    tr("How many matches have published results?"),
    tr("How many mappools are there?"),
    tr("How many map slots are there?"),
    tr("How many unique beatmaps are there?"),
    tr("How many draft picks are there?"),
  ];
  const suggestions: string[] = [];
  while (suggestions.length < 3) {
    const index = Math.floor(Math.random() * candidates.length);
    suggestions.push(candidates.splice(index, 1)[0]);
  }
  return suggestions;
}
