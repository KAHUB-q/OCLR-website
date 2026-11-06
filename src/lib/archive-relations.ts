import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  notInArray,
  sql,
  getTableColumns,
} from "drizzle-orm";
import { unionAll, type AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  editionState,
  historicalStatistics,
  historicalStatisticsSources,
  archiveRelationDocuments,
  archiveRelationHeads,
} from "@/db/schema";
import { archiveRelationTables } from "@/db/archive-relational-schema";
import layoutsJson from "./archive-relational-layout.json" with { type: "json" };
import {
  encodeArchiveRelations,
  decodeArchiveRelations,
  type Layout,
  type RelationData,
  type RelationRow,
} from "./archive-relational-codec";
import { historicalArchiveSchema } from "./historical-archive";
import { statisticsSnapshotSchema } from "./statistics-snapshot";
import {
  archiveContentHash,
  type ArchiveState,
  type StatisticsRow,
} from "./archive-read-model";
import { remoteMode } from "./data-source";
import { HttpError } from "./http";

export const ARCHIVE_RELATION_CODEC = 1;
export const archiveRelationLayouts = layoutsJson as Layout[];
const tables: Record<string, AnyPgTable> = archiveRelationTables;
type Reader = Pick<ReturnType<typeof db>, "select">;
type Writer = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
const layoutFor = (kind: string) =>
  archiveRelationLayouts.find((l) => l.kind === kind)!;
const statisticsKey = (mpId: number, kind: string) => `${mpId}:${kind}`;
const disabled = () =>
  remoteMode() || process.env.OCLR_ARCHIVE_READ_MODEL === "jsonb";

async function heads(reader: Reader, slug: string, keys?: string[]) {
  return reader
    .select({ head: archiveRelationHeads, document: archiveRelationDocuments })
    .from(archiveRelationHeads)
    .innerJoin(
      archiveRelationDocuments,
      eq(archiveRelationHeads.documentId, archiveRelationDocuments.id),
    )
    .where(
      and(
        eq(archiveRelationHeads.editionSlug, slug),
        keys ? inArray(archiveRelationHeads.documentKey, keys) : undefined,
      ),
    );
}
function metadata(reader: Reader, slug: string, fixtureId?: string) {
  return reader
    .select({
      editionSlug: historicalStatistics.editionSlug,
      mpId: historicalStatistics.mpId,
      fixtureId: historicalStatistics.fixtureId,
      version: historicalStatistics.version,
      publishedAt: historicalStatistics.publishedAt,
      updatedAt: historicalStatistics.updatedAt,
      hasPublished: isNotNull(historicalStatistics.published),
      sourceHash: historicalStatisticsSources.sourceHash,
    })
    .from(historicalStatistics)
    .leftJoin(
      historicalStatisticsSources,
      and(
        eq(
          historicalStatisticsSources.editionSlug,
          historicalStatistics.editionSlug,
        ),
        eq(historicalStatisticsSources.mpId, historicalStatistics.mpId),
      ),
    )
    .where(
      and(
        eq(historicalStatistics.editionSlug, slug),
        fixtureId ? eq(historicalStatistics.fixtureId, fixtureId) : undefined,
      ),
    );
}
async function loadDocuments(reader: Reader, kind: string, ids: string[]) {
  const layout = layoutFor(kind),
    result = new Map<string, RelationData>();
  for (const id of ids)
    result.set(id, Object.fromEntries(layout.entities.map((e) => [e.key, []])));
  if (!ids.length) return result;
  // One round trip for all typed entities/documents. Build row JSON only for
  // transport; the authoritative data remains in typed columns and retained JSONB.
  const queries = layout.entities.map((entity) => {
    const table = tables[entity.key],
      columns = getTableColumns(table);
    return reader
      .select({
        documentId: columns.documentId,
        entity: sql<string>`${entity.key}::text`,
        rows: sql<RelationRow[]>`jsonb_agg(
        (to_jsonb(${table}) - 'document_id' - 'parent_id' - 'record_key') ||
        jsonb_build_object('parentId', ${columns.parentId}, 'recordKey', ${columns.recordKey})
        ORDER BY ${columns.id})`,
      })
      .from(table)
      .where(inArray(columns.documentId, ids))
      .groupBy(columns.documentId);
  });
  const rows = await (queries.length === 1
    ? queries[0]
    : unionAll(queries[0], queries[1], ...queries.slice(2)));
  for (const row of rows)
    result.get(String(row.documentId))![row.entity] = row.rows;
  return result;
}
async function saveDocument(
  tx: Writer,
  slug: string,
  key: string,
  kind: "archive" | "statistics",
  value: unknown,
  sourceHash: string,
  force: boolean,
) {
  const layout = layoutFor(kind),
    hash = archiveContentHash(value);
  let [document] = force
    ? []
    : await tx
        .select()
        .from(archiveRelationDocuments)
        .where(
          and(
            eq(archiveRelationDocuments.editionSlug, slug),
            eq(archiveRelationDocuments.documentKey, key),
            eq(archiveRelationDocuments.codecVersion, ARCHIVE_RELATION_CODEC),
            eq(archiveRelationDocuments.contentHash, hash),
          ),
        )
        .orderBy(
          desc(archiveRelationDocuments.createdAt),
          desc(archiveRelationDocuments.id),
        )
        .limit(1);
  const created = !document;
  if (!document) {
    const data = encodeArchiveRelations(layout, value);
    if (archiveContentHash(decodeArchiveRelations(layout, data)) !== hash)
      throw new Error("Historical relational roundtrip mismatch");
    [document] = await tx
      .insert(archiveRelationDocuments)
      .values({
        editionSlug: slug,
        documentKey: key,
        kind,
        contentHash: hash,
        mpId: kind === "statistics" ? Number(key.split(":")[0]) : null,
        snapshotKind: kind === "statistics" ? key.split(":")[1] : null,
        codecVersion: ARCHIVE_RELATION_CODEC,
      })
      .returning();
    for (const entity of layout.entities) {
      const rows = data[entity.key];
      for (let i = 0; i < rows.length; i += 200)
        await tx
          .insert(tables[entity.key])
          .values(
            rows
              .slice(i, i + 200)
              .map((row) => ({ ...row, documentId: document.id })),
          );
    }
  }
  await tx
    .insert(archiveRelationHeads)
    .values({
      editionSlug: slug,
      documentKey: key,
      documentId: document.id,
      sourceHash,
    })
    .onConflictDoUpdate({
      target: [
        archiveRelationHeads.editionSlug,
        archiveRelationHeads.documentKey,
      ],
      set: { documentId: document.id, sourceHash },
    });
  return created;
}

