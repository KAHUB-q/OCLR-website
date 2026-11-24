import { db } from "@/db";
import {
  captains,
  fixtureRecordings,
  fixtures,
  mappoolEntries,
  mappools,
  matchImports,
  matchGames,
  matchResults,
  resultRevisions,
  resultAuditEvents,
  refereeEvents,
  teams,
  tournamentRounds,
  tournamentStages,
} from "@/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { RatingReader } from "./approved-rating-games";
import {
  groupConfigurationSchema,
  standingsRulesSchema,
  type StandingsRules,
} from "./competition-model";
import { getPublicEdition } from "./content";
import { remoteMode } from "./data-source";
import { frontendResource } from "./frontend-resource";
import {
  matchGameSchema,
  matchSourceSchema,
  reviewedResultSchema,
} from "./match-model";
import { approvedRatingGames } from "./approved-rating-games";
import { ratingIdentities } from "./rating-data";
import { ratingSnapshot } from "./rating-snapshot";
import {
  reviewedMatchDetails,
  uniqueBeatmap,
  withStatisticsScores,
  type MatchDetails,
} from "./match-details-model";
import { calculateStandings } from "./standings";
import { readTournament } from "./tournament-reads";
import { openExhibitionSides } from "./exhibition-sides";
import type {
  PublicTeam,
  PublicSlot,
  PublicMatchResult,
  PublicFixture,
} from "./competition-read-contracts";
export type {
  PublicTeam,
  PublicSlot,
  PublicMatchResult,
  PublicFixture,
} from "./competition-read-contracts";
import type { ExplicitReadData } from "./explicit-read-contracts";
type PublicCompetition = ExplicitReadData<"publicCompetition">;
type PublicFixtureRead = ExplicitReadData<"publicFixture">;
/** Resolve evidence for this published revision without following later imports. */
function publishedMpEvidence(tx: RatingReader) {
  const submission = tx
    .select({
      id: sql<string>`${resultAuditEvents.detail} #>> '{after,latestImportId}'`,
    })
    .from(resultAuditEvents)
    .where(
      and(
        eq(resultAuditEvents.fixtureId, resultRevisions.fixtureId),
        eq(resultAuditEvents.action, "result_submit_referee"),
        sql`${resultAuditEvents.detail}->>'revision' = ${resultRevisions.revision}::text`,
      ),
    )
    .limit(1);
  // Stopping automatic scoring keeps the bound room and its saved games.
  const binding = tx
    .select({
      id: sql<number>`(${resultAuditEvents.detail}->>'matchId')::bigint`,
    })
    .from(resultAuditEvents)
    .where(
      and(
        eq(resultAuditEvents.fixtureId, resultRevisions.fixtureId),
        eq(resultAuditEvents.action, "referee_mp_bound"),
        lte(resultAuditEvents.createdAt, resultRevisions.createdAt),
      ),
    )
    .orderBy(desc(resultAuditEvents.createdAt), desc(resultAuditEvents.id))
    .limit(1);
  const room = sql`case when ${resultRevisions.proposal} ? 'referee' then (${binding}) end`;
  const snapshot = tx
    .select({ id: matchImports.id })
    .from(matchImports)
    .where(
      and(
        eq(matchImports.fixtureId, resultRevisions.fixtureId),
        eq(matchImports.externalMatchId, room),
        lte(matchImports.createdAt, resultRevisions.createdAt),
      ),
    )
    .orderBy(desc(matchImports.createdAt), desc(matchImports.id))
    .limit(1);
  return {
    importId: sql`coalesce(${resultRevisions.importId}, case when ${resultRevisions.proposal} ? 'referee'
      then coalesce((${submission})::uuid, (${snapshot})) end)`,
    roomId: sql<
      number | null
    >`coalesce(${matchImports.externalMatchId}, ${room})`.mapWith(Number),
  };
}

