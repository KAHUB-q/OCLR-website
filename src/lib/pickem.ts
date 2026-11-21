import { db, readOnlyData } from "@/db";
import {
  captains,
  editionEvents,
  editionState,
  fixtures,
  pickemPicks,
  pickemReceipts,
  pickemSettings,
  pickemVisibility,
  pickemWindows,
  teams,
  tournamentRounds,
  users,
} from "@/db/schema";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { z } from "zod";
import type { User } from "./auth/sessions";
import { assertCapability, assertUserWriteChannel } from "./auth/staff";
import { remoteMode } from "./data-source";
import { HttpError } from "./http-error";
import { publicCompetition, type PublicFixture } from "./public-competition";
import { readTournament } from "./tournament-reads";
import {
  legalPickemScore,
  pickemOutcomesFor,
  pickemPoints,
  pickemRules,
  pickemScoringVersion,
  type pickemAdminBody,
  type pickemPickBody,
} from "./pickem-model";
import type {
  PickemFixture,
  PickemRank,
  PickemSaved,
  PickemTeam,
} from "./pickem-types";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
type Reader = Pick<ReturnType<typeof db>, "select">;
type Window = typeof pickemWindows.$inferSelect;
type StoredPick = typeof pickemPicks.$inferSelect;

export class PickemError extends HttpError {
  constructor(
    status: number,
    public code: string,
    message: string,
    public current?: PickemSaved | null,
  ) {
    super(status, message);
  }
}

const unavailable = () =>
  new PickemError(
    404,
    "pickem_unavailable",
    "Predictions are unavailable for this tournament.",
  );
const closed = () =>
  new PickemError(
    409,
    "prediction_closed",
    "Predictions for this match are closed.",
  );
const voided = () =>
  new PickemError(409, "prediction_void", "This prediction window is void.");
const stale = () =>
  new PickemError(
    409,
    "version_conflict",
    "This changed. Refresh and try again.",
  );

const disabled = { enabled: false, version: 0 };
const unlisted = { listed: false, version: 0 };

async function settings(slug: string, reader: Reader = db()) {
  const [row] = await reader
    .select({
      enabled: pickemSettings.enabled,
      version: pickemSettings.version,
    })
    .from(pickemSettings)
    .where(eq(pickemSettings.editionSlug, slug));
  return row ?? disabled;
}

export async function pickemEnabled(slug: string) {
  if (remoteMode() || !process.env.DATABASE_URL) return false;
  return (await settings(slug)).enabled;
}

async function requireEdition(
  slug: string,
  reader: Reader,
  publicOnly: boolean,
) {
  const tournament = await readTournament(slug, reader, publicOnly);
  if (!tournament || tournament.edition.archive) throw unavailable();
  if (publicOnly && !(await settings(slug, reader)).enabled)
    throw unavailable();
  return tournament.edition;
}

async function lockEdition(
  tx: Transaction,
  slug: string,
  mode: "share" | "update",
) {
  await tx
    .select({ slug: editionState.slug })
    .from(editionState)
    .where(eq(editionState.slug, slug))
    .for(mode);
}

async function matchRow(tx: Transaction, slug: string, fixtureId: string) {
  const [fixture] = await tx
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.id, fixtureId), eq(fixtures.editionSlug, slug)))
    .for("update");
  if (!fixture) throw unavailable();
  return fixture;
}

async function roundRules(reader: Reader, slug: string, roundId: string) {
  const [round] = await reader
    .select({ rules: tournamentRounds.scoringRules })
    .from(tournamentRounds)
    .where(
      and(
        eq(tournamentRounds.id, roundId),
        eq(tournamentRounds.editionSlug, slug),
      ),
    );
  return round?.rules;
}

function asSaved(pick: StoredPick): PickemSaved {
  return {
    outcomeKey: pick.outcomeKey,
    score:
      pick.homeWins !== null && pick.awayWins !== null
        ? { homeWins: pick.homeWins, awayWins: pick.awayWins }
        : null,
    version: pick.version,
    updatedAt: pick.updatedAt.toISOString(),
  };
}

function aligned(window: Window, fixture: PublicFixture) {
  return (
    fixture.confirmed &&
    window.roundId === fixture.roundId &&
    window.homeTeamId === fixture.home.team?.id &&
    window.awayTeamId === fixture.away.team?.id
  );
}