/** Caller holds the edition row lock. Only changed documents/MPs are encoded. */
export async function syncArchiveRelations(
  tx: Writer,
  slug: string,
  force = false,
) {
  const [state] = await tx
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configuration?.archive) {
    await tx
      .delete(archiveRelationHeads)
      .where(eq(archiveRelationHeads.editionSlug, slug));
    return { slug, created: 0, documents: 0, sources: 0 };
  }
  const archive = historicalArchiveSchema.parse(state.configuration.archive);
  if (archive.editionSlug !== slug)
    throw new Error("Historical edition scope mismatch");
  // Lock source identities without transferring their large JSONB values.
  await tx
    .select({ mpId: historicalStatistics.mpId })
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug))
    .for("share");
  // Repair a missing derived digest without touching source JSONB/history.
  await tx.execute(sql`INSERT INTO historical_statistics_sources(edition_slug,mp_id,source_hash)
    SELECT s.edition_slug,s.mp_id,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') FROM historical_statistics s
    LEFT JOIN historical_statistics_sources h ON h.edition_slug=s.edition_slug AND h.mp_id=s.mp_id
    WHERE s.edition_slug=${slug} AND h.mp_id IS NULL ON CONFLICT DO NOTHING`);
  const sources = await metadata(tx, slug),
    prior = await heads(tx, slug),
    active = ["archive"];
  let created = 0;
  const archiveHash = archiveContentHash(archive);
  const matching = (key: string, hash: string | null) =>
    prior.some(
      (p) =>
        p.head.documentKey === key &&
        p.head.sourceHash === hash &&
        p.document.codecVersion === ARCHIVE_RELATION_CODEC,
    );
  if (force || !matching("archive", archiveHash))
    created += Number(
      await saveDocument(
        tx,
        slug,
        "archive",
        "archive",
        archive,
        archiveHash,
        force,
      ),
    );
  const dirty = sources.filter(
    (s) =>
      force ||
      !matching(statisticsKey(s.mpId, "draft"), s.sourceHash) ||
      (s.hasPublished &&
        !matching(statisticsKey(s.mpId, "published"), s.sourceHash)),
  );
  const rows = dirty.length
    ? await tx
        .select()
        .from(historicalStatistics)
        .where(
          and(
            eq(historicalStatistics.editionSlug, slug),
            inArray(
              historicalStatistics.mpId,
              dirty.map((s) => s.mpId),
            ),
          ),
        )
    : [];
  for (const s of sources) {
    active.push(statisticsKey(s.mpId, "draft"));
    if (s.hasPublished) active.push(statisticsKey(s.mpId, "published"));
  }
  for (const row of rows)
    for (const kind of ["draft", "published"] as const) {
      if (!row[kind]) continue;
      const snapshot = statisticsSnapshotSchema.parse(row[kind]);
      created += Number(
        await saveDocument(
          tx,
          slug,
          statisticsKey(row.mpId, kind),
          "statistics",
          snapshot,
          sources.find((s) => s.mpId === row.mpId)!.sourceHash!,
          force,
        ),
      );
    }
  await tx
    .delete(archiveRelationHeads)
    .where(
      and(
        eq(archiveRelationHeads.editionSlug, slug),
        notInArray(archiveRelationHeads.documentKey, active),
      ),
    );
  return { slug, created, documents: active.length, sources: sources.length };
}