/** A replay's attempt ID differs from the pick on which EX was declared. */
async function publishedExAttempts(
  tx: RatingReader,
  revisions: { fixtureId: string; revision: number }[],
) {
  const enabled = new Set<string>();
  if (!revisions.length) return enabled;
  const events = await tx
    .select({ id: refereeEvents.id, payload: refereeEvents.payload })
    .from(refereeEvents)
    .where(
      and(
        sql`${refereeEvents.payload}->>'type' in ('ex_declared', 'attempt_replayed')`,
        or(
          ...revisions.map(({ fixtureId, revision }) =>
            and(
              eq(refereeEvents.fixtureId, fixtureId),
              lte(refereeEvents.ordinal, revision),
            ),
          ),
        ),
      ),
    )
    .orderBy(refereeEvents.ordinal);
  for (const { id, payload } of events) {
    if (payload.type === "attempt_replayed" && enabled.has(payload.pickId))
      enabled.add(id);
    if (payload.type === "ex_declared") {
      if (payload.enabled) enabled.add(payload.pickId);
      else enabled.delete(payload.pickId);
    }
  }
  return enabled;
}

async function databasePublicCompetition(
  slug: string,
  reader?: RatingReader,
): Promise<PublicCompetition> {
  if (
    !(reader
      ? await readTournament(slug, reader, true)
      : await getPublicEdition(slug))
  )
    return null;
  if (!process.env.DATABASE_URL)
    return {
      fixtures: [] as PublicFixture[],
      groups: [] as PublicGroup[],
      databaseAuthority: false,
    };
  const projectCompetition = async (tx: RatingReader) => {
    const [configured] = await tx
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(eq(fixtures.editionSlug, slug))
      .limit(1);
    const identities = await tx
      .select({ id: teams.id, name: teams.name, avatarKey: teams.avatarKey })
      .from(teams)
      .innerJoin(
        captains,
        and(
          eq(captains.editionSlug, teams.editionSlug),
          eq(captains.userId, teams.captainId),
          eq(captains.published, true),
        ),
      )
      .where(
        and(
          eq(teams.editionSlug, slug),
          eq(teams.identityPublished, true),
          eq(teams.rosterPublished, true),
          isNotNull(teams.finalizedAt),
          isNull(teams.archivedAt),
        ),
      );
    // Publication and approval predicates are enforced in SQL, before any public projection.
    const mp = publishedMpEvidence(tx);
    const rows = await tx
      .select({
        fixture: fixtures,
        round: tournamentRounds,
        stage: tournamentStages.kind,
        proposal: resultRevisions.proposal,
        approvedAt: resultRevisions.approvedAt,
        revision: resultRevisions.revision,
        resultPublishedAt: matchResults.publishedAt,
        mpId: mp.roomId,
        vodUrl: fixtureRecordings.vodUrl,
        publicPoolId: mappools.id,
        publicPoolName: mappools.name,
      })
      .from(fixtures)
      .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
      .innerJoin(
        tournamentStages,
        eq(tournamentStages.id, tournamentRounds.stageId),
      )
      .leftJoin(
        mappools,
        and(
          eq(mappools.id, fixtures.mappoolId),
          eq(mappools.roundId, fixtures.roundId),
          eq(mappools.editionSlug, slug),
          isNotNull(mappools.publishedAt),
        ),
      )
      .leftJoin(fixtureRecordings, eq(fixtureRecordings.fixtureId, fixtures.id))
      .leftJoin(
        matchResults,
        and(
          eq(matchResults.fixtureId, fixtures.id),
          isNotNull(matchResults.publishedAt),
          isNotNull(matchResults.publishedRevision),
        ),
      )
      .leftJoin(
        resultRevisions,
        and(
          eq(resultRevisions.fixtureId, fixtures.id),
          eq(resultRevisions.revision, matchResults.publishedRevision),
          isNotNull(resultRevisions.approvedAt),
          isNotNull(resultRevisions.approvedBy),
        ),
      )
      .leftJoin(
        matchImports,
        and(
          eq(matchImports.id, mp.importId),
          eq(matchImports.fixtureId, fixtures.id),
        ),
      )
      .where(
        and(eq(fixtures.editionSlug, slug), isNotNull(fixtures.publishedAt)),
      )
      .orderBy(
        asc(tournamentStages.kind),
        asc(tournamentRounds.position),
        asc(fixtures.position),
      );
    const proposals = new Map(
      rows.map((row) => {
        const parsed = reviewedResultSchema.safeParse(row.proposal);
        return [row.fixture.id, parsed.success ? parsed.data : null] as const;
      }),
    );
    const exAttempts = await publishedExAttempts(
      tx,
      Array.from(proposals).flatMap(([fixtureId, proposal]) =>
        proposal?.referee
          ? [{ fixtureId, revision: proposal.referee.revision }]
          : [],
      ),
    );
    const cache = new Map<string, PublicFixture | null>();
    const visiting = new Set<string>();
    function project(id: string): PublicFixture | null {
      if (cache.has(id)) return cache.get(id)!;
      if (visiting.has(id)) return null;
      const row = rows.find((r) => r.fixture.id === id);
      if (!row) return null;
      visiting.add(id);
      const f = row.fixture;
      const sides = openExhibitionSides(f, row.stage);
      const homeId = sides?.redId ?? f.homeTeamId;
      const awayId = sides?.blueId ?? f.awayTeamId;
      const slot = (side: "home" | "away"): PublicSlot => {
        const sourceId = side === "home" ? f.homeSourceId : f.awaySourceId;
        const outcome =
          side === "home" ? f.homeSourceOutcome : f.awaySourceOutcome;
        const teamId = side === "home" ? homeId : awayId;
        if (sides)
          return {
            team: {
              id: teamId!,
              name: side === "home" ? sides.redName : sides.blueName,
              avatarKey: null,
              exhibition: true,
            },
            label: side === "home" ? sides.redName : sides.blueName,
            sourceId: null,
            outcome: null,
          };
        if (!sourceId) {
          const team = identities.find((t) => t.id === teamId) ?? null;
          return {
            team,
            label: team?.name ?? "To be announced",
            sourceId: null,
            outcome: null,
          };
        }
        const parent = project(sourceId);
        const winner = parent?.result?.winnerTeamId;
        const resolvedId =
          winner && outcome === "loser"
            ? [parent!.home.team?.id, parent!.away.team?.id].find(
                (t) => t && t !== winner,
              )
            : winner;
        const team = identities.find((t) => t.id === resolvedId) ?? null;
        return {
          team,
          label:
            team?.name ??
            (parent
              ? `${outcome === "loser" ? "Loser" : "Winner"} of ${parent.label}`
              : "To be announced"),
          sourceId: parent?.id ?? null,
          outcome: parent ? outcome : null,
        };
      };
      const home = slot("home");
      const away = slot("away");
      // A direct unpublished team withholds its fixture; progression slots never reveal stored future assignments.
      if (
        (!f.homeSourceId && f.homeTeamId !== null && !home.team) ||
        (!f.awaySourceId && f.awayTeamId !== null && !away.team)
      ) {
        visiting.delete(id);
        cache.set(id, null);
        return null;
      }
      const confirmed = Boolean(
        home.team &&
        away.team &&
        home.team.id !== away.team.id &&
        home.team.id === homeId &&
        away.team.id === awayId,
      );
      const p = proposals.get(id);
      const aligned =
        p &&
        (p.rulesSnapshot !== null || row.stage === "exhibition") &&
        p.roundId === f.roundId &&
        p.teamIds[0] === homeId &&
        p.teamIds[1] === awayId;
      const result: PublicMatchResult | null =
        confirmed &&
        f.status !== "cancelled" &&
        aligned &&
        row.approvedAt &&
        row.resultPublishedAt &&
        (p!.referee || row.mpId !== null) &&
        row.revision
          ? {
              revision: row.revision,
              homeWins: p!.series.homeWins,
              awayWins: p!.series.awayWins,
              tiedMaps: p!.series.tiedMaps,
              winnerTeamId: p!.series.winnerTeamId,
              draw: p!.series.draw,
              games: p!.games.map((g) => ({
                ...(g.exMode && { exMode: true }),
                gameId: g.gameId,
                beatmapId: g.beatmapId,
                beatmap: g.beatmap,
                mods: g.mods,
                scoringType: g.scoringType,
                homeScore: g.homeScore,
                awayScore: g.awayScore,
                winnerTeamId: g.winnerTeamId,
                tied: g.tied,
              })),
              mpId: row.mpId,
              ...(row.vodUrl ? { vodUrl: row.vodUrl } : {}),
              mpUrl: row.mpId
                ? `https://osu.ppy.sh/community/matches/${row.mpId}`
                : null,
              ...(p!.referee
                ? {
                    refereeGames: p!.referee.games.map(
                      ({ attemptId, beatmapId, category, winnerTeamId }) => ({
                        ...(exAttempts.has(attemptId) && { exMode: true }),
                        beatmapId,
                        category,
                        winnerTeamId,
                      }),
                    ),
                  }
                : {}),
              publicNote: p!.publicNote,
              updatedAt: row.resultPublishedAt.toISOString(),
            }
          : null;
      const projected: PublicFixture = {
        pool:
          row.publicPoolId && row.publicPoolName
            ? { id: row.publicPoolId, name: row.publicPoolName }
            : null,
        id,
        label: f.label,
        publishedAt: f.publishedAt!.toISOString(),
        roundId: row.round.id,
        roundName: row.round.name,
        roundPosition: row.round.position,
        stageId: row.round.stageId,
        stage: row.stage,
        position: f.position,
        home,
        away,
        confirmed,
        // Explicitly published TBD schedules are useful; stale confirmed-team lineage still withholds its time.
        scheduledAt:
          confirmed || f.homeTeamId === null || f.awayTeamId === null
            ? (f.scheduledAt?.toISOString() ?? null)
            : null,
        timeZone: f.timeZone,
        status: f.status,
        result,
        updatedAt: (row.resultPublishedAt ?? f.updatedAt).toISOString(),
      };
      visiting.delete(id);
      cache.set(id, projected);
      return projected;
    }
    const published = rows
      .map((r) => project(r.fixture.id))
      .filter((f): f is PublicFixture => f !== null);
    const stages = await tx
      .select()
      .from(tournamentStages)
      .where(
        and(
          eq(tournamentStages.editionSlug, slug),
          eq(tournamentStages.kind, "group"),
          isNotNull(tournamentStages.groupsPublishedAt),
        ),
      );
    const groups: PublicGroup[] = [];
    for (const stage of stages) {
      const config = groupConfigurationSchema.safeParse(
        stage.groupConfiguration,
      );
      if (!config.success) continue;
      for (const group of config.data.groups) {
        const members = group.teamIds.map((id) =>
          identities.find((t) => t.id === id),
        );
        if (members.some((t) => !t)) continue;
        const matches = published.filter(
          (f) =>
            f.stageId === stage.id &&
            f.home.team &&
            f.away.team &&
            group.teamIds.includes(f.home.team.id) &&
            group.teamIds.includes(f.away.team.id),
        );
        const rules = new Map<string, StandingsRules | null>();
        for (const f of matches) {
          const parsed = standingsRulesSchema.safeParse(
            rows.find((r) => r.fixture.id === f.id)?.round.standingsRules,
          );
          rules.set(f.roundId, parsed.success ? parsed.data : null);
        }
        groups.push({
          key: group.key,
          name: group.name,
          version: config.data.version,
          ...calculateStandings(members as PublicTeam[], matches, rules),
        });
      }
    }
    return {
      fixtures: published,
      groups,
      databaseAuthority: Boolean(configured),
    };
  };
  return reader
    ? projectCompetition(reader)
    : db().transaction(projectCompetition, {
        isolationLevel: "repeatable read",
      });
}
export async function publicCompetition(
  slug: string,
  reader?: RatingReader,
): Promise<PublicCompetition> {
  if (remoteMode()) {
    return frontendResource<PublicCompetition>("publicCompetition", { slug });
  }
  return databasePublicCompetition(slug, reader);
}

