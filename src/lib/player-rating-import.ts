import { db } from "@/db";
import {
  editionEvents,
  editionState,
  importedPlayerRatings,
  registrations,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { etxMods, type EtxMods } from "./etx-rating-model";
import { assertOperationalEdition } from "./archive-guard";
import type { User } from "./auth/sessions";
import { assertCapability } from "./auth/staff";
import { HttpError } from "./http-error";
import { parsePlayerRatingCsv } from "./player-rating-csv";
import {
  importedRatingsEdition,
  importPlayerRatingsWrite,
  playerRatingCsvLimit,
} from "./player-rating-import-contract";

export async function importPlayerRatings(
  actor: User,
  slug: string,
  input: unknown,
) {
  await assertCapability(actor, "manage_registrations", slug);
  if (slug !== importedRatingsEdition)
    throw new HttpError(404, "Tournament not found.");
  const parsed = importPlayerRatingsWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Upload a valid CSV export for the selected rating source.",
    );
  const { source, csv } = parsed.data;
  if (Buffer.byteLength(csv) > playerRatingCsvLimit)
    throw new HttpError(413, "The request is too large.");
  const rows = parsePlayerRatingCsv(csv);

  return db().transaction(async (tx) => {
    await tx
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(eq(editionState.slug, slug))
      .for("update");
    await assertCapability(actor, "manage_registrations", slug, tx);
    await assertOperationalEdition(slug, tx);
    const accepted = await tx
      .select({ userId: registrations.userId })
      .from(registrations)
      .where(
        and(
          eq(registrations.editionSlug, slug),
          eq(registrations.status, "accepted"),
        ),
      );
    const ids = new Map(accepted.map(({ userId }) => [String(userId), userId]));
    const matched = new Map<
      number,
      (typeof rows)[number] & { value: number }
    >();
    const unmatchedRows: number[] = [];
    let unmatched = 0;
    let missing = 0;
    for (const row of rows) {
      const userId = ids.get(row.identity);
      if (!userId) {
        unmatched++;
        if (unmatchedRows.length < 10) unmatchedRows.push(row.row);
      } else if (row.value === null) {
        missing++;
      } else {
        matched.set(userId, { ...row, value: row.value });
      }
    }
    const saved = await tx
      .select()
      .from(importedPlayerRatings)
      .where(
        and(
          eq(importedPlayerRatings.editionSlug, slug),
          eq(importedPlayerRatings.source, source),
        ),
      );
    const previous = new Map(saved.map((row) => [row.userId, row]));
    const importedAt = new Date();
    const changed: (typeof importedPlayerRatings.$inferInsert)[] = [];
    const confirmed: number[] = [];
    for (const [userId, row] of matched) {
      const old = previous.get(userId);
      const mods: EtxMods = {};
      for (const mod of etxMods) {
        const patch = row.mods?.[mod];
        const value = patch === undefined ? old?.etxMods?.[mod] : patch;
        if (value != null) mods[mod] = value;
      }
      if (
        old &&
        old.value === row.value &&
        old.provisional === row.provisional &&
        old.outdated === row.outdated &&
        etxMods.every((mod) => old.etxMods?.[mod] === mods[mod])
      ) {
        confirmed.push(userId);
      } else {
        changed.push({
          editionSlug: slug,
          source,
          userId,
          value: row.value,
          provisional: row.provisional,
          outdated: row.outdated,
          etxMods: Object.keys(mods).length ? mods : null,
          importedAt,
        });
      }
    }
    // Observation time advances for an identical matched row, but it is not a
    // rating change. Absent, unmatched and missing-total rows are untouched.
    for (let offset = 0; offset < confirmed.length; offset += 1000) {
      await tx
        .update(importedPlayerRatings)
        .set({ importedAt })
        .where(
          and(
            eq(importedPlayerRatings.editionSlug, slug),
            eq(importedPlayerRatings.source, source),
            inArray(
              importedPlayerRatings.userId,
              confirmed.slice(offset, offset + 1000),
            ),
          ),
        );
    }
    for (let offset = 0; offset < changed.length; offset += 1000) {
      await tx
        .insert(importedPlayerRatings)
        .values(changed.slice(offset, offset + 1000))
        .onConflictDoUpdate({
          target: [
            importedPlayerRatings.editionSlug,
            importedPlayerRatings.source,
            importedPlayerRatings.userId,
          ],
          set: {
            value: sql`excluded.value`,
            provisional: sql`excluded.provisional`,
            outdated: sql`excluded.outdated`,
            etxMods: sql`excluded.etx_mods`,
            importedAt: sql`excluded.imported_at`,
          },
        });
    }
    if (changed.length) {
      await tx.insert(editionEvents).values({
        editionSlug: slug,
        actorId: actor.osuId,
        kind: "player_ratings_import",
        detail: {
          entity: { type: "player_ratings", id: source },
          before: changed.map((row) => previous.get(row.userId) ?? null),
          after: changed,
        },
      });
    }
    return {
      matched: matched.size,
      updated: changed.length,
      unmatched,
      unmatchedRows,
      missing,
    };
  });
}