/** Batch the catalogue without one head/entity query per season. Each decoded
 * archive still has to match its current source hash independently.
 */
export async function normalizedArchives(
  states: ArchiveState[],
  reader: Reader,
) {
  const result = new Map<
    string,
    ReturnType<typeof historicalArchiveSchema.parse>
  >();
  if (disabled()) return result;
  const hashes = new Map(
    states
      .filter((s) => s.configuration?.archive)
      .map((state) => [
        state.slug,
        archiveContentHash(
          historicalArchiveSchema.parse(state.configuration!.archive),
        ),
      ]),
  );
  if (!hashes.size) return result;
  const current = await reader
    .select({ head: archiveRelationHeads, document: archiveRelationDocuments })
    .from(archiveRelationHeads)
    .innerJoin(
      archiveRelationDocuments,
      eq(archiveRelationHeads.documentId, archiveRelationDocuments.id),
    )
    .where(
      and(
        inArray(archiveRelationHeads.editionSlug, [...hashes.keys()]),
        eq(archiveRelationHeads.documentKey, "archive"),
      ),
    );
  const matching = current.filter(
    ({ head, document }) =>
      head.sourceHash === hashes.get(head.editionSlug) &&
      document.contentHash === head.sourceHash &&
      document.codecVersion === ARCHIVE_RELATION_CODEC,
  );
  if (!matching.length) return result;
  let data: Map<string, RelationData>;
  try {
    data = await loadDocuments(
      reader,
      "archive",
      matching.map((p) => p.document.id),
    );
  } catch {
    return result;
  }
  for (const { head, document } of matching) {
    try {
      const archive = historicalArchiveSchema.parse(
        decodeArchiveRelations(layoutFor("archive"), data.get(document.id)!),
      );
      if (archiveContentHash(archive) === hashes.get(head.editionSlug))
        result.set(head.editionSlug, archive);
    } catch {
      /* One incomplete document never invalidates another season. */
    }
  }
  return result;
}

export async function normalizedArchive(state: ArchiveState, reader: Reader) {
  return (await normalizedArchives([state], reader)).get(state.slug);
}

/** No source JSONB is selected when every digest has a matching typed document. */
export async function normalizedStatistics(
  slug: string,
  reader: Reader,
  fixtureId?: string,
): Promise<StatisticsRow[] | undefined> {
  if (disabled()) return undefined;
  const sources = await metadata(reader, slug, fixtureId);
  if (!sources.length) return [];
  const current = await heads(
    reader,
    slug,
    sources.flatMap((s) => [
      statisticsKey(s.mpId, "draft"),
      ...(s.hasPublished ? [statisticsKey(s.mpId, "published")] : []),
    ]),
  );
  const documents = new Map<string, (typeof current)[number]>();
  for (const source of sources)
    for (const kind of ["draft", "published"] as const) {
      if (kind === "published" && !source.hasPublished) continue;
      const key = statisticsKey(source.mpId, kind),
        found = current.find(
          (h) =>
            h.head.documentKey === key &&
            h.head.sourceHash === source.sourceHash &&
            h.document.codecVersion === ARCHIVE_RELATION_CODEC,
        );
      if (!source.sourceHash || !found) return undefined;
      documents.set(key, found);
    }
  try {
    const data = await loadDocuments(
      reader,
      "statistics",
      [...documents.values()].map((d) => d.document.id),
    );
    const snapshot = (mpId: number, kind: string) => {
      const d = documents.get(statisticsKey(mpId, kind))!.document;
      const value = statisticsSnapshotSchema.parse(
        decodeArchiveRelations(layoutFor("statistics"), data.get(d.id)!),
      );
      if (archiveContentHash(value) !== d.contentHash)
        throw new Error("Incomplete typed historical snapshot");
      return value;
    };
    return sources.map(({ sourceHash: _hash, hasPublished, ...source }) => {
      void _hash;
      return {
        ...source,
        draft: snapshot(source.mpId, "draft"),
        published: hasPublished ? snapshot(source.mpId, "published") : null,
      };
    });
  } catch {
    return undefined;
  }
}

