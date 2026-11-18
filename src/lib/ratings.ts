import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { fixtures as fixtureTable } from "@/db/schema";
import { approvedRatingGames } from "./approved-rating-games";
import type { User } from "./auth/sessions";
import { assertReadCapability } from "./auth/staff";
import { remoteMode } from "./data-source";
import { RemoteDataError } from "./remote-errors";
import type { ExplicitReadData } from "./explicit-read-contracts";
import { assertRemoteSubject, frontendResource } from "./frontend-resource";
import { HttpError } from "./http-error";
import { publicCompetition } from "./public-competition";
import { fixtureRatingIdentities, ratingIdentities } from "./rating-data";
import { seasonSeriesBuilder } from "./season-series-source";
import type { RatingGame } from "./yumu-rating";
import { ratingSnapshot, type RatingSnapshot } from "./rating-snapshot";
import { readTournament } from "./tournament-reads";

type PublicMatchRating = ExplicitReadData<"publicMatchRating">;
type PublicRoundRatings = ExplicitReadData<"publicRoundRatings">;

async function databaseMatchRatingWorkspace(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RatingSnapshot> {
  await assertReadCapability(actor, "approve_results", slug);
  return db().transaction(
    async (tx) => {
      await assertReadCapability(actor, "approve_results", slug, tx);
      if (!(await readTournament(slug, tx)))
        throw new HttpError(404, "Tournament not found.");
      const games = (await approvedRatingGames(slug, tx)).filter(
        (g) => g.fixtureId === fixtureId,
      );
      return ratingSnapshot(games, await ratingIdentities(slug, tx));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function matchRatingWorkspace(
  actor: User,
  slug: string,
  fixtureId: string,
): Promise<RatingSnapshot> {
  if (remoteMode()) {
    await assertRemoteSubject(actor.osuId);
    return frontendResource<RatingSnapshot>("matchRatingWorkspace", {
      slug,
      fixtureId,
    });
  }
  return databaseMatchRatingWorkspace(actor, slug, fixtureId);
}

async function databasePublicMatchRating(
  slug: string,
  fixtureId: string,
): Promise<PublicMatchRating> {
  if (!process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      const competition = await publicCompetition(slug, tx);
      const fixture = competition?.fixtures.find(
        (f) => f.id === fixtureId && f.result && f.stage !== "exhibition",
      );
      if (!fixture?.result) return null;
      const identities = await ratingIdentities(slug, tx, [
        fixture.home.team!.id,
        fixture.away.team!.id,
      ]);
      const games = (await approvedRatingGames(slug, tx)).filter(
        (g) =>
          g.fixtureId === fixtureId && g.revision === fixture.result!.revision,
      );
      // No public record may identify a private substitute, even via the source evidence.
      if (games.some((g) => g.scores.some((s) => !identities.has(s.userId))))
        return null;
      return ratingSnapshot(games, identities);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicMatchRating(
  slug: string,
  fixtureId: string,
): Promise<PublicMatchRating> {
  if (remoteMode()) {
    return frontendResource<PublicMatchRating>("publicMatchRating", {
      slug,
      fixtureId,
    });
  }
  return databasePublicMatchRating(slug, fixtureId);
}

type PublicSeasonSeries = ExplicitReadData<"publicSeasonSeries">;

async function databasePublicSeasonSeries(
  slug: string,
): Promise<PublicSeasonSeries> {
  if (!process.env.DATABASE_URL) return null;
  return db().transaction(
    async (tx) => {
      if (!(await readTournament(slug, tx, true))) return null;
      const competition = await publicCompetition(slug, tx);
      if (!competition?.databaseAuthority) return null;
      const fixtures = competition.fixtures.filter(
        (f) => f.status !== "cancelled" && f.stage !== "exhibition",
      );
      const teams = new Map<string, string>();
      for (const { result, home, away } of fixtures) {
        if (!result || !home.team || !away.team) continue;
        teams.set(home.team.id, home.team.name);
        teams.set(away.team.id, away.team.name);
      }
      const { names, visible } = await fixtureRatingIdentities(slug, tx, [
        ...teams.keys(),
      ]);
      const series = seasonSeriesBuilder(
        fixtures.map((f) => ({
          id: f.id,
          roundId: f.roundId,
          roundName: f.roundName,
          complete: !!f.result?.games.length,
        })),
        names,
        teams,
      );
      const byFixture = new Map<string, RatingGame[]>();
      if (teams.size) {
        for (const game of await approvedRatingGames(slug, tx)) {
          const entries = byFixture.get(game.fixtureId);
          if (entries) entries.push(game);
          else byFixture.set(game.fixtureId, [game]);
        }
      }
      for (const f of fixtures) {
        const result = f.result;
        if (!result) continue;
        const sides = [f.home.team?.id, f.away.team?.id].filter(
          (id): id is string => !!id,
        );
        const ids = new Set(result.games.map((g) => g.gameId));
        const source = (byFixture.get(f.id) ?? []).filter(
          (g) => g.revision === result.revision && ids.has(g.gameId),
        );
        const withheld =
          sides.length !== 2 ||
          sides[0] === sides[1] ||
          source.some((g) => g.scores.some((s) => !visible(s.userId, sides)));
        for (const published of result.games) {
          const copies = source.filter((g) => g.gameId === published.gameId);
          if (withheld || !copies.length) {
            series.exclude(f.id, published.gameId);
            continue;
          }
          for (const g of copies) {
            if (
              g.problem ||
              g.roundId !== f.roundId ||
              g.teamIds.length !== 2 ||
              !sides.every((id) => g.teamIds.includes(id)) ||
              g.winnerTeamId !== published.winnerTeamId ||
              (g.beatmapId ?? null) !== published.beatmapId
            ) {
              series.exclude(f.id, g.gameId);
              continue;
            }
            series.add({
              fixtureId: f.id,
              gameId: g.gameId,
              slot: g.slot ?? null,
              beatmapId: published.beatmapId,
              teamIds: sides,
              winnerTeamId: g.winnerTeamId,
              scores: g.scores,
            });
          }
        }
      }
      return series.finish();
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function publicSeasonSeries(
  slug: string,
): Promise<PublicSeasonSeries> {
  if (remoteMode()) {
    try {
      return await frontendResource<PublicSeasonSeries>("publicSeasonSeries", {
        slug,
      });
    } catch (error) {
      if (error instanceof RemoteDataError && error.code === "NOT_FOUND")
        return null;
      throw error;
    }
  }
  return databasePublicSeasonSeries(slug);
}

/** Same population and approval gates as single fixtures, with raw-game reaggregation. */
async function databasePublicRoundRatings(
  slug: string,
): Promise<PublicRoundRatings> {
  if (!process.env.DATABASE_URL) return [];
  return db().transaction(
    async (tx) => {
      const competition = await publicCompetition(slug, tx);
      if (!competition) return [];
      const fixtures = competition.fixtures.filter(
        (f) => f.status !== "cancelled" && f.stage !== "exhibition",
      );
      const identities = await ratingIdentities(slug, tx, [
        ...new Set(
          fixtures.flatMap((f) =>
            [f.home.team?.id, f.away.team?.id].filter(
              (id): id is string => !!id,
            ),
          ),
        ),
      ]);
      const games = await approvedRatingGames(slug, tx);
      const allFixtures = await tx
        .select({ id: fixtureTable.id, roundId: fixtureTable.roundId })
        .from(fixtureTable)
        .where(
          and(
            eq(fixtureTable.editionSlug, slug),
            ne(fixtureTable.status, "cancelled"),
          ),
        );
      return [...new Set(fixtures.map((f) => f.roundId))].flatMap((roundId) => {
        const round = fixtures.filter((f) => f.roundId === roundId);
        const scopes = [
          { key: "", name: "", teamIds: null as string[] | null },
          ...competition.groups.map((g) => ({
            key: g.key,
            name: g.name,
            teamIds: g.rows.map((r) => r.team.id),
          })),
        ];
        return scopes
          .filter((scope) => !scope.key || round[0].stage === "group")
          .flatMap((scope) => {
            const selected = round.filter(
              (f) =>
                !scope.teamIds ||
                (scope.teamIds.includes(f.home.team?.id ?? "") &&
                  scope.teamIds.includes(f.away.team?.id ?? "")),
            );
            if (!selected.length) return [];
            const available = selected.filter((f) => f.result);
            const ids = new Set(available.map((f) => f.id));
            const source = games.filter((g) => ids.has(g.fixtureId));
            const withheld = source.some((g) =>
              g.scores.some((s) => !identities.has(s.userId)),
            );
            const report = ratingSnapshot(withheld ? [] : source, identities);
            const complete =
              available.length === selected.length &&
              !report.issues.length &&
              !withheld &&
              available.every((f) =>
                source.some((g) => g.fixtureId === f.id),
              ) &&
              allFixtures
                .filter((f) => f.roundId === roundId)
                .every((f) => round.some((p) => p.id === f.id));
            return [
              {
                roundId,
                roundName: round[0].roundName,
                stage: round[0].stage,
                groupKey: scope.key,
                groupName: scope.name,
                publishedFixtures: selected.length,
                ratedFixtures: withheld
                  ? 0
                  : available.filter((f) =>
                      source.some((g) => g.fixtureId === f.id),
                    ).length,
                complete,
                report,
              },
            ];
          });
      });
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function publicRoundRatings(
  slug: string,
): Promise<PublicRoundRatings> {
  if (remoteMode()) {
    return frontendResource<PublicRoundRatings>("publicRoundRatings", { slug });
  }
  return databasePublicRoundRatings(slug);
}
