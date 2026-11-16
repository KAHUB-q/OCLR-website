import { streamingShowcaseResponse } from "@/lib/streaming-showcase-read";

async function handle(
  request: Request,
  { params }: { params: Promise<{ edition: string; poolId: string }> },
) {
  const { edition, poolId } = await params;
  return streamingShowcaseResponse(request, edition, poolId);
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
