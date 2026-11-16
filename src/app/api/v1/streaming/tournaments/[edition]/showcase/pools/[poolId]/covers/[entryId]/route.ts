import { streamingShowcaseCover } from "@/lib/streaming-showcase-read";

async function handle(
  request: Request,
  {
    params,
  }: { params: Promise<{ edition: string; poolId: string; entryId: string }> },
) {
  const { edition, poolId, entryId } = await params;
  return streamingShowcaseCover(request, edition, poolId, entryId);
}

export {
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
