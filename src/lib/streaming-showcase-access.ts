import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { db } from "@/db";
import {
  captains,
  draftPicks,
  draftSessions,
  memberships,
  registrations,
  teams,
  users,
} from "@/db/schema";

type Reader = Pick<ReturnType<typeof db>, "select">;

/** Pending registrations and private appointments are checked as well as released rosters. */
function isParticipant(reader: Reader, edition: string) {
  const subject = users.osuId;
  const record = { id: sql`1` };
  return or(
    exists(
      reader
        .select(record)
        .from(registrations)
        .where(
          and(
            eq(registrations.editionSlug, edition),
            eq(registrations.userId, subject),
            notInArray(registrations.status, ["withdrawn", "rejected"]),
          ),
        ),
    ),
    exists(
      reader
        .select(record)
        .from(captains)
        .where(
          and(eq(captains.editionSlug, edition), eq(captains.userId, subject)),
        ),
    ),
    exists(
      reader
        .select(record)
        .from(teams)
        .where(
          and(
            eq(teams.editionSlug, edition),
            eq(teams.captainId, subject),
            isNull(teams.archivedAt),
          ),
        ),
    ),
    exists(
      reader
        .select(record)
        .from(memberships)
        .where(
          and(
            eq(memberships.editionSlug, edition),
            eq(memberships.userId, subject),
            isNull(memberships.leftAt),
          ),
        ),
    ),
    exists(
      reader
        .select(record)
        .from(draftPicks)
        .innerJoin(draftSessions, eq(draftSessions.id, draftPicks.sessionId))
        .where(
          and(
            eq(draftSessions.editionSlug, edition),
            eq(draftPicks.playerId, subject),
            isNull(draftPicks.voidedAt),
          ),
        ),
    ),
  );
}

export async function isShowcaseParticipant(
  reader: Reader,
  edition: string,
  osuId: number,
) {
  const [row] = await reader
    .select({ participating: sql<boolean>`${isParticipant(reader, edition)}` })
    .from(users)
    .where(eq(users.osuId, osuId));
  return row?.participating ?? true;
}

export async function showcaseParticipantIds(
  reader: Reader,
  edition: string,
  osuIds: number[],
) {
  if (!osuIds.length) return new Set<number>();
  const rows = await reader
    .select({ osuId: users.osuId })
    .from(users)
    .where(and(inArray(users.osuId, osuIds), isParticipant(reader, edition)));
  return new Set(rows.map(({ osuId }) => osuId));
}