function decision(
  window: Window,
  fixture: PublicFixture,
): PickemFixture["result"] {
  const official = fixture.result;
  if (!official) return null;
  const outcome = official.draw
    ? "draw"
    : official.winnerTeamId === window.homeTeamId
      ? "home"
      : official.winnerTeamId === window.awayTeamId
        ? "away"
        : null;
  if (!outcome || !pickemOutcomesFor(window.rules).includes(outcome))
    return null;
  const score = { homeWins: official.homeWins, awayWins: official.awayWins };
  const comparable = legalPickemScore(window.rules, outcome, score);
  return {
    outcomeKey: outcome,
    score: comparable ? score : null,
    revision: official.revision,
  };
}

function project(
  window: Window,
  fixture: PublicFixture,
  now: Date,
  picks: StoredPick[],
  userId?: number,
  previous?: Map<string, PickemTeam>,
): PickemFixture | null {
  const samePair = aligned(window, fixture);
  const home =
    samePair || !previous
      ? fixture.home.team
      : (previous.get(window.homeTeamId) ?? {
          id: "home",
          name: "",
          avatarKey: null,
        });
  const away =
    samePair || !previous
      ? fixture.away.team
      : (previous.get(window.awayTeamId) ?? {
          id: "away",
          name: "",
          avatarKey: null,
        });
  if (!home || !away) return null;
  const reason =
    window.voidReason ??
    (fixture.status === "cancelled"
      ? "cancelled"
      : !samePair
        ? "fixture_changed"
        : null);
  const result = reason ? null : decision(window, fixture);
  const status = reason
    ? "void"
    : result
      ? "settled"
      : fixture.status === "in_progress" ||
          fixture.status === "ended" ||
          fixture.result
        ? "pending"
        : now >= window.closesAt
          ? "closed"
          : "open";
  const mine = picks.find((pick) => pick.userId === userId);
  const saved = mine ? asSaved(mine) : null;
  const outcomes = pickemOutcomesFor(window.rules);
  return {
    fixtureId: fixture.id,
    windowId: window.id,
    label: fixture.label,
    roundId: fixture.roundId,
    roundName: fixture.roundName,
    scheduledAt: fixture.scheduledAt,
    closesAt: window.closesAt.toISOString(),
    timeZone: fixture.timeZone,
    home: { id: home.id, name: home.name, avatarKey: home.avatarKey ?? null },
    away: { id: away.id, name: away.name, avatarKey: away.avatarKey ?? null },
    status,
    voidReason: reason,
    outcomes,
    scoreRules: window.scoreEnabled ? window.rules : null,
    mine: saved,
    result,
    points:
      result && saved
        ? pickemPoints(saved, result.outcomeKey, result.score)
        : null,
    ...(userId !== undefined && status !== "open" && status !== "void"
      ? {
          distribution: outcomes.map((outcomeKey) => ({
            outcomeKey,
            count: picks.filter((p) => p.outcomeKey === outcomeKey).length,
          })),
        }
      : {}),
  };
}

type Score = Omit<PickemRank, "position" | "tied" | "username" | "mine">;
const emptyScore: Score = { points: 0, correct: 0, exact: 0, settled: 0 };

function rank(
  entries: { userId: number; username: string; score: Score }[],
  userId: number,
): PickemRank[] {
  entries.sort(
    (a, b) => b.score.points - a.score.points || a.userId - b.userId,
  );
  let position = 0;
  return entries.map(({ userId: id, username, score }, i) => {
    if (entries[i - 1]?.score.points !== score.points) position = i + 1;
    return {
      position,
      username,
      ...score,
      mine: id === userId,
      tied:
        entries[i - 1]?.score.points === score.points ||
        entries[i + 1]?.score.points === score.points,
    };
  });
}

