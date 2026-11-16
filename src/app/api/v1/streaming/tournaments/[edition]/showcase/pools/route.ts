import { streamingShowcaseResponse } from "@/lib/streaming-showcase-read";

async function handle(
  request: Request,
  { params }: { params: Promise<{ edition: string }> },
) {
  const { edition } = await params;
  return streamingShowcaseResponse(request, edition);
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
