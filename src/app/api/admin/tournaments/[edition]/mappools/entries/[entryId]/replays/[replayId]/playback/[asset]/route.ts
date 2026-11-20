import { requireUser } from "@/lib/auth/user";
import { apiError, HttpError } from "@/lib/http";
import { loadMappoolReplayPlaybackAsset } from "@/lib/mappool-replays";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      edition: string;
      entryId: string;
      replayId: string;
      asset: string;
    }>;
  },
) {
  try {
    const actor = await requireUser();
    const { edition, entryId, replayId, asset } = await context.params;
    if (asset !== "beatmap.osz" && asset !== "skin.osk")
      throw new HttpError(404, "The replay playback asset is missing.");
    const bytes = await loadMappoolReplayPlaybackAsset(
      actor,
      edition,
      entryId,
      replayId,
      asset,
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asset}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
