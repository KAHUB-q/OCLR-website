import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { osuCachedImages, osuImageEvents, osuImagePolicies } from "@/db/schema";
import {
  assertCapability,
  assertUserWriteChannel,
  hasCapability,
} from "./auth/staff";
import type { User } from "./auth/sessions";
import { remoteMode } from "./data-source";
import { inReadChannel } from "./read-channel";
import { HttpError } from "./http-error";
import {
  imageKind,
  officialImageUrl,
  type ImageKind,
  type ImageVariant,
} from "./osu-image-urls";
import {
  manageOsuImagesWrite,
  type OsuImagePolicy,
} from "./admin-operations-write-contracts";

type Transaction = Parameters<
  Parameters<ReturnType<typeof db>["transaction"]>[0]
>[0];
const MiB = 1024 * 1024;
const maxImageBytes = 8 * MiB;

function contentType(data: Buffer) {
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg";
  if (/^GIF8[79]a$/.test(data.toString("ascii", 0, 6))) return "image/gif";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

async function fetchImage(variant: ImageVariant, id: number) {
  const fail = () =>
    new HttpError(502, "Could not refresh the official image.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // A CDN can keep the bare URL cached longer than the site's configured TTL.
    // This URL is generated only when fetching new bytes on the server.
    const source = new URL(officialImageUrl(variant, id));
    source.searchParams.set("v", String(Date.now()));
    const response = await fetch(source, {
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status === 404)
      throw new HttpError(404, "Official image not found.");
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get("content-length")) > maxImageBytes
    )
      throw fail();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxImageBytes) throw fail();
      chunks.push(value);
    }
    const data = Buffer.concat(chunks, size);
    const mime = contentType(data);
    if (!mime) throw fail();
    return {
      data,
      byteSize: size,
      contentType: mime,
      etag: '"' + createHash("sha256").update(data).digest("hex") + '"',
    };
  } catch (error) {
    throw error instanceof HttpError ? error : fail();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function imageKey(variant: ImageVariant, id: number) {
  return and(
    eq(osuCachedImages.variant, variant),
    eq(osuCachedImages.imageId, id),
  );
}
async function lookup(
  reader: Pick<Transaction, "select">,
  variant: ImageVariant,
  id: number,
) {
  const [row] = await reader
    .select({
      image: osuCachedImages,
      fresh: sql<boolean>`
        (${osuImagePolicies.invalidatedAt} is null or ${osuCachedImages.fetchedAt} > ${osuImagePolicies.invalidatedAt})
        and now() < ${osuCachedImages.fetchedAt} + ${osuImagePolicies.ttlHours} * interval '1 hour'
      `,
    })
    .from(osuCachedImages)
    .innerJoin(
      osuImagePolicies,
      eq(osuCachedImages.kind, osuImagePolicies.kind),
    )
    .where(imageKey(variant, id));
  return row;
}
const policyFields = {
  kind: osuImagePolicies.kind,
  ttlHours: osuImagePolicies.ttlHours,
  capacityMiB: osuImagePolicies.capacityMiB,
  revision: osuImagePolicies.revision,
};
async function lockPolicy(tx: Transaction, kind: ImageKind) {
  const [policy] = await tx
    .select(policyFields)
    .from(osuImagePolicies)
    .where(eq(osuImagePolicies.kind, kind))
    .for("update");
  if (!policy) throw new HttpError(503, "Image cache is unavailable.");
  return policy;
}

async function trim(tx: Transaction, policy: OsuImagePolicy) {
  // Keep the newest prefix which fits, including when an admin lowers a quota.
  await tx.execute(sql`delete from osu_cached_images where (variant, image_id) in (
    select variant, image_id from (
      select variant, image_id, sum(byte_size) over (order by fetched_at desc, variant, image_id) as total
      from osu_cached_images where kind = ${policy.kind}
    ) ranked where total > ${policy.capacityMiB * MiB}
  )`);
}

async function refresh(tx: Transaction, variant: ImageVariant, id: number) {
  const kind = imageKind(variant);
  // Cover and list share the beatmapset lock. Different IDs can download concurrently.
  await tx.execute(
    sql`select pg_advisory_xact_lock(${kind === "avatar" ? 142601 : 142602}::integer, ${id}::integer)`,
  );
  const cached = await lookup(tx, variant, id);
  if (cached?.fresh) return cached.image;
  const bytes = await fetchImage(variant, id);
  const policy = await lockPolicy(tx, kind);
  // Downloads started before a concurrent sitewide refresh remain stale.
  const image = { ...bytes, kind, variant, imageId: id };
  const fetchedAt = sql`transaction_timestamp()`;
  const [stored] = await tx
    .insert(osuCachedImages)
    .values({ ...image, fetchedAt })
    .onConflictDoUpdate({
      target: [osuCachedImages.variant, osuCachedImages.imageId],
      set: { ...bytes, fetchedAt },
    })
    .returning({ fetchedAt: osuCachedImages.fetchedAt });
  await trim(tx, policy);
  return { ...image, fetchedAt: stored.fetchedAt };
}

// Leave database connections available for regular site traffic on a cold cache.
const pending = new Map<string, Promise<typeof osuCachedImages.$inferSelect>>();
const waiters: (() => void)[] = [];
let activeDownloads = 0;
async function downloadWhenReady(variant: ImageVariant, id: number) {
  if (activeDownloads < 4) activeDownloads++;
  else await new Promise<void>((resolve) => waiters.push(resolve));
  try {
    return await db().transaction((tx) => refresh(tx, variant, id));
  } finally {
    const next = waiters.shift();
    if (next) next();
    else activeDownloads--;
  }
}
export async function readOsuImage(variant: ImageVariant, id: number) {
  const cached = await lookup(db(), variant, id);
  if (cached?.fresh) return cached.image;
  const key = variant + "/" + id;
  let download = pending.get(key);
  if (!download) {
    if (waiters.length >= 16) return cached?.image ?? null;
    download = downloadWhenReady(variant, id).finally(() =>
      pending.delete(key),
    );
    pending.set(key, download);
  }
  try {
    return await download;
  } catch (error) {
    if (cached) return cached.image;
    throw error;
  }
}

export async function imagePoliciesForAdmin(actor: User) {
  if (
    remoteMode() ||
    inReadChannel() ||
    !(await hasCapability(actor, "configure_tournament"))
  )
    return [];
  return db()
    .select(policyFields)
    .from(osuImagePolicies)
    .orderBy(osuImagePolicies.kind);
}

export async function manageOsuImages(actor: User, input: unknown) {
  assertUserWriteChannel();
  await assertCapability(actor, "configure_tournament");
  const parsed = manageOsuImagesWrite.request.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Invalid image cache settings.");
  const command = parsed.data;
  return db().transaction(async (tx) => {
    const { kind } = command;
    const before = await lockPolicy(tx, kind);
    await assertCapability(actor, "configure_tournament", undefined, tx);
    if (command.action === "refreshAll") {
      await tx
        .update(osuImagePolicies)
        .set({ invalidatedAt: sql`clock_timestamp()` })
        .where(eq(osuImagePolicies.kind, kind));
      await tx.insert(osuImageEvents).values({
        actorId: actor.osuId,
        kind,
        operation: "refreshAll",
        details: {},
      });
      return before;
    }
    if (command.expectedRevision !== before.revision)
      throw new HttpError(
        409,
        "Website settings changed. Refresh before saving.",
      );
    if (
      before.capacityMiB === command.capacityMiB &&
      before.ttlHours === command.ttlHours
    )
      return before;
    const [after] = await tx
      .update(osuImagePolicies)
      .set({
        ttlHours: command.ttlHours,
        capacityMiB: command.capacityMiB,
        revision: before.revision + 1,
      })
      .where(eq(osuImagePolicies.kind, kind))
      .returning(policyFields);
    if (after.capacityMiB < before.capacityMiB) await trim(tx, after);
    await tx.insert(osuImageEvents).values({
      actorId: actor.osuId,
      kind,
      operation: "save",
      details: { before, after },
    });
    return after;
  });
}