export async function pickemRead(
  slug: string,
  actor: User | null,
  roundId?: string,
  useDefaultRound = false,
) {
  if (remoteMode() || !process.env.DATABASE_URL) throw unavailable();
  return readOnlyData(async () => {
    await requireEdition(slug, db(), true);
    const competition = await publicCompetition(slug, db());
    const publicFixtures = new Map(competition?.fixtures.map((f) => [f.id, f]));
    const windows = await db()
      .select()
      .from(pickemWindows)
      .where(eq(pickemWindows.editionSlug, slug))
      .orderBy(asc(pickemWindows.openedAt));
    const picksByWindow = new Map<string, StoredPick[]>();
    if (actor) {
      const picks = await db()
        .select({ pick: pickemPicks })
        .from(pickemPicks)
        .innerJoin(pickemWindows, eq(pickemWindows.id, pickemPicks.windowId))
        .where(eq(pickemWindows.editionSlug, slug));
      for (const { pick } of picks) {
        const bucket = picksByWindow.get(pick.windowId) ?? [];
        bucket.push(pick);
        picksByWindow.set(pick.windowId, bucket);
      }
    }

    const previousTeams =
      actor &&
      windows.some((window) => {
        const fixture = publicFixtures.get(window.fixtureId);
        return fixture && !aligned(window, fixture);
      })
        ? await db()
            .select({
              id: teams.id,
              name: teams.name,
              avatarKey: teams.avatarKey,
            })
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
            )
        : [];
    const identities = new Map(previousTeams.map((team) => [team.id, team]));
    const now = new Date();
    const roundScores = new Map<string, Map<number, Score>>();
    const seasonScores = new Map<number, Score>();
    const cards: PickemFixture[] = [];
    const rounds = new Map<
      string,
      { id: string; name: string; position: number }
    >();
    for (const window of windows) {
      const fixture = publicFixtures.get(window.fixtureId);
      if (!fixture) continue;
      const picks = picksByWindow.get(window.id) ?? [];
      const card = project(
        window,
        fixture,
        now,
        picks,
        actor?.osuId,
        identities,
      );
      if (!card || (!actor && card.status !== "open")) continue;
      if (card.status === "void" && !card.mine) continue;
      cards.push(card);
      if (!rounds.has(card.roundId))
        rounds.set(card.roundId, {
          id: card.roundId,
          name: card.roundName,
          position: fixture.roundPosition,
        });
      if (!card.result) continue;
      const scores = roundScores.get(card.roundId) ?? new Map<number, Score>();
      roundScores.set(card.roundId, scores);
      for (const pick of picks) {
        const points = pickemPoints(
          asSaved(pick),
          card.result.outcomeKey,
          card.result.score,
        );
        for (const scope of [scores, seasonScores]) {
          const before = scope.get(pick.userId) ?? emptyScore;
          scope.set(pick.userId, {
            points: before.points + points.points,
            correct: before.correct + points.outcomePoints,
            exact: before.exact + points.scorePoints,
            settled: before.settled + 1,
          });
        }
      }
    }

    const orderedRounds = [...rounds.values()].sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );
    const selectedRound = useDefaultRound
      ? (orderedRounds.find(({ id }) => id === roundId) ??
        orderedRounds.find(({ id }) =>
          cards.some((card) => card.roundId === id && card.status === "open"),
        ) ??
        orderedRounds.at(-1))
      : orderedRounds.find(({ id }) => id === roundId);
    const scores = selectedRound
      ? (roundScores.get(selectedRound.id) ?? new Map<number, Score>())
      : roundId && !useDefaultRound
        ? new Map<number, Score>()
        : seasonScores;
    const entries = actor
      ? await db()
          .select({ userId: users.osuId, username: users.username })
          .from(pickemVisibility)
          .innerJoin(users, eq(users.osuId, pickemVisibility.userId))
          .where(
            and(
              eq(pickemVisibility.editionSlug, slug),
              eq(pickemVisibility.listed, true),
            ),
          )
      : [];
    const board = (scoreMap: Map<number, Score>) =>
      rank(
        entries.flatMap((entry) => {
          const score = scoreMap.get(entry.userId);
          return score ? [{ ...entry, score }] : [];
        }),
        actor?.osuId ?? 0,
      );

    return {
      cards: cards.sort(
        (a, b) =>
          a.closesAt.localeCompare(b.closesAt) ||
          a.windowId.localeCompare(b.windowId),
      ),
      rounds: orderedRounds,
      selectedRound,
      leaderboard: board(scores),
      seasonLeaderboard: board(seasonScores),
      myScore: scores.get(actor?.osuId ?? 0) ?? emptyScore,
      seasonScore: seasonScores.get(actor?.osuId ?? 0) ?? emptyScore,
      visibility: actor
        ? await getVisibility(slug, actor.osuId, db())
        : unlisted,
      rulesVersion: pickemScoringVersion,
      serverNow: now.toISOString(),
    };
  });
}