export async function archiveRelationsReport(reader: Reader, slug: string) {
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  if (!state?.configuration?.archive)
    throw new HttpError(404, "Saved historical archive is required.");
  const current = await heads(reader, slug),
    sources = await metadata(reader, slug);
  const expected = new Map([
    [
      "archive",
      archiveContentHash(
        historicalArchiveSchema.parse(state.configuration.archive),
      ),
    ],
  ]);
  for (const s of sources) {
    expected.set(statisticsKey(s.mpId, "draft"), s.sourceHash ?? "");
    if (s.hasPublished)
      expected.set(statisticsKey(s.mpId, "published"), s.sourceHash ?? "");
  }
  const stale = [...expected].filter(
    ([key, hash]) =>
      !hash ||
      !current.some(
        (c) =>
          c.head.documentKey === key &&
          c.head.sourceHash === hash &&
          c.document.codecVersion === ARCHIVE_RELATION_CODEC,
      ),
  ).length;
  return {
    slug,
    documents: expected.size,
    sources: sources.length,
    current: expected.size - stale,
    stale,
    obsolete: current.filter((c) => !expected.has(c.head.documentKey)).length,
  };
}

/** Compare all persisted typed values with the preserved JSONB, without exposing it. */
export async function verifyArchiveRelations(reader: Reader, slug: string) {
  const report = await archiveRelationsReport(reader, slug);
  if (report.stale || report.obsolete)
    throw new HttpError(
      409,
      "Historical relations are stale; run the reviewed apply first.",
    );
  const [state] = await reader
    .select()
    .from(editionState)
    .where(eq(editionState.slug, slug));
  const sources = await reader
    .select()
    .from(historicalStatistics)
    .where(eq(historicalStatistics.editionSlug, slug));
  const expected = new Map<string, unknown>([
    ["archive", historicalArchiveSchema.parse(state.configuration!.archive)],
  ]);
  for (const s of sources)
    for (const kind of ["draft", "published"] as const)
      if (s[kind])
        expected.set(
          statisticsKey(s.mpId, kind),
          statisticsSnapshotSchema.parse(s[kind]),
        );
  const current = await heads(reader, slug);
  let rows = 0;
  for (const layout of archiveRelationLayouts) {
    const documents = current.filter((c) => c.document.kind === layout.kind);
    const data = await loadDocuments(
      reader,
      layout.kind,
      documents.map((d) => d.document.id),
    );
    for (const d of documents) {
      const relations = data.get(d.document.id)!;
      rows += Object.values(relations).reduce(
        (n, values) => n + values.length,
        0,
      );
      const hash = archiveContentHash(
        decodeArchiveRelations(layout, relations),
      );
      if (
        hash !== d.document.contentHash ||
        hash !== archiveContentHash(expected.get(d.head.documentKey))
      )
        throw new HttpError(
          409,
          "Historical relational verification failed; source JSONB was preserved.",
        );
    }
  }
  return { documents: expected.size, rows };
}

/** A database-only preview/apply; source data is never printed or rewritten. */
export async function backfillArchiveRelations(
  slug: string,
  apply = false,
  force = false,
) {
  return db().transaction(
    async (tx) => {
      if (apply) {
        await tx
          .select({ slug: editionState.slug })
          .from(editionState)
          .where(eq(editionState.slug, slug))
          .for("update");
        const changed = await syncArchiveRelations(tx, slug, force);
        return {
          ...(await archiveRelationsReport(tx, slug)),
          created: changed.created,
        };
      }
      return { ...(await archiveRelationsReport(tx, slug)), created: 0 };
    },
    {
      isolationLevel: apply ? "read committed" : "repeatable read",
      ...(apply ? {} : { accessMode: "read only" as const }),
    },
  );
}
