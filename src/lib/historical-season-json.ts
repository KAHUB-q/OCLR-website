import { z } from "zod";
import { editionSchema, editionSlugSchema, type Edition } from "./editions";
import { archiveEvidenceUrl } from "./archive-metadata";
import {
  historicalArchiveSchema,
  archiveWinner,
  type HistoricalArchive,
} from "./historical-archive";
import { statisticsSnapshotSchema } from "./statistics-snapshot";

export const historicalSeasonFormat = "oclr-historical-season";
const archive = historicalArchiveSchema.shape;
const key = editionSlugSchema;
const slot = z.union([z.literal(0), z.literal(1)]);
const mpId = z.number().int().positive();

const settings = editionSchema.shape;
const editionDetailsSchema = z.strictObject({
  slug: settings.slug,
  name: settings.name,
  season: settings.season.removeDefault(),
  summary: settings.summary,
  timeZone: settings.timeZone,
  branding: settings.branding.removeDefault(),
  defaultAppearance: settings.defaultAppearance,
  rosterCapacity: settings.rosterCapacity,
  coachesEnabled: settings.coachesEnabled,
  ezScoreMultiplier: settings.ezScoreMultiplier,
  rules: settings.rules,
  eligibility: settings.eligibility,
  automaticEligibility: settings.automaticEligibility,
  rankGraceRange: settings.rankGraceRange,
  schedule: settings.schedule,
});

const bracketSchema = z.strictObject({
  sourceUrl: archiveEvidenceUrl,
  matches: z
    .array(
      z.strictObject({
        fixtureId: key,
        lane: z.enum(["upper", "lower", "grand-final"]),
        teamA: key,
        teamB: key,
        winnerSlot: slot,
        seedA: z.string().max(80).nullable(),
        seedB: z.string().max(80).nullable(),
      }),
    )
    .min(1)
    .max(1024),
  advancements: z
    .array(
      z.strictObject({
        targetFixtureId: key,
        targetSlot: slot,
        sourceFixtureId: key,
        outcome: z.enum(["winner", "loser"]),
      }),
    )
    .max(2048),
});

const statisticsSchema = z.strictObject({
  mpId,
  fixtureId: key,
  draft: statisticsSnapshotSchema,
  releaseEvidence: z
    .strictObject({
      publishedAt: z.iso.datetime().nullable(),
      snapshot: statisticsSnapshotSchema,
    })
    .nullable(),
});

const sections = z.strictObject({
  format: z.literal(historicalSeasonFormat),
  version: z.literal(1),
  edition: editionDetailsSchema,
  provenance: z.strictObject({
    sourceUrl: archive.sourceUrl,
    capturedOn: archive.capturedOn,
    notes: archive.notes,
    links: archive.links,
    sourceFacts: archive.sourceFacts,
    reviewTables: archive.reviewTables,
  }),
  roster: z.strictObject({
    teams: archive.teams,
    players: archive.players,
    unresolvedPlayers: archive.unresolvedPlayers,
    replacements: archive.rosterReplacements,
    staff: archive.staff,
    draft: z.strictObject({
      mode: archive.draftMode,
      picks: archive.picks,
    }),
  }),
  competition: z.strictObject({
    dates: archive.season,
    fixtures: archive.matches,
    pools: archive.pools,
    standings: archive.standings,
    finalPlacements: archive.finalPlacements,
    qualifiers: archive.qualifiers,
    bracket: bracketSchema.nullable(),
  }),
  statistics: z.array(statisticsSchema).max(10240),
});
export type HistoricalSeasonJson = z.output<typeof sections>;

export function archiveFromSeason(
  value: HistoricalSeasonJson,
): HistoricalArchive {
  const { edition, provenance, roster, competition } = value;
  return {
    formatVersion: 2,
    editionSlug: edition.slug,
    ...provenance,
    teams: roster.teams,
    players: roster.players,
    unresolvedPlayers: roster.unresolvedPlayers,
    rosterReplacements: roster.replacements,
    staff: roster.staff,
    draftMode: roster.draft.mode,
    picks: roster.draft.picks,
    season: competition.dates,
    matches: competition.fixtures,
    pools: competition.pools,
    standings: competition.standings,
    finalPlacements: competition.finalPlacements,
    qualifiers: competition.qualifiers,
  };
}

export function portableEdition(edition: Edition) {
  const { archive, registration, published, status, ...settings } = edition;
  void archive;
  void registration;
  void published;
  void status;
  return settings;
}