export async function savePickemPick(
  slug: string,
  actor: User,
  fixtureId: string,
  body: z.infer<typeof pickemPickBody>,
  requestId: string,
) {
  assertUserWriteChannel();
  return db().transaction(async (tx) => {
    await lockEdition(tx, slug, "share");
    await requireEdition(slug, tx, true);
    const fixture = await matchRow(tx, slug, fixtureId);
    const [window] = await tx
      .select()
      .from(pickemWindows)
      .where(
        and(
          eq(pickemWindows.fixtureId, fixtureId),
          eq(pickemWindows.id, body.windowId),
        ),
      )
      .for("update");
    if (!window) throw unavailable();
    const published = (await publicCompetition(slug, tx))?.fixtures.find(
      (i) => i.id === fixtureId,
    );
    if (!published) throw unavailable();
    const score = body.score ?? null;
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          outcome: body.outcomeKey,
          score: score ? [score.homeWins, score.awayWins] : null,
          expectedVersion: body.expectedVersion,
        }),
      )
      .digest("hex");
    const key = and(
      eq(pickemReceipts.windowId, window.id),
      eq(pickemReceipts.userId, actor.osuId),
      eq(pickemReceipts.requestId, requestId),
    );
    const [receipt] = await tx.select().from(pickemReceipts).where(key);
    const now = new Date();
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw stale();
      return {
        saved: receipt.receipt,
        closesAt: window.closesAt.toISOString(),
        serverNow: now.toISOString(),
      };
    }
    if (
      window.voidReason ||
      !aligned(window, published) ||
      fixture.status === "cancelled"
    )
      throw voided();
    if (
      now >= window.closesAt ||
      fixture.status !== "scheduled" ||
      published.result
    )
      throw closed();
    if (
      !pickemOutcomesFor(window.rules).includes(body.outcomeKey) ||
      (score &&
        (!window.scoreEnabled ||
          !legalPickemScore(window.rules, body.outcomeKey, score)))
    ) {
      throw new PickemError(
        400,
        "invalid_prediction",
        "Choose a result and score allowed by the match rules.",
      );
    }
    const voter = and(
      eq(pickemPicks.windowId, window.id),
      eq(pickemPicks.userId, actor.osuId),
    );
    const [before] = await tx.select().from(pickemPicks).where(voter);
    if ((before?.version ?? null) !== body.expectedVersion)
      throw new PickemError(
        409,
        "version_conflict",
        "Your saved prediction changed.",
        before ? asSaved(before) : null,
      );
    const acceptedAt = new Date();
    if (acceptedAt >= window.closesAt) throw closed();
    const data = {
      outcomeKey: body.outcomeKey,
      homeWins: score?.homeWins ?? null,
      awayWins: score?.awayWins ?? null,
      updatedAt: acceptedAt,
      version: (before?.version ?? 0) + 1,
    };
    const [after] = before
      ? await tx.update(pickemPicks).set(data).where(voter).returning()
      : await tx
          .insert(pickemPicks)
          .values({ ...data, windowId: window.id, userId: actor.osuId })
          .returning();
    const saved = asSaved(after);
    await tx.insert(pickemReceipts).values({
      windowId: window.id,
      userId: actor.osuId,
      requestId,
      fingerprint,
      receipt: saved,
    });
    return {
      saved,
      closesAt: window.closesAt.toISOString(),
      serverNow: now.toISOString(),
    };
  });
}

async function getVisibility(slug: string, userId: number, reader: Reader) {
  const [row] = await reader
    .select({
      listed: pickemVisibility.listed,
      version: pickemVisibility.version,
    })
    .from(pickemVisibility)
    .where(
      and(
        eq(pickemVisibility.editionSlug, slug),
        eq(pickemVisibility.userId, userId),
      ),
    );
  return row ?? unlisted;
}

