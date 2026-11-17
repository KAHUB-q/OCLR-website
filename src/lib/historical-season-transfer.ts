import { db } from "@/db";
import {
  draftSessions,
  editionEvents,
  editionRevisions,
  editionState,
  historicalBracketAdvancements,
  historicalBracketMatches,
  historicalBrackets,
  registrations,
  teams,
  tournamentStages,
  transferredHistoricalStatisticsReleases,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { readSavedArchiveProgression } from "./archive-progression";
import { archiveContentHash } from "./archive-read-model";
import {
  archiveEditionStates,
  readHistoricalStatistics,
} from "./archive-relations";
import {
  persistHistoricalStatistics,
  syncArchiveRelations,
} from "./archive-relation-writes";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { editionSchema } from "./editions";
import { archiveCounts } from "./historical-archive";
import {
  archiveFromSeason,
  historicalSeasonJsonSchema,
  portableEdition,
  seasonJsonFromArchive,
  type HistoricalSeasonJson,
} from "./historical-season-json";
import { correctS2PoolArchive } from "./archive-pool-correction-model";
import { HttpError } from "./http-error";
import { storedEdition } from "./tournament-reads";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
type Reader = Pick<Transaction, "select">;
type Bracket = HistoricalSeasonJson["competition"]["bracket"];

function sortAdvancements(edges: NonNullable<Bracket>["advancements"]) {
  return edges.sort((a, b) =>
    a.targetFixtureId < b.targetFixtureId
      ? -1
      : a.targetFixtureId > b.targetFixtureId
        ? 1
        : a.targetSlot - b.targetSlot,
  );
}

async function readBracket(reader: Reader, slug: string): Promise<Bracket> {
  const plan = await readSavedArchiveProgression(reader, slug);
  return (
    plan && {
      sourceUrl: plan.bracket.sourceUrl,
      matches: plan.matches.map(({ editionSlug, position, ...match }) => {
        void editionSlug;
        void position;
        return match;
      }),
      advancements: sortAdvancements(
        plan.advancements.map(({ editionSlug, ...edge }) => {
          void editionSlug;
          return edge;
        }),
      ),
    }
  );
}

async function savedSeason(reader: Reader, slug: string) {
  const [state] = await archiveEditionStates(reader, false, slug);
  const saved = state && storedEdition(state);
  if (!saved) throw new HttpError(404, "Tournament not found.");
  const bracket = await readBracket(reader, slug);
  const rows = await readHistoricalStatistics(slug, reader);
  const transferred = await reader
    .select()
    .from(transferredHistoricalStatisticsReleases)
    .where(eq(transferredHistoricalStatisticsReleases.editionSlug, slug));
  const releases = new Map(transferred.map((row) => [row.mpId, row]));
  const statistics = rows
    .map((row) => {
      const evidence = releases.get(row.mpId);
      return {
        mpId: row.mpId,
        fixtureId: row.fixtureId,
        draft: row.draft,
        releaseEvidence: row.published
          ? {
              snapshot: row.published,
              publishedAt: row.publishedAt?.toISOString() ?? null,
            }
          : evidence
            ? {
                snapshot: evidence.snapshot,
                publishedAt: evidence.publishedAt?.toISOString() ?? null,
              }
            : null,
      };
    })
    .sort((a, b) => a.mpId - b.mpId);
  return { saved, bracket, rows, statistics };
}

function parseSeason(input: unknown) {
  const parsed = historicalSeasonJsonSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  const path = first.path.map(String).join(".") || "$";
  // Use validation paths and fixed messages only. Do not include submitted values.
  const message =
    first.code === "custom" ? first.message : "Invalid archive data.";
  throw new HttpError(400, `${path} — ${message}`);
}

export async function exportHistoricalSeason(actor: User, slug: string) {
  await assertCapability(actor, "configure_tournament", slug);
  return db().transaction(
    async (tx) => {
      await assertCapability(actor, "configure_tournament", slug, tx);
      const { saved, bracket, statistics } = await savedSeason(tx, slug);
      if (!saved.edition.archive)
        throw new HttpError(404, "Saved historical archive is required.");
      const result = historicalSeasonJsonSchema.safeParse(
        seasonJsonFromArchive(
          portableEdition(saved.edition),
          saved.edition.archive,
          bracket,
          statistics,
        ),
      );
      if (!result.success) {
        const path = result.error.issues[0].path.map(String).join(".") || "$";
        throw new HttpError(
          409,
          `Saved historical data cannot be exported at ${path}.`,
        );
      }
      return result.data;
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}

async function assertHistoricalTarget(reader: Reader, slug: string) {
  for (const table of [registrations, teams, draftSessions, tournamentStages]) {
    const rows = await reader
      .select({ slug: table.editionSlug })
      .from(table)
      .where(eq(table.editionSlug, slug))
      .limit(1);
    if (rows.length)
      throw new HttpError(
        409,
        "This tournament already has live competition data. Use a separate historical edition.",
      );
  }
}

async function planImport(
  reader: Reader,
  slug: string,
  input: HistoricalSeasonJson,
  expectedRevision: number,
) {
  if (input.edition.slug !== slug)
    throw new HttpError(400, "Archive edition does not match this tournament.");
  const { saved, bracket, rows, statistics } = await savedSeason(reader, slug);
  if (expectedRevision !== saved.revision)
    throw new HttpError(
      409,
      "Tournament settings changed. Refresh before saving your changes.",
    );
  if (
    saved.edition.published ||
    saved.edition.status !== "completed" ||
    saved.edition.registration
  )
    throw new HttpError(
      409,
      "Import archives into an unpublished, completed tournament without registration.",
    );
  await assertHistoricalTarget(reader, slug);

  const archive = archiveFromSeason(input);
  if (correctS2PoolArchive(archive) !== archive)
    throw new HttpError(
      400,
      "S2 group-stage data contains retired pool slots.",
    );
  const edition = editionSchema.parse({
    ...input.edition,
    archive,
    status: "completed",
    published: false,
    registration: null,
  });
  const hash = archiveContentHash;
  const newBracket = input.competition.bracket;
  if (bracket && hash(bracket) !== hash(newBracket))
    throw new HttpError(
      409,
      "The package conflicts with the saved historical bracket.",
    );
  const currentStats = new Map(statistics.map((row) => [row.mpId, row]));
  const incoming = new Map(input.statistics.map((row) => [row.mpId, row]));
  for (const [mpId, row] of currentStats)
    if (hash(row) !== hash(incoming.get(mpId) ?? null))
      throw new HttpError(
        409,
        `The package conflicts with saved MP room ${mpId}.`,
      );
  const newStatistics = input.statistics.filter(
    (row) => !currentStats.has(row.mpId),
  );
  return {
    saved,
    edition,
    newBracket: bracket ? null : newBracket,
    newStatistics,
    preview: {
      previewToken: hash({
        input,
        slug,
        expectedRevision,
        target: saved.edition,
        bracket,
        statistics,
        versions: rows
          .map(({ mpId, version }) => [mpId, version])
          .sort((a, b) => a[0] - b[0]),
      }),
      counts: archiveCounts(archive),
      staff: archive.staff.length,
      fixtures: archive.matches.length,
      statistics: input.statistics.length,
      releaseEvidence: input.statistics.filter((row) => row.releaseEvidence)
        .length,
      bracketMatches: newBracket?.matches.length ?? 0,
      changed:
        hash(edition) !== hash(saved.edition) ||
        (!bracket && Boolean(newBracket)) ||
        newStatistics.length > 0,
    },
  };
}

async function insertBracket(
  tx: Transaction,
  slug: string,
  bracket: NonNullable<Bracket>,
) {
  await tx.insert(historicalBrackets).values({
    editionSlug: slug,
    sourceUrl: bracket.sourceUrl,
    matchCount: bracket.matches.length,
    advancementCount: bracket.advancements.length,
  });
  await tx.insert(historicalBracketMatches).values(
    bracket.matches.map((match, position) => ({
      ...match,
      position,
      editionSlug: slug,
    })),
  );
  if (bracket.advancements.length)
    await tx
      .insert(historicalBracketAdvancements)
      .values(
        bracket.advancements.map((edge) => ({ ...edge, editionSlug: slug })),
      );
}

export async function transferHistoricalSeason(
  actor: User,
  slug: string,
  raw: unknown,
  expectedRevision: number,
  previewToken?: string,
) {
  await assertCapability(actor, "configure_tournament", slug);
  const input = parseSeason(raw);
  // Database ordering is independent of source array order inside each snapshot.
  input.statistics.sort((a, b) => a.mpId - b.mpId);
  if (input.competition.bracket)
    sortAdvancements(input.competition.bracket.advancements);
  return db().transaction(
    async (tx) => {
      if (previewToken)
        await tx
          .select({ slug: editionState.slug })
          .from(editionState)
          .where(eq(editionState.slug, slug))
          .for("update");
      await assertCapability(actor, "configure_tournament", slug, tx);
      const plan = await planImport(tx, slug, input, expectedRevision);
      if (!previewToken) return { action: "preview" as const, ...plan.preview };
      if (previewToken !== plan.preview.previewToken)
        throw new HttpError(
          409,
          "The archive preview changed. Validate the file again.",
        );
      const revision = expectedRevision + Number(plan.preview.changed);
      if (!plan.preview.changed)
        return { action: "import" as const, revision, changed: false };

      const { slug: _slug, ...configuration } = plan.edition;
      void _slug;
      await tx
        .insert(editionRevisions)
        .values({ editionSlug: slug, version: revision, configuration });
      await tx
        .update(editionState)
        .set({
          configuration,
          configurationVersion: revision,
          configurationUpdatedAt: new Date(),
        })
        .where(eq(editionState.slug, slug));
      await syncArchiveRelations(tx, slug, false, configuration.archive);
      if (plan.newBracket) await insertBracket(tx, slug, plan.newBracket);
      for (const row of plan.newStatistics) {
        await persistHistoricalStatistics(tx, slug, row.mpId, undefined, {
          draft: row.draft,
          fixtureId: row.fixtureId,
        });
        if (row.releaseEvidence)
          await tx.insert(transferredHistoricalStatisticsReleases).values({
            editionSlug: slug,
            mpId: row.mpId,
            snapshot: row.releaseEvidence.snapshot,
            publishedAt: row.releaseEvidence.publishedAt
              ? new Date(row.releaseEvidence.publishedAt)
              : null,
          });
      }
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "tournament_archive_transfer",
        detail: {
          entity: { type: "tournament", id: slug },
          fileHash: archiveContentHash(input),
          before: { revision: plan.saved.revision },
          after: {
            revision,
            bracketMatchesAdded: plan.newBracket?.matches.length ?? 0,
            mpRoomsAdded: plan.newStatistics.map((row) => row.mpId),
          },
        },
      });
      return { action: "import" as const, revision, changed: true };
    },
    previewToken
      ? undefined
      : { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}
