import { canonicalArchiveJson } from "@/lib/archive-read-model";
import { assertCapability, assertUserWriteChannel } from "@/lib/auth/staff";
import { requireUser } from "@/lib/auth/user";
import {
  exportHistoricalSeason,
  transferHistoricalSeason,
} from "@/lib/historical-season-transfer";
import { historicalSeasonTransferRequest } from "@/lib/historical-season-transfer-contract";
import {
  historicalSeasonGzipLimit,
  historicalSeasonJsonLimit,
} from "@/lib/request-body-limits";
import { apiError, HttpError, readJson, requireSameOrigin } from "@/lib/http";
import { revalidateCommittedPath } from "@/lib/next-revalidation";

type Context = { params: Promise<{ edition: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    assertUserWriteChannel();
    if (request.headers.has("authorization"))
      throw new HttpError(403, "Use a browser session for this operation.");
    const actor = await requireUser();
    const { edition } = await params;
    const archive = await exportHistoricalSeason(actor, edition);
    const json = canonicalArchiveJson(archive);
    if (Buffer.byteLength(json) > historicalSeasonJsonLimit - 1024)
      throw new HttpError(413, "Archive file exceeds the size limit.");
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${archive.edition.slug}-historical-season.v1.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

async function readPackageRequest(request: Request) {
  const encoding = request.headers.get("content-encoding");
  if (!encoding || encoding === "identity")
    return readJson(request, historicalSeasonJsonLimit);
  if (encoding !== "gzip")
    throw new HttpError(415, "Use identity or gzip encoding.");
  if (!request.body) throw new HttpError(400, "A request body is required.");
  let compressed = 0;
  const body = request.body
    .pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform(chunk, controller) {
          compressed += chunk.byteLength;
          if (compressed > historicalSeasonGzipLimit)
            throw new HttpError(413, "The request is too large.");
          controller.enqueue(chunk);
        },
      }),
    )
    .pipeThrough(new DecompressionStream("gzip"));
  return readJson(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body,
      duplex: "half",
    } as RequestInit),
    historicalSeasonJsonLimit,
  );
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertUserWriteChannel();
    requireSameOrigin(request);
    const actor = await requireUser();
    const { edition } = await params;
    await assertCapability(actor, "configure_tournament", edition);
    const parsed = historicalSeasonTransferRequest.safeParse(
      await readPackageRequest(request),
    );
    if (!parsed.success)
      throw new HttpError(400, "Invalid historical archive transfer request.");
    const command = parsed.data;
    const result = await transferHistoricalSeason(
      actor,
      edition,
      command.package,
      command.expectedRevision,
      command.action === "import" ? command.previewToken : undefined,
    );
    if (result.action === "import" && result.changed)
      revalidateCommittedPath("/", "layout");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