export async function savePickemVisibility(
  slug: string,
  actor: User,
  input: { listed: boolean; expectedVersion: number },
) {
  assertUserWriteChannel();
  return db().transaction(async (tx) => {
    await lockEdition(tx, slug, "share");
    await requireEdition(slug, tx, true);
    const after = { listed: input.listed, version: input.expectedVersion + 1 };
    const key = and(
      eq(pickemVisibility.editionSlug, slug),
      eq(pickemVisibility.userId, actor.osuId),
      eq(pickemVisibility.version, input.expectedVersion),
    );
    const result =
      input.expectedVersion === 0
        ? await tx
            .insert(pickemVisibility)
            .values({ editionSlug: slug, userId: actor.osuId, ...after })
            .onConflictDoNothing()
            .returning()
        : await tx.update(pickemVisibility).set(after).where(key).returning();
    if (!result.length) throw stale();
    return after;
  });
}

async function audit(
  tx: Transaction,
  actor: User,
  slug: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(editionEvents).values({
    editionSlug: slug,
    actorId: actor.osuId,
    kind: `pickem_${action}`,
    detail: { before, after },
  });
}

export async function savePickemSettings(
  slug: string,
  actor: User,
  input: { enabled: boolean; expectedVersion: number },
) {
  assertUserWriteChannel();
  return db().transaction(async (tx) => {
    await lockEdition(tx, slug, "update");
    await assertCapability(actor, "configure_tournament", slug, tx);
    const edition = await requireEdition(slug, tx, false);
    if (input.enabled && !edition.published)
      throw new PickemError(
        409,
        "edition_unpublished",
        "Publish the tournament before opening predictions.",
      );
    const before = await settings(slug, tx);
    if (before.version !== input.expectedVersion) throw stale();
    if (before.enabled === input.enabled) return before;
    const after = { enabled: input.enabled, version: before.version + 1 };
    await tx
      .insert(pickemSettings)
      .values({ editionSlug: slug, ...after })
      .onConflictDoUpdate({ target: pickemSettings.editionSlug, set: after });
    await audit(tx, actor, slug, "settings", before, after);
    return after;
  });
}

export async function pickemAdminRead(slug: string, actor: User) {
  if (remoteMode() || !process.env.DATABASE_URL) throw unavailable();
  return readOnlyData(async () => {
    await assertCapability(actor, "configure_tournament", slug, db());
    const edition = await requireEdition(slug, db(), false);
    const publication = await publicCompetition(slug, db());
    const byId = new Map(publication?.fixtures.map((f) => [f.id, f]));
    const rows = await db()
      .select({
        id: fixtures.id,
        label: fixtures.label,
        round: tournamentRounds.name,
        roundId: tournamentRounds.id,
        rules: tournamentRounds.scoringRules,
        fixtureVersion: fixtures.version,
        timeZone: fixtures.timeZone,
      })
      .from(fixtures)
      .innerJoin(tournamentRounds, eq(tournamentRounds.id, fixtures.roundId))
      .where(eq(fixtures.editionSlug, slug))
      .orderBy(asc(tournamentRounds.position), asc(fixtures.position));
    const windows = await db()
      .select()
      .from(pickemWindows)
      .where(eq(pickemWindows.editionSlug, slug))
      .orderBy(asc(pickemWindows.openedAt));
    const active = new Map(
      windows
        .filter((window) => !window.voidReason)
        .map((window) => [window.fixtureId, window]),
    );
    const former = new Map(
      windows
        .filter((window) => window.voidReason)
        .map((window) => [window.fixtureId, window]),
    );
    const now = new Date();
    const counts = await db()
      .select({
        id: pickemPicks.windowId,
        count: sql<number>`count(*)::integer`,
      })
      .from(pickemPicks)
      .innerJoin(pickemWindows, eq(pickemWindows.id, pickemPicks.windowId))
      .where(
        and(
          eq(pickemWindows.editionSlug, slug),
          isNull(pickemWindows.voidReason),
          sql`${pickemWindows.closesAt} <= ${now.toISOString()}`,
        ),
      )
      .groupBy(pickemPicks.windowId);
    const totals = new Map(counts.map((row) => [row.id, row.count]));
    return {
      title: edition.name,
      published: edition.published,
      settings: await settings(slug, db()),
      rows: rows.map(({ rules, ...row }) => {
        const publicFixture = byId.get(row.id);
        const item = active.get(row.id);
        const projected =
          item && publicFixture ? project(item, publicFixture, now, []) : null;
        const reason = !publicFixture?.confirmed
          ? "unpublished"
          : publicFixture.stage === "exhibition"
            ? "exhibition"
            : !publicFixture.scheduledAt
              ? "schedule"
              : publicFixture.status !== "scheduled" ||
                  publicFixture.result ||
                  Date.parse(publicFixture.scheduledAt) <= now.getTime()
                ? "started"
                : !rules
                  ? "rules"
                  : null;
        return {
          ...row,
          lastVoid: former.get(row.id)?.voidReason ?? null,
          home: publicFixture?.home.team?.name ?? null,
          away: publicFixture?.away.team?.name ?? null,
          scheduledAt: publicFixture?.scheduledAt ?? null,
          rules: rules ? pickemRules(rules) : null,
          reason,
          window: item
            ? {
                id: item.id,
                version: item.version,
                closesAt: item.closesAt.toISOString(),
                scoreEnabled: item.scoreEnabled,
                status: projected?.status ?? null,
                result: projected?.result ?? null,
                count:
                  projected?.status &&
                  projected.status !== "open" &&
                  projected.status !== "void"
                    ? (totals.get(item.id) ?? 0)
                    : null,
              }
            : null,
        };
      }),
    };
  });
}

