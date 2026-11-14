import { NextResponse } from "next/server";
import { frontendRemoteRead } from "@/lib/frontend-data";
import { withFrontendReadRequest } from "@/lib/next-frontend-request";
import { remoteConfiguration } from "@/lib/data-source";
import { RemoteDataError } from "@/lib/remote-errors";
async function readGET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    remoteConfiguration();
    const path = "/" + (await params).path.join("/");
    const result = await frontendRemoteRead(
      path,
      new URL(request.url).searchParams,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code:
            error instanceof RemoteDataError
              ? error.code
              : "REMOTE_UNAVAILABLE",
        },
      },
      {
        status: error instanceof RemoteDataError ? error.status : 503,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof RemoteDataError && error.status === 429
            ? { "Retry-After": "60" }
            : {}),
        },
      },
    );
  }
}
export async function GET(
  request: Request,
  context: Parameters<typeof readGET>[1],
) {
  return withFrontendReadRequest(() => readGET(request, context));
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const response = await GET(request, context);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