export type PublicGroup = {
  key: string;
  name: string;
  version: string;
} & ReturnType<typeof calculateStandings>;
async function databasePublicFixture(
  slug: string,
  id: string,
): Promise<PublicFixtureRead> {
  if (!process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      const fixture = (await publicCompetition(slug, tx))?.fixtures.find(
        (f) => f.id === id,
      );
      if (!fixture) return null;
      const result = { ...fixture, details: null as MatchDetails | null };
      if (!fixture.result?.mpId) return result;
      const [row] = await tx
        .select({
          proposal: resultRevisions.proposal,
          source: matchImports.source,
          fingerprint: matchImports.fingerprint,
          importId: matchImports.id,
        })
        .from(resultRevisions)
        .innerJoin(
          matchImports,
          and(
            eq(matchImports.id, publishedMpEvidence(tx).importId),
            eq(matchImports.fixtureId, resultRevisions.fixtureId),
          ),
        )
        .where(
          and(
            eq(resultRevisions.fixtureId, id),
            eq(resultRevisions.revision, fixture.result.revision),
            isNotNull(resultRevisions.approvedAt),
            isNotNull(resultRevisions.approvedBy),
          ),
        );
      const proposal = reviewedResultSchema.safeParse(row?.proposal);
      const source = matchSourceSchema.safeParse(row?.source);
      if (
        !proposal.success ||
        !source.success ||
        (!proposal.data.referee &&
          proposal.data.sourceFingerprint !== row.fingerprint) ||
        source.data.match.id !== fixture.result.mpId ||
        source.data.fingerprint !== row.fingerprint
      )
        return result;
      const rawMp = Boolean(proposal.data.referee);
      let games = source.data.games;
      if (!rawMp) {
        const rows = await tx
          .select()
          .from(matchGames)
          .where(eq(matchGames.importId, row.importId));
        const parsed = rows.map((r) => matchGameSchema.safeParse(r.data));
        if (
          parsed.some((g) => !g.success) ||
          proposal.data.games.some(
            (g) => !rows.some((r) => r.externalGameId === g.gameId),
          )
        )
          return result;
        games = parsed.flatMap((g) => (g.success ? [g.data] : []));
      }
      const openExhibition = Boolean(fixture.home.team?.exhibition);
      let identities: Map<number, string>;
      if (openExhibition) {
        const names = new Map(
          source.data.players?.map((p) => [p.osuId, p.username]),
        );
        const scores = rawMp
          ? games.flatMap((game) => game.scores)
          : proposal.data.games.flatMap((game) => game.attribution ?? []);
        identities = new Map(
          scores.flatMap(({ osuId }) =>
            osuId === null
              ? []
              : [[osuId, names.get(osuId) ?? String(osuId)] as const],
          ),
        );
      } else {
        identities = await ratingIdentities(slug, tx, proposal.data.teamIds);
      }
      const pool = fixture.pool;
      const publicPool =
        pool && proposal.data.poolSnapshot?.poolId === pool.id
          ? {
              ...pool,
              entries: await tx
                .select({
                  id: mappoolEntries.id,
                  beatmapId: mappoolEntries.beatmapId,
                  category: mappoolEntries.category,
                  position: mappoolEntries.position,
                })
                .from(mappoolEntries)
                .where(eq(mappoolEntries.poolId, pool.id)),
            }
          : undefined;
      const played = reviewedMatchDetails(
        proposal.data,
        games,
        fixture.result.mpId,
        fixture.result.revision,
        identities,
        publicPool,
        openExhibition && rawMp,
      );
      played.sources[0].complete = source.data.complete;
      if (rawMp) {
        // A repeated beatmap alone cannot identify which MP game was the scored attempt.
        const outcomes = fixture.result.refereeGames ?? [];
        for (const outcome of outcomes) {
          if (outcome.exMode && uniqueBeatmap(outcomes, outcome.beatmapId)) {
            const game = uniqueBeatmap(played.games, outcome.beatmapId);
            if (game) game.exMode = true;
          }
        }
        return { ...fixture, details: played };
      }
      const ezScoreMultiplier = proposal.data.rulesSnapshot
        ? ((await readTournament(slug, tx, true))?.edition.ezScoreMultiplier ??
          1)
        : 1;
      const details = withStatisticsScores(played, ezScoreMultiplier);
      const ratedGames = (await approvedRatingGames(slug, tx)).filter(
        (g) => g.fixtureId === id && g.revision === fixture.result!.revision,
      );
      if (
        fixture.stage !== "exhibition" &&
        !ratedGames.some((g) => g.scores.some((s) => !identities.has(s.userId)))
      )
        details.rating = ratingSnapshot(ratedGames, identities);
      return { ...fixture, details };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicFixture(
  slug: string,
  id: string,
): Promise<PublicFixtureRead> {
  if (remoteMode()) {
    return frontendResource<PublicFixtureRead>("publicFixture", { slug, id });
  }
  return databasePublicFixture(slug, id);
}