export async function commandPickemFixture(
  slug: string,
  actor: User,
  fixtureId: string,
  command: z.infer<typeof pickemAdminBody>,
) {
  assertUserWriteChannel();
  return db().transaction(async (tx) => {
    await lockEdition(tx, slug, "share");
    await assertCapability(actor, "configure_tournament", slug, tx);
    await requireEdition(slug, tx, false);
    const fixture = await matchRow(tx, slug, fixtureId);
    // Round edits invalidate their windows in the same transaction.
    await tx
      .select({ id: tournamentRounds.id })
      .from(tournamentRounds)
      .where(eq(tournamentRounds.id, fixture.roundId))
      .for("share");
    const [before] = await tx
      .select()
      .from(pickemWindows)
      .where(
        and(
          eq(pickemWindows.fixtureId, fixtureId),
          isNull(pickemWindows.voidReason),
        ),
      )
      .for("update");
    if (command.action === "open") {
      if (before || fixture.version !== command.fixtureVersion) throw stale();
      const projected = (await publicCompetition(slug, tx))?.fixtures.find(
        (item) => item.id === fixtureId,
      );
      const rules = await roundRules(tx, slug, fixture.roundId);
      const requested = new Date(command.closesAt);
      if (
        !projected?.confirmed ||
        projected.stage === "exhibition" ||
        !rules ||
        !fixture.homeTeamId ||
        !fixture.awayTeamId ||
        fixture.status !== "scheduled" ||
        projected.result ||
        !fixture.scheduledAt ||
        requested <= new Date() ||
        requested > fixture.scheduledAt
      ) {
        throw new PickemError(
          400,
          "pickem_cannot_open",
          "Choose an eligible match and a deadline before it starts.",
        );
      }
      const [after] = await tx
        .insert(pickemWindows)
        .values({
          editionSlug: slug,
          fixtureId,
          roundId: fixture.roundId,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          rules: pickemRules(rules),
          ruleVersion: rules.version,
          scoringVersion: pickemScoringVersion,
          scoreEnabled: command.scoreEnabled,
          closesAt: requested,
        })
        .returning();
      await audit(tx, actor, slug, command.action, null, after);
      return after;
    }
    if (
      !before ||
      before.id !== command.windowId ||
      before.version !== command.expectedVersion
    )
      throw stale();
    const now = new Date();
    if (
      command.action === "tighten" &&
      (new Date(command.closesAt) <= now ||
        new Date(command.closesAt) >= before.closesAt)
    )
      throw new PickemError(
        400,
        "invalid_deadline",
        "Choose an earlier prediction deadline in the future.",
      );
    if (command.action === "close" && before.closesAt <= now) return before;
    const [after] = await tx
      .update(pickemWindows)
      .set({
        version: before.version + 1,
        ...(command.action === "void"
          ? { voidReason: "admin" as const }
          : {
              closesAt:
                command.action === "close" ? now : new Date(command.closesAt),
            }),
      })
      .where(eq(pickemWindows.id, before.id))
      .returning();
    await audit(tx, actor, slug, command.action, before, after);
    return after;
  });
}