export function seasonJsonFromArchive(
  edition: HistoricalSeasonJson["edition"],
  archive: HistoricalArchive,
  bracket: HistoricalSeasonJson["competition"]["bracket"],
  statistics: HistoricalSeasonJson["statistics"],
): HistoricalSeasonJson {
  return {
    format: historicalSeasonFormat,
    version: 1,
    edition,
    provenance: {
      sourceUrl: archive.sourceUrl,
      capturedOn: archive.capturedOn,
      notes: archive.notes,
      links: archive.links,
      sourceFacts: archive.sourceFacts,
      reviewTables: archive.reviewTables,
    },
    roster: {
      teams: archive.teams,
      players: archive.players,
      unresolvedPlayers: archive.unresolvedPlayers,
      replacements: archive.rosterReplacements,
      staff: archive.staff,
      draft: { mode: archive.draftMode, picks: archive.picks },
    },
    competition: {
      dates: archive.season,
      fixtures: archive.matches,
      pools: archive.pools,
      standings: archive.standings,
      finalPlacements: archive.finalPlacements,
      qualifiers: archive.qualifiers,
      bracket,
    },
    statistics,
  };
}

export const historicalSeasonJsonSchema = sections.superRefine((value, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const parsed = historicalArchiveSchema.safeParse(archiveFromSeason(value));
  if (!parsed.success)
    for (const problem of parsed.error.issues)
      issue(problem.path.map(String), problem.message);

  const fixtures = new Map(value.competition.fixtures.map((m) => [m.id, m]));
  const bracket = value.competition.bracket;
  if (bracket) {
    const matches = new Map(
      bracket.matches.map((m, i) => [m.fixtureId, { ...m, i }]),
    );
    if (bracket.sourceUrl !== value.provenance.sourceUrl.replace(/\/edit$/, ""))
      issue(
        ["competition", "bracket", "sourceUrl"],
        "Bracket source must match the saved archive.",
      );
    if (matches.size !== bracket.matches.length)
      issue(
        ["competition", "bracket", "matches"],
        "Duplicate bracket fixture.",
      );
    bracket.matches.forEach((m, i) => {
      const f = fixtures.get(m.fixtureId);
      const winner = f ? archiveWinner(f) : null;
      if (
        f?.teamA !== m.teamA ||
        f.teamB !== m.teamB ||
        winner !== m.winnerSlot
      )
        issue(
          ["competition", "bracket", "matches", i],
          "Bracket fixture must match its saved result and team order.",
        );
    });
    const targets = new Set<string>();
    const outcomes = new Set<string>();
    bracket.advancements.forEach((edge, i) => {
      const from = matches.get(edge.sourceFixtureId);
      const to = matches.get(edge.targetFixtureId);
      const target = `${edge.targetFixtureId}:${edge.targetSlot}`;
      const outcome = `${edge.sourceFixtureId}:${edge.outcome}`;
      const sourceSlot =
        edge.outcome === "winner"
          ? from?.winnerSlot
          : 1 - (from?.winnerSlot ?? 0);
      if (
        !from ||
        !to ||
        from.i >= to.i ||
        targets.has(target) ||
        outcomes.has(outcome) ||
        (edge.targetSlot === 0 ? to.seedA : to.seedB) !== null ||
        (sourceSlot === 0 ? from.teamA : from.teamB) !==
          (edge.targetSlot === 0 ? to.teamA : to.teamB)
      )
        issue(
          ["competition", "bracket", "advancements", i],
          "Invalid or duplicate advancement between bracket fixtures.",
        );
      targets.add(target);
      outcomes.add(outcome);
    });
  }

  const seen = new Set<number>();
  value.statistics.forEach((record, i) => {
    const fixture = fixtures.get(record.fixtureId);
    if (
      !fixture?.mpUrls.some(
        (url) => Number(url.split("/").at(-1)) === record.mpId,
      )
    )
      issue(
        ["statistics", i, "fixtureId"],
        "MP room is not linked to the saved fixture.",
      );
    if (seen.has(record.mpId))
      issue(["statistics", i, "mpId"], "Duplicate MP room.");
    seen.add(record.mpId);
    for (const [path, snapshot] of [
      [["draft"], record.draft],
      [["releaseEvidence", "snapshot"], record.releaseEvidence?.snapshot],
    ] as const) {
      if (!snapshot) continue;
      if (snapshot.source.match.id !== record.mpId)
        issue(
          ["statistics", i, ...path, "source", "match", "id"],
          "Snapshot belongs to a different MP room.",
        );
      const games = new Set(snapshot.source.games.map((g) => g.id));
      if (snapshot.included.some((id) => !games.has(id)))
        issue(
          ["statistics", i, ...path, "included"],
          "Selected game is missing from the source.",
        );
    }
  });
});
