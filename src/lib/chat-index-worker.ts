import { chatTerms } from "./chat-retrieval";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getPool, readOnlyData } from "@/db";
import { chatSourceVectors as vectors, editionState } from "@/db/schema";
import { getPublicEdition } from "./content";
import { chatCollections, seasonContent } from "./chat-season-content";
import {
  embeddingProvider,
  normalizedEmbeddings,
  sourceDigest,
} from "./chat-vectors";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";

export async function refreshChatIndex() {
  if (remoteMode() || inReadChannel())
    throw new Error("Indexing requires the local database worker.");
  const provider = embeddingProvider();
  if (process.env.OCLR_CHAT_EMBEDDING_MODEL?.trim() && !provider)
    throw new Error("Configure the chat endpoint before indexing embeddings.");
  const connection = await getPool().connect();
  let locked = false;
  const counts = { updated: 0, removed: 0, failed: 0 };
  try {
    const result = await connection.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(1329810514, 1437) as locked",
    );
    locked = result.rows[0].locked;
    if (!locked) return { status: "busy", ...counts };
    const published = sql`${editionState.configuration}->>'published' = 'true'`;
    counts.removed +=
      (
        await db()
          .delete(vectors)
          .where(
            sql`not exists (select 1 from ${editionState} where ${editionState.slug} = ${vectors.editionSlug} and ${published})`,
          )
      ).rowCount ?? 0;
    const editions = await db()
      .select({ slug: editionState.slug })
      .from(editionState)
      .where(published)
      .orderBy(editionState.slug);
    for (const { slug } of editions) {
      try {
        const edition = await getPublicEdition(slug);
        if (!edition) continue;
        const saved = await db()
          .select({ digest: vectors.digest, model: vectors.model })
          .from(vectors)
          .where(eq(vectors.editionSlug, slug));
        const remaining = new Map(saved.map((row) => [row.digest, row.model]));
        const seen = new Set<string>();
        for (const collection of chatCollections) {
          const sources = await readOnlyData(() =>
            seasonContent(edition, collection),
          );
          const changed = [];
          for (const source of sources) {
            const digest = sourceDigest(collection, source);
            if (seen.has(digest)) continue;
            seen.add(digest);
            const old = remaining.get(digest);
            remaining.delete(digest);
            if (old !== (provider?.key ?? null))
              changed.push({ source, digest });
          }
          for (let i = 0; i < changed.length; i += 32) {
            const batch = changed.slice(i, i + 32);
            const embeddings = provider
              ? await normalizedEmbeddings(
                  provider,
                  batch.map(
                    ({ source }) =>
                      collection + " · " + source.title + "\n" + source.text,
                  ),
                )
              : [];
            await db()
              .insert(vectors)
              .values(
                batch.map(({ source, digest }, j) => ({
                  editionSlug: slug,
                  digest,
                  collection,
                  title: source.title,
                  url: source.url,
                  content: source.text,
                  keywords: chatTerms(
                    collection + " " + source.title + " " + source.text,
                  ),
                  model: provider?.key ?? null,
                  embedding: embeddings[j] ?? null,
                })),
              )
              .onConflictDoUpdate({
                target: [vectors.editionSlug, vectors.digest],
                set: {
                  model: sql`excluded.model`,
                  embedding: sql`excluded.embedding`,
                },
              });
            counts.updated += batch.length;
          }
        }
        const obsolete = [...remaining.keys()];
        for (let i = 0; i < obsolete.length; i += 500) {
          counts.removed +=
            (
              await db()
                .delete(vectors)
                .where(
                  and(
                    eq(vectors.editionSlug, slug),
                    inArray(vectors.digest, obsolete.slice(i, i + 500)),
                  ),
                )
            ).rowCount ?? 0;
        }
      } catch {
        counts.failed++;
      }
    }
    return { status: counts.failed ? "partial" : "complete", ...counts };
  } finally {
    try {
      if (locked)
        await connection.query("select pg_advisory_unlock(1329810514, 1437)");
    } finally {
      connection.release(true);
    }
  }
}
